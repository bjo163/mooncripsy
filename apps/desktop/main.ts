import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { AgentSession } from "../../src/session/agent-session.js";
import { ProviderAccountStore } from "../../src/browser/provider-account-store.js";
import {
  createWebAdapter,
  getProvider,
  listActiveProviderIds,
} from "../../src/browser/provider-registry.js";
import { launchNativeLoginBrowser } from "../../src/browser/native-login.js";
import { discoverChromeExecutable } from "../../src/platform/chrome-discovery.js";
import { getAppDataDir, getSessionsDir } from "../../src/platform/paths.js";
import { replaceFileAtomic } from "../../src/shared/atomic-write.js";
import { EXPORTERS } from "../../src/session/session-export.js";
import {
  isDeveloper,
  messageText,
} from "../../src/session/canonical-transcript.js";
import { stripSystemMarkers } from "../../src/protocol/markers.js";
import { ConversationRunner } from "../../src/runtime/conversation-runner.js";
import type {
  AgentApproval,
  AgentEvent,
  AppInfo,
  ApprovalResponse,
  DesktopEvents,
  ProviderAccount,
  SetupCheck,
  SessionTranscript,
  TranscriptItem,
} from "./src/types.js";

type DesktopIpc = {
  "app:info": { args: []; result: AppInfo };
  "app:diagnose": { args: []; result: SetupCheck[] };
  "app:open-external": { args: [url: string]; result: void };
  "app:clipboard-write": { args: [text: string]; result: void };
  "project:choose": { args: []; result: string | null };
  "projects:recent": { args: []; result: Awaited<ReturnType<typeof listRecentProjects>> };
  "projects:remember": { args: [projectRoot: string]; result: void };
  "accounts:list": { args: []; result: ProviderAccount[] };
  "accounts:create": {
    args: [account: { providerId: string; label: string }];
    result: ProviderAccount;
  };
  "accounts:delete": {
    args: [accountId: string];
    result: { accountId: string; profileCleanupError: string | null };
  };
  "accounts:open-login": {
    args: [accountId: string];
    result: { accountId: string; pid: number | undefined };
  };
  "accounts:verify-login": {
    args: [accountId: string];
    result: { accountId: string; authenticated: boolean };
  };
  "sessions:list": { args: []; result: Awaited<ReturnType<typeof listSessions>> };
  "sessions:transcript": {
    args: [sessionId: string];
    result: SessionTranscript;
  };
  "sessions:export": {
    args: [request: { sessionId: string; format: "codex" | "claude-code" }];
    result: { canceled: boolean; filePath: string | null };
  };
  "sessions:start": {
    args: [request: { projectRoot: string; accountId: string; task: string }];
    result: { sessionId: string };
  };
  "sessions:send": {
    args: [request: { sessionId: string; text: string }];
    result: unknown;
  };
  "sessions:resume": { args: [sessionId: string]; result: unknown };
  "sessions:rebind-account": {
    args: [request: { sessionId: string; accountId: string }];
    result: boolean;
  };
  "sessions:cancel": { args: [sessionId: string]; result: boolean };
  "agent:approve": { args: [approval: ApprovalResponse]; result: boolean };
};

type CanonicalItem = {
  type?: string;
  role?: string;
  name?: string;
  arguments?: string;
  output?: string;
  [key: string]: unknown;
};

type DesktopRunnerOptions = {
  session: InstanceType<typeof AgentSession>;
  options: {
    home: string;
    profileDir: string;
    chromePath: undefined;
    modelTurnTimeoutMs: undefined;
    minimize: boolean;
    debug: boolean;
    once: boolean;
  };
  interactive: boolean;
  renderer: typeof silentRenderer;
  onEvent(event: AgentEvent): Promise<void>;
  onApproval(input: {
    toolCall: { name: string; args: unknown };
    reasons: string[];
  }): Promise<boolean>;
};

const DesktopConversationRunner = ConversationRunner as unknown as {
  new(options: DesktopRunnerOptions): InstanceType<typeof ConversationRunner>;
};
const createAgentSession = AgentSession.create as unknown as (options: {
  sessionsDir: string;
  tasksDir: string;
  task: string;
  projectRoot: string;
  provider: string;
  accountId: string;
  mode: null;
}) => Promise<InstanceType<typeof AgentSession>>;

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const rendererFile = path.join(currentDirectory, "index.html");
const appDataDir = getAppDataDir();
const sessionsDir = getSessionsDir(appDataDir);
const accountStore = new ProviderAccountStore({ appDataDir });
const runners = new Map<string, InstanceType<typeof ConversationRunner>>();
const activeRuns = new Set<string>();
const sessionMutations = new Set<string>();
const startingAccounts = new Map<string, number>();
const deletingAccounts = new Set<string>();
const accountOperations = new Set<string>();
const loginBrowsers = new Map<
  string,
  Awaited<ReturnType<typeof launchNativeLoginBrowser>>
>();
const pendingApprovals = new Map<string, (approved: boolean) => void>();
let mainWindow: BrowserWindow | null = null;
let quitting = false;
let recentProjectsQueue: Promise<void> = Promise.resolve();

function beginAccountStart(accountId: string): void {
  startingAccounts.set(accountId, (startingAccounts.get(accountId) ?? 0) + 1);
}

function finishAccountStart(accountId: string): void {
  const remaining = (startingAccounts.get(accountId) ?? 1) - 1;
  if (remaining > 0) {
    startingAccounts.set(accountId, remaining);
  } else {
    startingAccounts.delete(accountId);
  }
}

const silentRenderer = Object.freeze({
  handle() {},
  hint() {},
  stopSpinner() {},
  finish() {},
});

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  const parsed = new URL(senderUrl);
  const senderPath = parsed.protocol === "file:" ? fileURLToPath(parsed) : "";
  const matchesRenderer = process.platform === "win32"
    ? senderPath.toLowerCase() === rendererFile.toLowerCase()
    : senderPath === rendererFile;
  if (!matchesRenderer) {
    throw new Error("Untrusted desktop IPC sender.");
  }
}

function registerHandler<K extends keyof DesktopIpc>(
  channel: K,
  handler: (
    ...args: DesktopIpc[K]["args"]
  ) => DesktopIpc[K]["result"] | Promise<DesktopIpc[K]["result"]>,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event);
    return await handler(...args as DesktopIpc[K]["args"]);
  });
}

function publish<K extends keyof DesktopEvents>(
  channel: K,
  payload: DesktopEvents[K],
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}

function publicAccount(account: Awaited<ReturnType<typeof accountStore.get>>): ProviderAccount {
  const { profileDir: _profileDir, ...visible } = account;
  return {
    ...visible,
    providerLabel: getProvider(account.providerId).label,
  };
}

async function listAccounts(): Promise<ProviderAccount[]> {
  return (await accountStore.list()).map(publicAccount);
}

async function getAccountForSession(session: InstanceType<typeof AgentSession>) {
  if (session.state.accountId && deletingAccounts.has(session.state.accountId)) {
    throw new Error("This provider account is being removed. Try again when the operation finishes.");
  }
  const accounts = await accountStore.list();
  if (session.state.accountId) {
    if (deletingAccounts.has(session.state.accountId)) {
      throw new Error("This provider account is being removed. Try again when the operation finishes.");
    }
    const account = accounts.find((item) => item.id === session.state.accountId);
    if (!account) {
      throw new Error(
        `Session ${session.sessionId} refers to missing provider account ${session.state.accountId}.`,
      );
    }
    if (account.providerId !== session.state.provider) {
      throw new Error("Session provider does not match its saved account.");
    }
    return account;
  }
  return accounts.find((item) =>
    item.providerId === (session.state.provider ?? "chatgpt") && item.isDefault
  );
}

async function createRunner(session: InstanceType<typeof AgentSession>) {
  const account = await getAccountForSession(session);
  if (!account) {
    throw new Error(`No provider account is configured for session ${session.sessionId}.`);
  }
  const options = {
    home: appDataDir,
    profileDir: account.profileDir,
    chromePath: undefined,
    modelTurnTimeoutMs: undefined,
    minimize: false,
    debug: false,
    once: true,
  };
  return new DesktopConversationRunner({
    session,
    options,
    interactive: false,
    renderer: silentRenderer,
    onEvent: async (event) => {
      publish("agent:event", { sessionId: session.sessionId, event });
    },
    onApproval: async ({ toolCall, reasons }) => {
      const approvalId = randomUUID();
      const approval: AgentApproval = {
        sessionId: session.sessionId,
        approvalId,
        toolCall: { name: toolCall.name, args: toolCall.args },
        reasons,
      };
      publish("agent:approval-required", approval);
      return await new Promise<boolean>((resolve) => {
        const finish = (approved: boolean) => {
          clearTimeout(timer);
          pendingApprovals.delete(approvalId);
          resolve(approved);
        };
        const timer = setTimeout(() => finish(false), 10 * 60_000);
        timer.unref?.();
        pendingApprovals.set(approvalId, finish);
      });
    },
  });
}

async function getRunner(sessionId: string) {
  const current = runners.get(sessionId);
  if (current) {
    if (
      current.session.state.accountId
      && deletingAccounts.has(current.session.state.accountId)
    ) {
      throw new Error("This provider account is being removed. Try again when the operation finishes.");
    }
    return current;
  }
  const session = await AgentSession.load({
    sessionsDir,
    tasksDir: sessionsDir,
    sessionId,
    taskId: sessionId,
  });
  const runner = await createRunner(session);
  runners.set(sessionId, runner);
  return runner;
}

function errorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runTurn(
  sessionId: string,
  {
    resume,
    instruction = null,
    beforeRun = null,
  }: {
    resume: boolean;
    instruction?: string | null;
    beforeRun?: ((runner: InstanceType<typeof ConversationRunner>) => Promise<void>) | null;
  },
): Promise<unknown> {
  if (activeRuns.has(sessionId) || sessionMutations.has(sessionId)) {
    throw new Error("This session already has a turn in progress.");
  }
  activeRuns.add(sessionId);
  publish("agent:turn-started", { sessionId });
  try {
    const runner = await getRunner(sessionId);
    await beforeRun?.(runner);
    const result = await runner.runTurn({ resume, instruction });
    publish("agent:turn-finished", { sessionId, result: result ?? null });
    return result;
  } catch (error) {
    publish("agent:turn-failed", {
      sessionId,
      message: errorMessage(error),
      code: errorCode(error),
    });
    throw error;
  } finally {
    activeRuns.delete(sessionId);
  }
}

function transcriptForUi(transcript: {
  items?: Array<{ timestamp: string; item: CanonicalItem }>;
}): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  for (const { timestamp, item } of transcript.items ?? []) {
    if (isDeveloper(item)) {
      continue;
    }
    if (item.type === "message") {
      const text = item.role === "user"
        ? stripSystemMarkers(messageText(item))
        : messageText(item);
      if (!text.trim()) {
        continue;
      }
      items.push({
        timestamp,
        type: "message",
        role: item.role === "user" ? "user" : "assistant",
        text,
      });
      continue;
    }
    if (item.type === "function_call") {
      items.push({
        timestamp,
        type: "tool_call",
        name: item.name ?? "",
        arguments: item.arguments ?? "",
      });
      continue;
    }
    if (item.type === "function_call_output") {
      items.push({
        timestamp,
        type: "tool_result",
        name: item.name,
        output: typeof item.output === "string" ? item.output : "",
      });
    }
  }
  return items;
}

registerHandler("app:info", async () => ({
  name: "moncripsy Desktop",
  version: app.getVersion(),
  providers: listActiveProviderIds().map((id) => {
    const provider = getProvider(id);
    return { id, label: provider.label };
  }),
  appDataDir,
}));

registerHandler("app:diagnose", async () => {
  const checks: SetupCheck[] = [];
  try {
    checks.push({
      id: "browser",
      label: "Chrome / Chromium",
      status: "ok",
      detail: discoverChromeExecutable(),
      action: null,
    });
  } catch (error) {
    checks.push({
      id: "browser",
      label: "Chrome / Chromium",
      status: "error",
      detail: errorMessage(error),
      action: "Install Chrome or Chromium, or set moncripsy_CHROME_PATH and restart the app.",
    });
  }

  const probePath = path.join(appDataDir, `.desktop-health-${randomUUID()}.tmp`);
  try {
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(probePath, "ok", { flag: "wx", mode: 0o600 });
    await fs.rm(probePath);
    checks.push({
      id: "storage",
      label: "Local app data",
      status: "ok",
      detail: `${appDataDir} is writable; session storage is available.`,
      action: null,
    });
  } catch (error) {
    await fs.rm(probePath, { force: true }).catch((cleanupError) => {
      console.error(`Could not remove setup-check file ${probePath}: ${errorMessage(cleanupError)}`);
    });
    checks.push({
      id: "storage",
      label: "Local app data",
      status: "error",
      detail: errorMessage(error),
      action: "Check folder permissions and available disk space, then retry.",
    });
  }

  const accounts = await accountStore.list();
  checks.push({
    id: "accounts",
    label: "Provider profiles",
    status: accounts.length ? "ok" : "warning",
    detail: accounts.length
      ? `${accounts.length} local profile${accounts.length === 1 ? "" : "s"} configured. Login status is checked per account.`
      : "No provider profiles are configured.",
    action: accounts.length ? null : "Add a provider account and verify its login from Accounts.",
  });
  return checks;
});

registerHandler("app:open-external", async (rawUrl) => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new Error(`Invalid external URL: ${errorMessage(error)}`, { cause: error });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`External links using ${url.protocol} are not allowed.`);
  }
  await shell.openExternal(url.toString());
});

registerHandler("app:clipboard-write", async (text) => {
  if (typeof text !== "string" || text.length > 1_000_000) {
    throw new Error("Clipboard text must be at most 1000000 characters.");
  }
  clipboard.writeText(text);
});

registerHandler("project:choose", async () => {
  if (!mainWindow) {
    throw new Error("The desktop window is not available.");
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Choose a project folder",
  });
  return result.canceled ? null : result.filePaths[0];
});

async function readRecentProjectPaths(): Promise<string[]> {
  const filePath = path.join(appDataDir, "recent-projects.json");
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (
      !Array.isArray(parsed)
      || parsed.length > 10
      || parsed.some((item) => typeof item !== "string" || !path.isAbsolute(item))
    ) {
      throw new Error("Recent project data has an invalid format.");
    }
    return parsed;
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return [];
    }
    throw new Error(`Could not read recent projects: ${errorMessage(error)}`, { cause: error });
  }
}

async function listRecentProjects() {
  const paths = await readRecentProjectPaths();
  return await Promise.all(paths.map(async (projectRoot) => {
    try {
      return {
        projectRoot,
        available: (await fs.stat(projectRoot)).isDirectory(),
      };
    } catch (error) {
      if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR") {
        return { projectRoot, available: false };
      }
      throw error;
    }
  }));
}

async function rememberRecentProject(projectRoot: string): Promise<void> {
  const requestedRoot = String(projectRoot ?? "").trim();
  if (!requestedRoot) {
    throw new Error("Project directory cannot be empty.");
  }
  const normalizedRoot = path.resolve(requestedRoot);
  if (!(await fs.stat(normalizedRoot)).isDirectory()) {
    throw new Error(`Project path is not a directory: ${normalizedRoot}`);
  }

  const save = recentProjectsQueue.then(async () => {
    const paths = await readRecentProjectPaths();
    const samePath = (candidate: string) => process.platform === "win32"
      ? candidate.toLowerCase() === normalizedRoot.toLowerCase()
      : candidate === normalizedRoot;
    const next = [
      normalizedRoot,
      ...paths.filter((candidate) => !samePath(candidate)),
    ].slice(0, 10);
    await fs.mkdir(appDataDir, { recursive: true });
    const filePath = path.join(appDataDir, "recent-projects.json");
    const temporary = `${filePath}.${process.pid}-${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      await replaceFileAtomic(temporary, filePath);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => null);
    }
  });
  recentProjectsQueue = save.then(() => undefined, () => undefined);
  await save;
}

registerHandler("projects:recent", listRecentProjects);
registerHandler("projects:remember", async (projectRoot) => {
  await rememberRecentProject(projectRoot);
});

registerHandler("accounts:list", listAccounts);

registerHandler("accounts:create", async ({ providerId, label }) => {
  const account = await accountStore.create({ providerId, label });
  return publicAccount(account);
});

registerHandler("accounts:delete", async (accountId) => {
  const account = await accountStore.get(accountId);
  if (account.isDefault) {
    throw new Error("The default account profile is shared with the CLI and cannot be deleted.");
  }
  if (deletingAccounts.has(accountId)) {
    throw new Error("This provider account is already being removed.");
  }
  deletingAccounts.add(accountId);
  try {
    if (startingAccounts.has(accountId)) {
      throw new Error("A session is being created with this account. Try again after it starts.");
    }
    if (accountOperations.has(accountId)) {
      throw new Error("This account is currently opening or verifying a login. Try again when it finishes.");
    }
    const sessions = await AgentSession.list({ sessionsDir, tasksDir: sessionsDir });
    const activeSession = sessions.find((session) => (
      session.accountId === accountId && activeRuns.has(session.sessionId)
    )) ?? [...runners.entries()].find(([sessionId, runner]) =>
      runner.session.state.accountId === accountId && activeRuns.has(sessionId)
    )?.[0];
    if (activeSession) {
      throw new Error("This account is currently in use by an active session. Cancel or finish that turn first.");
    }

    for (const session of sessions) {
      const runner = runners.get(session.sessionId);
      if (session.accountId === accountId && runner) {
        await runner.close();
        runners.delete(session.sessionId);
      }
    }
    for (const [sessionId, runner] of runners) {
      if (runner.session.state.accountId === accountId) {
        await runner.close();
        runners.delete(sessionId);
      }
    }

    const loginBrowser = loginBrowsers.get(accountId);
    if (loginBrowser) {
      await loginBrowser.close();
      loginBrowsers.delete(accountId);
    }
    return await accountStore.deleteCustom(accountId);
  } finally {
    deletingAccounts.delete(accountId);
  }
});

registerHandler("accounts:open-login", async (accountId) => {
  if (deletingAccounts.has(accountId)) {
    throw new Error("This provider account is being removed.");
  }
  if (loginBrowsers.has(accountId) || accountOperations.has(accountId)) {
    throw new Error("The login browser for this account is already open.");
  }
  accountOperations.add(accountId);
  try {
    const account = await accountStore.get(accountId);
    if (deletingAccounts.has(accountId)) {
      throw new Error("This provider account is being removed.");
    }
    const provider = getProvider(account.providerId);
    const browser = await launchNativeLoginBrowser({
      profileDir: account.profileDir,
      chromePath: undefined,
      url: provider.baseUrl,
    });
    loginBrowsers.set(accountId, browser);
    return { accountId, pid: browser.pid };
  } finally {
    accountOperations.delete(accountId);
  }
});

registerHandler("accounts:verify-login", async (accountId) => {
  if (deletingAccounts.has(accountId)) {
    throw new Error("This provider account is being removed.");
  }
  if (accountOperations.has(accountId)) {
    throw new Error("A login operation is already in progress for this account.");
  }
  accountOperations.add(accountId);
  try {
    const account = await accountStore.get(accountId);
    if (deletingAccounts.has(accountId)) {
      throw new Error("This provider account is being removed.");
    }
    const loginBrowser = loginBrowsers.get(accountId);
    if (loginBrowser) {
      loginBrowsers.delete(accountId);
      await loginBrowser.close();
    }
    const adapter = createWebAdapter({
      provider: account.providerId,
      profileDir: account.profileDir,
      minimized: false,
    });
    try {
      await adapter.launch();
      return {
        accountId,
        authenticated: await adapter.getAuthState() === "authenticated",
      };
    } finally {
      await adapter.close();
    }
  } finally {
    accountOperations.delete(accountId);
  }
});

async function listSessions() {
  const sessions = await AgentSession.list({
    sessionsDir,
    tasksDir: sessionsDir,
    limit: Number.POSITIVE_INFINITY,
  });
  const accounts = await accountStore.list();
  return sessions.map((session) => {
    const account = accounts.find((item) => item.id === session.accountId);
    return {
      sessionId: session.sessionId,
      task: session.task,
      projectRoot: session.projectRoot,
      provider: session.provider,
      accountId: session.accountId ?? null,
      accountLabel: account?.label ?? null,
      accountMissing: Boolean(session.accountId && !account),
      requiresRecovery: session.pendingOutbound != null
        || session.pendingAssistantTurn != null,
      lastError: session.lastError ?? null,
      isRunning: activeRuns.has(session.sessionId),
      phase: session.phase,
      turn: session.turn,
      updatedAt: session.updatedAt,
    };
  });
}

registerHandler("sessions:list", listSessions);

registerHandler("sessions:transcript", async (sessionId) => {
  const session = await AgentSession.load({
    sessionsDir,
    tasksDir: sessionsDir,
    sessionId,
    taskId: sessionId,
  });
  const transcript = await session.readTranscript();
  const accounts = await accountStore.list();
  let activity: Awaited<ReturnType<typeof session.readEvents>> = [];
  let activityError: string | null = null;
  try {
    activity = await session.readEvents({ limit: 500 });
  } catch (error) {
    activityError = errorMessage(error);
  }
  return {
    session: {
      sessionId: session.sessionId,
      task: session.state.task,
      projectRoot: session.state.projectRoot,
      provider: session.state.provider,
      accountId: session.state.accountId ?? null,
      accountMissing: Boolean(
        session.state.accountId
        && !accounts.some((item) => item.id === session.state.accountId),
      ),
      phase: session.state.phase,
      lastError: session.state.lastError ?? null,
      requiresRecovery: session.state.pendingOutbound != null
        || session.state.pendingAssistantTurn != null,
    },
    items: transcriptForUi(transcript),
    activity,
    activityError,
  };
});

registerHandler("sessions:export", async ({ sessionId, format }) => {
  const exporter = EXPORTERS[format];
  if (!exporter) {
    throw new Error(`Unsupported session export format: ${format}`);
  }
  const session = await AgentSession.load({
    sessionsDir,
    tasksDir: sessionsDir,
    sessionId,
    taskId: sessionId,
  });
  const transcript = await session.readTranscript();
  if (transcript.items.length === 0) {
    throw new Error(`Session ${sessionId} has no transcript to export.`);
  }
  if (!mainWindow) {
    throw new Error("The desktop window is not available.");
  }
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "Export session transcript",
    defaultPath: `moncripsy-${session.sessionId}-${format}.jsonl`,
    filters: [{ name: "JSON Lines", extensions: ["jsonl"] }],
  });
  if (canceled || !filePath) {
    return { canceled: true, filePath: null };
  }
  await fs.writeFile(filePath, exporter(transcript, { sessionId: session.sessionId }), {
    mode: 0o600,
  });
  return { canceled: false, filePath };
});

registerHandler("sessions:start", async ({ projectRoot, accountId, task }) => {
  const requestedRoot = String(projectRoot ?? "").trim();
  if (!requestedRoot) {
    throw new Error("Choose a project directory before starting a session.");
  }
  if (typeof accountId !== "string" || !accountId) {
    throw new Error("Choose a provider account before starting a session.");
  }
  if (deletingAccounts.has(accountId)) {
    throw new Error("This provider account is being removed. Choose another account.");
  }
  beginAccountStart(accountId);
  try {
    const root = path.resolve(requestedRoot);
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
      throw new Error(`Project path is not a directory: ${root}`);
    }
    const account = await accountStore.get(accountId);
    if (deletingAccounts.has(accountId)) {
      throw new Error("This provider account is being removed. Choose another account.");
    }
    const initialTask = String(task ?? "").trim();
    if (!initialTask || initialTask.length > 100_000) {
      throw new Error("Task must contain between 1 and 100000 characters.");
    }
    await rememberRecentProject(root);
    const session = await createAgentSession({
      sessionsDir,
      tasksDir: sessionsDir,
      task: initialTask,
      projectRoot: root,
      provider: account.providerId,
      accountId: account.id,
      mode: null,
    });
    void runTurn(session.sessionId, { resume: false }).catch(() => null);
    return { sessionId: session.sessionId };
  } finally {
    finishAccountStart(accountId);
  }
});

registerHandler("sessions:send", async ({ sessionId, text }) => {
  const instruction = String(text ?? "").trim();
  if (!instruction || instruction.length > 100_000) {
    throw new Error("Message must contain between 1 and 100000 characters.");
  }
  return await runTurn(sessionId, {
    resume: true,
    instruction,
    beforeRun: async (runner) => {
      if (
        runner.session.state.pendingOutbound != null
        || runner.session.state.pendingAssistantTurn != null
      ) {
        throw new Error("This session needs a bare recovery resume before another message.");
      }
      await runner.session.appendInstruction(instruction);
    },
  });
});

registerHandler("sessions:resume", async (sessionId) => {
  return await runTurn(sessionId, { resume: true });
});

registerHandler("sessions:rebind-account", async ({ sessionId, accountId }) => {
  if (activeRuns.has(sessionId) || sessionMutations.has(sessionId)) {
    throw new Error("Finish or cancel the active turn before changing its provider account.");
  }
  if (deletingAccounts.has(accountId)) {
    throw new Error("This provider account is being removed.");
  }
  sessionMutations.add(sessionId);
  beginAccountStart(accountId);
  try {
    const session = await AgentSession.load({
      sessionsDir,
      tasksDir: sessionsDir,
      sessionId,
      taskId: sessionId,
    });
    if (!session.state.accountId) {
      throw new Error("This session does not have a missing account to replace.");
    }
    const previousAccountId = session.state.accountId;
    const existingAccounts = await accountStore.list();
    if (existingAccounts.some((item) => item.id === previousAccountId)) {
      throw new Error("The session's original provider account is still available.");
    }
    const account = await accountStore.get(accountId);
    if (deletingAccounts.has(accountId)) {
      throw new Error("This provider account is being removed.");
    }
    if (account.providerId !== session.state.provider) {
      throw new Error("Choose an account for the same provider as this session.");
    }
    await session.update({ accountId: account.id });
    await session.appendEvent("provider_account_rebound", {
      previousAccountId,
      accountId: account.id,
    });
    return true;
  } finally {
    sessionMutations.delete(sessionId);
    finishAccountStart(accountId);
  }
});

registerHandler("sessions:cancel", async (sessionId) => {
  const runner = runners.get(sessionId);
  if (!runner || !activeRuns.has(sessionId)) {
    return false;
  }
  runner.interrupted = true;
  runner.adapter.escCancelRequested = true;
  return true;
});

registerHandler("agent:approve", async ({ approvalId, approved }) => {
  const finish = pendingApprovals.get(approvalId);
  if (!finish) {
    return false;
  }
  finish(Boolean(approved));
  return true;
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 920,
    minHeight: 640,
    backgroundColor: "#111318",
    title: "moncripsy Desktop",
    webPreferences: {
      preload: path.join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:" || fileURLToPath(parsed) !== rendererFile) {
      event.preventDefault();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  void mainWindow.loadFile(rendererFile);
}

async function closeResources(): Promise<void> {
  for (const finish of pendingApprovals.values()) {
    finish(false);
  }
  for (const browser of loginBrowsers.values()) {
    await browser.close().catch(() => null);
  }
  loginBrowsers.clear();
  await Promise.all([...runners.values()].map((runner) =>
    runner.close({ keepBrowser: true }).catch(() => null)
  ));
  runners.clear();
}

app.whenReady().then(async () => {
  await accountStore.list();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", (event) => {
  if (quitting) {
    return;
  }
  event.preventDefault();
  quitting = true;
  void closeResources().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

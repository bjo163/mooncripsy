import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";
import { getSessionsDir } from "../src/platform/paths.js";
import { AgentSession } from "../src/session/agent-session.js";

const executablePath = process.env.MONCRIPSY_DESKTOP_EXECUTABLE;

test("packaged Windows desktop app starts and exposes offline account/project flows", {
  skip: process.platform !== "win32" || !executablePath,
}, async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "moncripsy-desktop-smoke-"));
  const appHome = path.join(tempDir, "app-data");
  const projectRoot = path.join(tempDir, "project");
  await fs.mkdir(projectRoot);
  const sessionsDir = getSessionsDir(appHome);
  const seededSession = await AgentSession.create({
    sessionsDir,
    tasksDir: sessionsDir,
    task: "Offline smoke session",
    projectRoot,
    provider: "chatgpt",
    accountId: "default-chatgpt",
    mode: null,
  });
  await seededSession.appendEvent("tool.claimed", { name: "read_file" });
  await seededSession.appendTranscriptItem({
    type: "message",
    role: "assistant",
    content: [{
      type: "output_text",
      text: "## Safe Markdown Smoke\n\n```ts\nconst ready: boolean = true;\n```",
    }],
  });

  const desktop = await electron.launch({
    executablePath: path.resolve(executablePath),
    env: { ...process.env, moncripsy_HOME: appHome },
    timeout: 45_000,
  });
  t.after(async () => {
    await desktop.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const window = await desktop.firstWindow();
  await window.getByRole("heading", { name: "Start a task" }).waitFor();

  const result = await window.evaluate(async ({ requestedProjectRoot, requestedSessionId }) => {
    const info = await window.moncripsy.getAppInfo();
    const defaults = await window.moncripsy.listAccounts();
    const setupChecks = await window.moncripsy.diagnoseSetup();
    const sessions = await window.moncripsy.listSessions();
    const transcript = await window.moncripsy.getTranscript(requestedSessionId);
    const account = await window.moncripsy.createAccount({
      providerId: "chatgpt",
      label: "Packaged smoke test",
    });
    await window.moncripsy.rememberProject(requestedProjectRoot);
    const recentProjects = await window.moncripsy.listRecentProjects();
    const deletion = await window.moncripsy.deleteAccount(account.id);
    const accountsAfterDelete = await window.moncripsy.listAccounts();
    return {
      appDataDir: info.appDataDir,
      hasDefault: defaults.some((item) => item.isDefault),
      recentProjects,
      storageCheck: setupChecks.find((check) => check.id === "storage"),
      seededSessionListed: sessions.some((item) => item.sessionId === requestedSessionId),
      activity: transcript.activity.map((event) => event.type),
      cleanupError: deletion.profileCleanupError,
      deletedAccountStillPresent: accountsAfterDelete.some((item) => item.id === account.id),
    };
  }, {
    requestedProjectRoot: projectRoot,
    requestedSessionId: seededSession.sessionId,
  });

  assert.equal(result.appDataDir, appHome);
  assert.equal(result.hasDefault, true);
  assert.deepEqual(result.recentProjects, [{ projectRoot, available: true }]);
  assert.equal(result.storageCheck?.status, "ok");
  assert.equal(result.seededSessionListed, true);
  assert.ok(result.activity.includes("tool.claimed"));
  assert.equal(result.cleanupError, null);
  assert.equal(result.deletedAccountStillPresent, false);

  await window.getByRole("link", { name: "Sessions" }).click();
  await window.getByRole("heading", { name: "Session workbench" }).waitFor();
  await window.getByRole("button", { name: "Refresh" }).waitFor();
  await window.getByRole("textbox", { name: "Search sessions" }).fill("Offline smoke session");
  await window.getByRole("link", { name: /Offline smoke session/ }).click();
  await window.getByRole("heading", { name: "Offline smoke session" }).waitFor();
  await window.getByRole("heading", { name: "Safe Markdown Smoke" }).waitFor();
  await window.getByRole("button", { name: "Copy assistant message" }).click();
  await window.getByText("Message copied.").waitFor();
  await window.locator(".message-content pre code").getByText("const ready: boolean = true;").waitFor();
  await window.getByText("Activity timeline").click();
  await window.getByText("Tool started · read_file").waitFor();
  await window.getByRole("link", { name: "Accounts" }).click();
  await window.getByRole("heading", { name: "Provider accounts" }).waitFor();
  await window.getByRole("link", { name: "Settings" }).click();
  await window.getByRole("heading", { name: "Settings" }).waitFor();
  await window.getByRole("button", { name: "Run checks" }).click();
  await window.getByText("Chrome / Chromium").waitFor();
  await window.getByText("Local app data").waitFor();
});

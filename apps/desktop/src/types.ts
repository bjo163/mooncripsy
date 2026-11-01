import type { Dispatch, SetStateAction } from "react";

export interface ProviderInfo {
  id: string;
  label: string;
}

export interface AppInfo {
  name: string;
  version: string;
  providers: ProviderInfo[];
  appDataDir: string;
}

export interface ProviderAccount {
  id: string;
  providerId: string;
  providerLabel: string;
  label: string;
  isDefault: boolean;
}

export interface RecentProject {
  projectRoot: string;
  available: boolean;
}

export interface SetupCheck {
  id: string;
  label: string;
  status: "ok" | "warning" | "error";
  detail: string;
  action: string | null;
}

export interface SessionActivity {
  sessionId: string;
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface SessionListItem {
  sessionId: string;
  task: string;
  projectRoot: string;
  provider: string;
  accountId: string | null;
  accountLabel: string | null;
  accountMissing: boolean;
  requiresRecovery: boolean;
  lastError: string | null;
  isRunning: boolean;
  phase: string;
  turn: number;
  updatedAt: string;
}

export type TranscriptItem =
  | {
    timestamp: string;
    type: "message";
    role: "user" | "assistant";
    text: string;
  }
  | {
    timestamp: string;
    type: "tool_call";
    name: string;
    arguments: string;
  }
  | {
    timestamp: string;
    type: "tool_result";
    name?: string;
    output: string;
  };

export interface SessionTranscript {
  session: {
    sessionId: string;
    task: string;
    projectRoot: string;
    provider: string;
    accountId: string | null;
    accountMissing: boolean;
    phase: string;
    requiresRecovery: boolean;
    lastError: string | null;
  };
  items: TranscriptItem[];
  activity: SessionActivity[];
  activityError: string | null;
}

export interface AgentEvent {
  type: string;
  timestamp?: string;
  sessionId?: string;
  payload?: {
    message?: string;
    name?: string;
    [key: string]: unknown;
  };
}

export interface AgentApproval {
  sessionId: string;
  approvalId: string;
  toolCall: {
    name: string;
    args: unknown;
  };
  reasons: string[];
}

export interface DesktopEvents {
  "agent:event": { sessionId: string; event: AgentEvent };
  "agent:approval-required": AgentApproval;
  "agent:turn-started": { sessionId: string };
  "agent:turn-finished": { sessionId: string; result: unknown };
  "agent:turn-failed": { sessionId: string; message: string; code: string | null };
}

export interface StartSessionRequest {
  projectRoot: string;
  accountId: string;
  task: string;
}

export interface SendMessageRequest {
  sessionId: string;
  text: string;
}

export interface ApprovalResponse {
  approvalId: string;
  approved: boolean;
}

export interface DesktopBridge {
  getAppInfo(): Promise<AppInfo>;
  openExternal(url: string): Promise<void>;
  copyText(text: string): Promise<void>;
  diagnoseSetup(): Promise<SetupCheck[]>;
  chooseProject(): Promise<string | null>;
  listRecentProjects(): Promise<RecentProject[]>;
  rememberProject(projectRoot: string): Promise<void>;
  listAccounts(): Promise<ProviderAccount[]>;
  createAccount(account: { providerId: string; label: string }): Promise<ProviderAccount>;
  deleteAccount(accountId: string): Promise<{ accountId: string; profileCleanupError: string | null }>;
  openLogin(accountId: string): Promise<{ accountId: string; pid: number | undefined }>;
  verifyLogin(accountId: string): Promise<{ accountId: string; authenticated: boolean }>;
  listSessions(): Promise<SessionListItem[]>;
  getTranscript(sessionId: string): Promise<SessionTranscript>;
  exportSession(sessionId: string, format: "codex" | "claude-code"): Promise<{
    canceled: boolean;
    filePath: string | null;
  }>;
  startSession(request: StartSessionRequest): Promise<{ sessionId: string }>;
  sendMessage(request: SendMessageRequest): Promise<unknown>;
  resumeSession(sessionId: string): Promise<unknown>;
  rebindSessionAccount(request: { sessionId: string; accountId: string }): Promise<boolean>;
  cancelSession(sessionId: string): Promise<boolean>;
  respondToApproval(approval: ApprovalResponse): Promise<boolean>;
  onAgentEvent(listener: (event: DesktopEvents["agent:event"]) => void): () => void;
  onApprovalRequired(listener: (event: DesktopEvents["agent:approval-required"]) => void): () => void;
  onTurnStarted(listener: (event: DesktopEvents["agent:turn-started"]) => void): () => void;
  onTurnFinished(listener: (event: DesktopEvents["agent:turn-finished"]) => void): () => void;
  onTurnFailed(listener: (event: DesktopEvents["agent:turn-failed"]) => void): () => void;
}

export interface AppContextValue {
  info: AppInfo | null;
  providers: ProviderInfo[];
  accounts: ProviderAccount[];
  refreshAccounts(): Promise<ProviderAccount[]>;
  recentProjects: RecentProject[];
  refreshRecentProjects(): Promise<RecentProject[]>;
  eventsBySession: Record<string, AgentEvent[]>;
  busySessions: Set<string>;
  approvals: AgentApproval[];
  notify(message: string): void;
  setBusy(sessionId: string, busy: boolean): void;
  setApprovals: Dispatch<SetStateAction<AgentApproval[]>>;
}

declare global {
  interface Window {
    moncripsy: DesktopBridge;
  }
}

import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge, DesktopEvents } from "./src/types.js";

function subscribe<K extends keyof DesktopEvents>(
  channel: K,
  listener: (payload: DesktopEvents[K]) => void,
): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: DesktopEvents[K]) => {
    listener(payload);
  };
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const bridge: DesktopBridge = {
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  copyText: (text) => ipcRenderer.invoke("app:clipboard-write", text),
  diagnoseSetup: () => ipcRenderer.invoke("app:diagnose"),
  chooseProject: () => ipcRenderer.invoke("project:choose"),
  listRecentProjects: () => ipcRenderer.invoke("projects:recent"),
  rememberProject: (projectRoot) => ipcRenderer.invoke("projects:remember", projectRoot),
  listAccounts: () => ipcRenderer.invoke("accounts:list"),
  createAccount: (account) => ipcRenderer.invoke("accounts:create", account),
  deleteAccount: (accountId) => ipcRenderer.invoke("accounts:delete", accountId),
  openLogin: (accountId) => ipcRenderer.invoke("accounts:open-login", accountId),
  verifyLogin: (accountId) => ipcRenderer.invoke("accounts:verify-login", accountId),
  listSessions: () => ipcRenderer.invoke("sessions:list"),
  getTranscript: (sessionId) => ipcRenderer.invoke("sessions:transcript", sessionId),
  exportSession: (sessionId, format) =>
    ipcRenderer.invoke("sessions:export", { sessionId, format }),
  startSession: (request) => ipcRenderer.invoke("sessions:start", request),
  sendMessage: (request) => ipcRenderer.invoke("sessions:send", request),
  resumeSession: (sessionId) => ipcRenderer.invoke("sessions:resume", sessionId),
  rebindSessionAccount: (request) => ipcRenderer.invoke("sessions:rebind-account", request),
  cancelSession: (sessionId) => ipcRenderer.invoke("sessions:cancel", sessionId),
  respondToApproval: (approval) => ipcRenderer.invoke("agent:approve", approval),
  onAgentEvent: (listener) => subscribe("agent:event", listener),
  onApprovalRequired: (listener) => subscribe("agent:approval-required", listener),
  onTurnStarted: (listener) => subscribe("agent:turn-started", listener),
  onTurnFinished: (listener) => subscribe("agent:turn-finished", listener),
  onTurnFailed: (listener) => subscribe("agent:turn-failed", listener),
};

contextBridge.exposeInMainWorld("moncripsy", bridge);

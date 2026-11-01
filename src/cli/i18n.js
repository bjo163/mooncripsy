const SUPPORTED_LOCALES = Object.freeze([
  "en",
]);

const MESSAGES = Object.freeze({
  en: {
    "app.description": "Turn your web AI session into a local tool-using agent.",
    "option.home": "Application data directory",
    "option.profileDir": "Dedicated Chrome profile directory",
    "option.chromePath": "Chrome/Chromium executable",
    "option.project": "Project directory",
    "option.model": "Web AI provider: {providers} (default: {defaultProvider})",
    "option.once": "Run a single request and exit instead of a conversation",
    "option.type": "Request type: agent (default) or music (Gemini only)",
    "option.timeout": "Maximum wait for one model response (default: 10 minutes)",
    "option.noMinimize": "Keep the Chrome window visible instead of minimizing it",
    "option.debug": "Write browser diagnostics",
    "argument.task": "Initial request (optional; you can also type at the prompt)",
    "command.update": "Install the latest moncripsy from npm.",
    "command.doctor": "Check Node, Chrome, and local data directories.",
    "command.login": "Open the dedicated Chrome profile and wait for provider login (use --model to pick a provider).",
    "command.logout": "Delete the local Chrome profile to reset a provider session (use --model to pick a provider).",
    "command.resume": "Continue an existing session or recover an interrupted run.",
    "command.status": "List saved sessions or show one session as JSON.",
    "command.export": "Export a saved session to a Codex or Claude Code session.",
    "option.yes": "Skip the confirmation prompt",
    "argument.sessionId": "Saved session ID",
    "argument.instruction": "Optional follow-up instruction",
    "option.format": "codex or claude-code",
    "option.output": "Write to a file instead of stdout",
    "login.openingProfile": "Opening native Chrome profile: {profileDir}",
    "login.finishSignIn": "This window has no CDP flags. Finish until {provider} shows your signed-in home/chat history and no Log in button.",
    "login.pressEnterVerify": "After the signed-in {provider} home is visible, press Enter here to save and verify",
    "login.savingProfile": "Closing native Chrome and saving the dedicated profile...",
    "login.verified": "{provider} login verified through a fresh CDP connection.",
    "login.stillGuest": "{provider} is still in guest mode. Reopening native Chrome; complete the final {provider} sign-in/continue step.",
    "model.chooseInBrowser": "{provider} is signed in.\nYou can change the model in the browser.\nPress Enter to continue, or wait 5 seconds.",
    "model.continueCountdown": "Continuing in {seconds}s…",
    "model.continuing": "Continuing…",
    "model.setupCancelled": "Model selection confirmation cancelled.",
    "logout.none": "No Chrome profile found at {profileDir}; already logged out.",
    "logout.refuse": "Refusing to delete {profileDir}: it does not look like a moncripsy Chrome profile.",
    "logout.confirm": "This deletes the local {provider} session (Chrome profile at {profileDir}) and requires a new login. Continue?",
    "logout.cancelled": "Logout cancelled.",
    "logout.done": "Logged out. Removed {profileDir}.",
    "logout.loginAgainDefault": "Run `moncripsy login` to sign in again.",
    "logout.loginAgainProvider": "Run `moncripsy login --model {provider}` to sign in again.",
    "approval.required": "Approval required for {tool}:",
    "approval.how": "How should this action be handled?",
    "approval.once": "Allow once",
    "approval.alwaysTool": "Always allow {tool}",
    "approval.alwaysAll": "Always allow everything",
    "approval.deny": "Deny",
    "approval.savedTool": "Saved for this session: {tool} will always be allowed ({file}).",
    "approval.savedAll": "Saved for this session: every tool will always be allowed ({file}).",
    "profileLock.how": "How should this be handled?",
    "profileLock.kill": "Kill that session and continue",
    "profileLock.retry": "I closed its Chrome window; retry",
    "profileLock.quit": "Quit",
    "profileLock.stopping": "Stopping pid={pid}...",
    "session.forceQuit": "Force quitting.",
    "session.savedAt": "Session saved at: {directory}",
    "session.ctrlC": "Ctrl+C — cancelling. Press again to force quit.",
    "session.cancelledHint": "Turn cancelled. Type a new message or quit.",
    "session.recoveryHint": "Type /retry to recover the pending {provider} turn, or quit",
    "session.processesRunning": "Managed processes still running:",
    "session.resumeWith": "Resume this conversation with: moncripsy resume {sessionId}",
    "attachment.attaching": "Attaching: {files}",
    "attachment.notAttached": "Not attached ({details})",
    "update.prompt": "Update moncripsy from {currentVersion} to {latest} now?",
    "task.prompt": "Task",
    "task.required": "Please type a message.",
    "task.youPrompt": "you ›",
    "banner.controls": "Enter sends · Shift+Enter or Ctrl+J newline · ESC cancels processing · multiline paste · ↑/↓ history · \"exit\", Ctrl+C, or Ctrl+D quits",
    "status.none": "No sessions found.",
    "renderer.processing": "processing request",
    "renderer.running": "running {tool}",
    "renderer.chromeStarted": "Chrome started.",
    "renderer.loginRequired": "Log in to {provider} in the opened Chrome window…",
    "renderer.loginDetected": "{provider} login detected.",
    "renderer.conversationReady": "Conversation ready.",
    "renderer.noReply": "no reply from {provider}; asking it to continue ({retry}/{maxRetries})",
    "renderer.generationFailed": "{provider} generation failed (server error); asking it to retry ({retry}/{maxRetries})",
    "renderer.emptyResponse": "empty {provider} response; asking it to continue ({retry}/{maxRetries})",
    "renderer.limitReached": "{provider} usage limit reached. Wait for the limit to reset or change plans.",
    "renderer.plainAnswer": "The model answered without the XML protocol; showing the reply as the final answer.",
    "renderer.reused": "reused prior result for {tool}",
    "renderer.reusedUnknown": "reused (completion unknown) for {tool}",
    "renderer.conflictingReuse": "conflicting reuse for {tool}",
    "renderer.interrupted": "Run interrupted: {message}",
    "renderer.recoveryOpen": "{message} The session and Chrome window remain open.",
    "renderer.assistant": "assistant",
  },

});

function normalizeLocaleTag(value) {
  return "en";
}

function systemLocale() {
  const candidates = [
    process.env.moncripsy_LANG,
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
    Intl.DateTimeFormat().resolvedOptions().locale,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeLocaleTag(candidate);
    if (normalized) return normalized;
  }
  return "en";
}

function interpolate(template, variables = {}) {
  return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(variables, key)
      ? String(variables[key])
      : match
  ));
}

export function resolveLocale(value = null) {
  return normalizeLocaleTag(value) ?? (value == null ? systemLocale() : "en");
}

export function createI18n(locale = null) {
  const resolvedLocale = resolveLocale(locale);
  return Object.freeze({
    locale: resolvedLocale,
    t(key, variables = {}) {
      const localized = MESSAGES[resolvedLocale]?.[key];
      const fallback = MESSAGES.en[key];
      return interpolate(localized ?? fallback ?? key, variables);
    },
  });
}

export const MESSAGE_KEYS = Object.freeze(Object.keys(MESSAGES.en));

export function hasNativeTranslation(locale, key) {
  const resolvedLocale = resolveLocale(locale);
  return Object.prototype.hasOwnProperty.call(
    MESSAGES[resolvedLocale] ?? {},
    key,
  );
}

export const i18n = createI18n();
export const t = i18n.t;
export { SUPPORTED_LOCALES };

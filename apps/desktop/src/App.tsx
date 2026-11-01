import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent, ReactNode } from "react";
import {
  NavLink,
  Route,
  Routes,
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowRight,
  Bot,
  Check,
  Copy,
  FolderOpen,
  FolderTree,
  History,
  LoaderCircle,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  AgentApproval,
  AgentEvent,
  AppInfo,
  AppContextValue,
  ProviderAccount,
  RecentProject,
  SessionActivity,
  SessionListItem,
  SessionTranscript,
  TranscriptItem,
  SetupCheck,
} from "./types";

const AppContext = createContext<AppContextValue | null>(null);
const navItems = [
  { to: "/projects", label: "Projects", icon: FolderTree },
  { to: "/sessions", label: "Sessions", icon: History },
  { to: "/accounts", label: "Accounts", icon: UsersRound },
  { to: "/settings", label: "Settings", icon: Settings },
];

function useAppState() {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("App context is unavailable.");
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("field", className)}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function Notice({
  children,
  variant = "warning",
  className,
}: {
  children: ReactNode;
  variant?: "warning" | "info";
  className?: string;
}) {
  return (
    <div className={cn("notice", variant === "info" && "info", className)}>
      {children}
    </div>
  );
}

function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/projects" aria-label="moncripsy home">
          <span className="brand-mark"><Sparkles size={17} aria-hidden="true" /></span>
          <span className="brand-copy">
            <strong>moncripsy</strong>
            <small>DESKTOP WORKSPACE</small>
          </span>
        </Link>
        <nav className="nav-links" aria-label="Main navigation">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn("nav-link", isActive && "active")}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          <span>Local runtime</span>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">moncripsy Desktop</div>
          <div className="topbar-label">Web account · local tools</div>
        </header>
        <section className="view">{children}</section>
      </main>
    </div>
  );
}

function ProjectsPage() {
  const { accounts, notify, recentProjects, refreshRecentProjects } = useAppState();
  const navigate = useNavigate();
  const [recentSessions, setRecentSessions] = useState<SessionListItem[]>([]);
  const [projectRoot, setProjectRoot] = useState("");
  const [accountId, setAccountId] = useState("");
  const [task, setTask] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  useEffect(() => {
    let active = true;
    window.moncripsy.listSessions()
      .then((items) => {
        if (active) setRecentSessions(items.slice(0, 5));
      })
      .catch((error: unknown) => notify(errorMessage(error)));
    return () => {
      active = false;
    };
  }, [notify]);

  async function chooseProject() {
    try {
      const selected = await window.moncripsy.chooseProject();
      if (selected) {
        setProjectRoot(selected);
        await window.moncripsy.rememberProject(selected);
        await refreshRecentProjects();
      }
    } catch (error) {
      notify(errorMessage(error));
    }
  }

  async function startSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectRoot.trim() || !accountId || !task.trim()) {
      notify("Choose a project, account, and task first.");
      return;
    }
    setStarting(true);
    try {
      const { sessionId } = await window.moncripsy.startSession({
        projectRoot: projectRoot.trim(),
        accountId,
        task: task.trim(),
      });
      navigate(`/sessions/${encodeURIComponent(sessionId)}`);
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setStarting(false);
    }
  }

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: `${account.providerLabel} · ${account.label}`,
  }));

  return (
    <>
      <PageHeading
        title="Start a task"
        description="Choose a project and the web account moncripsy should use for this conversation."
      />
      <div className="project-workbench">
        <section className="project-rail panel">
          <div className="workbench-section-heading">
            <div>
              <h2>Recent projects</h2>
            </div>
            <span>{recentProjects.length}</span>
          </div>
          {recentProjects.length ? recentProjects.slice(0, 6).map((project) => (
            <button
              className="project-rail-item"
              key={project.projectRoot}
              type="button"
              disabled={!project.available}
              onClick={() => setProjectRoot(project.projectRoot)}
              title={project.projectRoot}
            >
              <FolderTree size={15} />
              <span>{project.projectRoot}</span>
              {!project.available ? <Badge variant="outline">Unavailable</Badge> : null}
            </button>
          )) : <p className="workbench-empty">Choose a folder to add a recent project.</p>}
        </section>
        <section className="project-rail panel">
          <div className="workbench-section-heading">
            <div>
              <h2>Recent sessions</h2>
            </div>
            <Link to="/sessions">View all</Link>
          </div>
          {recentSessions.length ? recentSessions.map((session) => (
            <Link
              className="project-rail-item"
              key={session.sessionId}
              to={`/sessions/${encodeURIComponent(session.sessionId)}`}
            >
              <History size={15} />
              <span>{session.task}</span>
              {session.requiresRecovery ? <Badge variant="outline">Recover</Badge> : null}
            </Link>
          )) : <p className="workbench-empty">Your saved conversations will appear here.</p>}
        </section>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>New conversation</CardTitle>
          <CardDescription>
            Files and commands stay on this computer; your provider receives prompts and returned context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={startSession} className="form-grid">
            <Field label="Project folder" htmlFor="project-path" className="full">
              <div className="form-grid">
                <div className="inline-actions">
                  <Input
                    id="project-path"
                    value={projectRoot}
                    onChange={(event) => setProjectRoot(event.target.value)}
                    placeholder="Choose a project folder"
                    required
                  />
                  <Button type="button" onClick={chooseProject}>
                    <FolderOpen size={16} />
                    Browse
                  </Button>
                </div>
                {recentProjects.length ? (
                  <Select
                    aria-label="Recent project folders"
                    value=""
                    placeholder="Choose a recent project"
                    onChange={setProjectRoot}
                    options={recentProjects.map(({ projectRoot: recentRoot, available }) => ({
                      value: recentRoot,
                      label: `${recentRoot}${available ? "" : " (folder unavailable)"}`,
                    }))}
                  />
                ) : null}
              </div>
            </Field>
            <Field label="Provider account" htmlFor="account-id">
              {accounts.length ? (
                <Select
                  id="account-id"
                  value={accountId}
                  onChange={setAccountId}
                  options={accountOptions}
                  required
                />
              ) : (
                <div className="field-note">
                  Add a provider profile before starting.
                  <Button asChild size="sm" className="ml-2">
                    <Link to="/accounts">Accounts</Link>
                  </Button>
                </div>
              )}
            </Field>
            <Field label="Task" htmlFor="task" className="full">
              <Textarea
                id="task"
                value={task}
                onChange={(event) => setTask(event.target.value)}
                placeholder="Describe what you want moncripsy to do in this project…"
                required
              />
            </Field>
            <div className="form-actions full">
              <Button type="submit" variant="default" disabled={starting || !accounts.length}>
                {starting ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
                Start conversation
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Notice variant="info" className="mt-4">
        moncripsy uses the selected account's existing browser login. Provider access and usage limits still apply.
      </Notice>
    </>
  );
}

function AccountsPage() {
  const { accounts, providers, refreshAccounts, notify } = useAppState();
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [adding, setAdding] = useState(false);

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdding(true);
    try {
      await window.moncripsy.createAccount({ providerId, label });
      setLabel("");
      await refreshAccounts();
      notify("Account profile added.");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setAdding(false);
    }
  }

  async function openLogin(account: ProviderAccount) {
    setWorkingId(account.id);
    try {
      await window.moncripsy.openLogin(account.id);
      notify("Browser opened. Sign in, close that window, then choose Verify.");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setWorkingId("");
    }
  }

  async function verifyLogin(account: ProviderAccount) {
    setWorkingId(account.id);
    try {
      const result = await window.moncripsy.verifyLogin(account.id);
      notify(result.authenticated
        ? `${account.label}: login verified.`
        : `${account.label}: no signed-in session detected.`);
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setWorkingId("");
    }
  }

  async function deleteAccount(account: ProviderAccount) {
    if (account.isDefault) return;
    const confirmed = window.confirm(
      `Remove "${account.label}" and its local browser profile? Saved sessions will be kept, but will need another ${account.providerLabel} account to resume.`,
    );
    if (!confirmed) return;
    setWorkingId(account.id);
    try {
      const result = await window.moncripsy.deleteAccount(account.id);
      await refreshAccounts();
      notify(result.profileCleanupError ?? "Account profile removed. Saved session history was kept.");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setWorkingId("");
    }
  }

  return (
    <>
      <PageHeading
        title="Provider accounts"
        description="Keep logins isolated and choose the account explicitly when starting a session."
      />
      <Card>
        <CardHeader>
          <CardTitle>Add an account profile</CardTitle>
          <CardDescription>
            Each profile has its own local browser data and login state.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={addAccount} className="form-grid">
            <Field label="Provider" htmlFor="provider-id">
              <Select
                id="provider-id"
                value={providerId}
                onChange={setProviderId}
                options={providers.map((provider) => ({
                  value: provider.id,
                  label: provider.label,
                }))}
              />
            </Field>
            <Field label="Label" htmlFor="account-label">
              <Input
                id="account-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={80}
                placeholder="e.g. Personal"
                required
              />
            </Field>
            <div className="form-actions full">
              <Button type="submit" variant="default" disabled={adding}>
                {adding ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}
                Add profile
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="cards mt-5">
        {accounts.map((account) => (
          <Card key={account.id} className="account-card">
            <div className="account-copy">
              <h3>
                {account.label}
                {account.isDefault ? <Badge variant="outline" className="ml-2">Default</Badge> : null}
              </h3>
              <p>{account.providerLabel} · {account.id}</p>
            </div>
            <div className="account-actions">
              <Button
                size="sm"
                onClick={() => openLogin(account)}
                disabled={workingId === account.id}
              >
                {workingId === account.id ? <LoaderCircle className="animate-spin" size={14} /> : null}
                Open login
              </Button>
              <Button
                size="sm"
                onClick={() => verifyLogin(account)}
                disabled={workingId === account.id}
              >
                <Check size={14} />
                Verify
              </Button>
              {!account.isDefault ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteAccount(account)}
                  disabled={workingId === account.id}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
      <Notice className="mt-5">
        Profiles are selected manually per session. moncripsy does not rotate accounts automatically when a provider imposes a usage limit.
      </Notice>
    </>
  );
}

function SessionsPage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(50);
  const { notify, accounts, busySessions } = useAppState();

  const refreshSessions = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setSessions(await window.moncripsy.listSessions());
    } catch (error) {
      setLoadError(errorMessage(error));
      notify(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions, busySessions]);

  useEffect(() => {
    setVisibleCount(50);
  }, [query, projectFilter, providerFilter, accountFilter, statusFilter]);

  const projects = [...new Set(sessions.map((session) => session.projectRoot))]
    .sort((left, right) => left.localeCompare(right));
  const providers = [...new Set(sessions.map((session) => session.provider))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  const filteredSessions = sessions.filter((session) => {
    const needle = query.trim().toLocaleLowerCase();
    const matchesText = !needle
      || session.task.toLocaleLowerCase().includes(needle)
      || session.projectRoot.toLocaleLowerCase().includes(needle)
      || session.sessionId.toLocaleLowerCase().includes(needle);
    const matchesProject = !projectFilter || session.projectRoot === projectFilter;
    const matchesProvider = !providerFilter || session.provider === providerFilter;
    const matchesAccount = !accountFilter
      || (accountFilter === "__missing__" && session.accountMissing)
      || session.accountId === accountFilter;
    const matchesStatus = statusFilter === "all"
      || (statusFilter === "running" && (session.isRunning || busySessions.has(session.sessionId)))
      || (statusFilter === "recovery" && session.requiresRecovery)
      || (statusFilter === "error" && Boolean(session.lastError))
      || (statusFilter === "idle" && !session.isRunning && !busySessions.has(session.sessionId) && !session.requiresRecovery && !session.lastError);
    return matchesText && matchesProject && matchesProvider && matchesAccount && matchesStatus;
  });
  const visibleSessions = filteredSessions.slice(0, visibleCount);

  return (
    <>
      <PageHeading
        title="Session workbench"
        description="Find a conversation by task, project, provider, or recovery state."
      >
        <Button onClick={() => void refreshSessions()} disabled={loading}>
          {loading ? <LoaderCircle className="animate-spin" size={16} /> : null}
          Refresh
        </Button>
      </PageHeading>
      {loadError ? <Notice>{loadError} <Button size="sm" onClick={() => void refreshSessions()}>Retry</Button></Notice> : null}
      <div className="session-filters panel">
        <div className="session-search">
          <Search size={16} aria-hidden="true" />
          <Input
            aria-label="Search sessions"
            placeholder="Search task, project, or session ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select
          aria-label="Filter by project"
          value={projectFilter}
          placeholder="All projects"
          onChange={setProjectFilter}
          options={projects.map((project) => ({ value: project, label: project }))}
        />
        <Select
          aria-label="Filter by provider"
          value={providerFilter}
          placeholder="All providers"
          onChange={setProviderFilter}
          options={providers.map((provider) => ({
            value: provider,
            label: accounts.find((account) => account.providerId === provider)?.providerLabel ?? provider,
          }))}
        />
        <Select
          aria-label="Filter by account"
          value={accountFilter}
          placeholder="All accounts"
          onChange={setAccountFilter}
          options={[
            ...accounts.map((account) => ({
              value: account.id,
              label: `${account.providerLabel} · ${account.label}`,
            })),
            ...(sessions.some((session) => session.accountMissing)
              ? [{ value: "__missing__", label: "Removed account" }]
              : []),
          ]}
        />
        <Select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "Any status" },
            { value: "running", label: "Running" },
            { value: "recovery", label: "Needs recovery" },
            { value: "error", label: "Last turn failed" },
            { value: "idle", label: "Idle / ready" },
          ]}
        />
      </div>
      <div className="session-list-summary">
        {loading ? "Loading local session metadata…" : `${filteredSessions.length} matching sessions · ${sessions.length} total`}
      </div>
      <div className="cards">
        {loading ? (
          <div className="empty-state"><LoaderCircle className="animate-spin" /></div>
        ) : visibleSessions.length ? visibleSessions.map((session) => (
          <Link
            key={session.sessionId}
            to={`/sessions/${encodeURIComponent(session.sessionId)}`}
            className="session-card"
          >
            <div className="session-copy">
              <h3>{session.task}</h3>
              <p>{session.projectRoot}</p>
              <p className="session-meta">
                {session.accountMissing
                  ? "Provider account removed"
                  : session.accountLabel ?? session.provider ?? "Web account"}
                {" · "}
                {new Date(session.updatedAt).toLocaleString()}
              </p>
              {session.lastError ? <p className="session-error">{session.lastError}</p> : null}
            </div>
            <div className="account-actions">
              {session.accountMissing ? <Badge variant="outline">Account missing</Badge> : null}
              {session.requiresRecovery ? <Badge variant="outline">Recovery needed</Badge> : null}
              {session.lastError ? <Badge variant="outline">Error</Badge> : null}
              {session.isRunning || busySessions.has(session.sessionId) ? <Badge variant="success">Running</Badge> : null}
              <Badge variant={session.phase === "idle" ? "success" : "outline"}>{session.phase}</Badge>
              <ArrowRight size={16} />
            </div>
          </Link>
        )) : (
          <div className="empty-state">
            <div><strong>{sessions.length ? "No matching sessions" : "No sessions yet"}</strong>
              {sessions.length ? "Adjust or clear your filters." : "Start a task from Projects."}
            </div>
          </div>
        )}
        {!loading && visibleSessions.length < filteredSessions.length ? (
          <Button className="load-more" onClick={() => setVisibleCount((current) => current + 50)}>
            Load 50 more ({filteredSessions.length - visibleSessions.length} remaining)
          </Button>
        ) : null}
      </div>
    </>
  );
}

function Message({ item }: { item: TranscriptItem }) {
  const { notify } = useAppState();
  if (item.type === "message") {
    return (
      <article className={cn("message", item.role === "user" ? "user" : "assistant")}>
        <div className="message-heading">
          <div className="message-label">{item.role === "user" ? "You" : "moncripsy"}</div>
          {item.role === "assistant" ? (
            <Button
              aria-label="Copy assistant message"
              size="sm"
              variant="ghost"
              onClick={() => {
                void window.moncripsy.copyText(item.text)
                  .then(() => notify("Message copied."))
                  .catch((error: unknown) => notify(errorMessage(error)));
              }}
            >
              <Copy size={13} />
              Copy
            </Button>
          ) : null}
        </div>
        <div className="message-content">
          {item.role === "assistant" ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    onClick={(event) => {
                      event.preventDefault();
                      if (href) {
                        void window.moncripsy.openExternal(href)
                          .catch((error: unknown) => notify(errorMessage(error)));
                      }
                    }}
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {item.text}
            </ReactMarkdown>
          ) : item.text}
        </div>
      </article>
    );
  }
  if (item.type === "tool_call") {
    return (
      <article className="message tool">
        <div className="message-label">Tool call · {item.name}</div>
        <div className="message-content">{item.arguments}</div>
      </article>
    );
  }
  if (item.type === "tool_result") {
    return (
      <article className="message tool">
        <div className="message-label">Tool result · {item.name ?? "tool"}</div>
        <div className="message-content">{item.output}</div>
      </article>
    );
  }
  return null;
}

function activityTitle(event: SessionActivity): string {
  const toolName = typeof event.payload.name === "string"
    ? event.payload.name
    : typeof event.payload.toolName === "string"
      ? event.payload.toolName
      : "";
  const titles: Record<string, string> = {
    "run.started": "Turn started",
    "run.interrupted": "Turn interrupted",
    "run.turn_cancelled": "Turn cancelled",
    "run.recovery_required": "Recovery required",
    "tool.claimed": toolName ? `Tool started · ${toolName}` : "Tool started",
    "tool.completed": toolName ? `Tool completed · ${toolName}` : "Tool completed",
    "tool.completion_unknown": toolName ? `Tool outcome unknown · ${toolName}` : "Tool outcome unknown",
    "session.instruction_added": "Follow-up message added",
    "provider_account_rebound": "Provider account changed",
  };
  return titles[event.type]
    ?? event.type.replaceAll(/[._]/g, " ").replace(/^./, (first) => first.toUpperCase());
}

function ActivityTimeline({ events }: { events: SessionActivity[] }) {
  if (!events.length) return null;
  return (
    <details className="activity-panel">
      <summary>Activity timeline <span>{events.length}</span></summary>
      <ol>
        {events.slice(-80).map((event, index) => (
          <li key={`${event.timestamp}-${event.type}-${index}`}>
            <div className="activity-entry">
              <span>{activityTitle(event)}</span>
              <time dateTime={event.timestamp}>
                {Number.isNaN(Date.parse(event.timestamp))
                  ? event.timestamp
                  : new Date(event.timestamp).toLocaleTimeString()}
              </time>
            </div>
            {typeof event.payload.message === "string" ? (
              <p>{event.payload.message}</p>
            ) : null}
            <details className="activity-details">
              <summary>Details</summary>
              <pre>{JSON.stringify(event.payload, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ol>
    </details>
  );
}

function ApprovalCard({
  approval,
  respond,
}: {
  approval: AgentApproval;
  respond(approved: boolean): void;
}) {
  return (
    <Card className="approval-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-200">
          <ShieldAlert size={17} />
          Permission required · {approval.toolCall?.name}
        </CardTitle>
        <CardDescription>{(approval.reasons ?? []).join(" · ")}</CardDescription>
      </CardHeader>
      <CardContent>
        <pre>{JSON.stringify(approval.toolCall?.args ?? {}, null, 2)}</pre>
        <div className="inline-actions mt-3">
          <Button variant="default" size="sm" onClick={() => respond(true)}>
            <Check size={14} /> Allow once
          </Button>
          <Button variant="destructive" size="sm" onClick={() => respond(false)}>
            <X size={14} /> Deny
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionPage() {
  const sessionId = useParams().sessionId ?? "";
  const {
    accounts,
    eventsBySession,
    busySessions,
    approvals,
    notify,
    setBusy,
    setApprovals,
  } = useAppState();
  const [data, setData] = useState<SessionTranscript | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replacementAccountId, setReplacementAccountId] = useState("");
  const [rebinding, setRebinding] = useState(false);
  const [exportFormat, setExportFormat] = useState<"codex" | "claude-code">("codex");
  const [exporting, setExporting] = useState(false);
  const busy = busySessions.has(sessionId) || sending;

  async function refreshTranscript() {
    try {
      const transcript = await window.moncripsy.getTranscript(sessionId);
      setData(transcript);
      setLoadError("");
    } catch (error) {
      setLoadError(errorMessage(error));
      notify(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void refreshTranscript();
  }, [sessionId]);

  useEffect(() => {
    if (!busy) void refreshTranscript();
  }, [busy]);

  const sessionEvents = eventsBySession[sessionId] ?? [];
  const pending = approvals.filter((item) => item.sessionId === sessionId);
  const account = accounts.find((item) => item.id === data?.session.accountId);
  const replacementAccounts = accounts.filter(
    (item) => item.providerId === data?.session.provider,
  );

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    setSending(true);
    try {
      await window.moncripsy.sendMessage({ sessionId, text: message });
      setText("");
      await refreshTranscript();
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  async function resume() {
    setBusy(sessionId, true);
    try {
      await window.moncripsy.resumeSession(sessionId);
      await refreshTranscript();
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setBusy(sessionId, false);
    }
  }

  async function rebindAccount() {
    if (!replacementAccountId) return;
    setRebinding(true);
    try {
      await window.moncripsy.rebindSessionAccount({
        sessionId,
        accountId: replacementAccountId,
      });
      setReplacementAccountId("");
      await refreshTranscript();
      notify("Session linked to the selected account. Its saved history is unchanged.");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setRebinding(false);
    }
  }

  async function exportTranscript() {
    setExporting(true);
    try {
      const result = await window.moncripsy.exportSession(sessionId, exportFormat);
      if (!result.canceled && result.filePath) {
        notify(`Transcript exported to ${result.filePath}`);
      }
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  async function cancel() {
    await window.moncripsy.cancelSession(sessionId);
    notify("Cancellation requested.");
  }

  async function respond(approvalId: string, approved: boolean) {
    try {
      await window.moncripsy.respondToApproval({ approvalId, approved });
      setApprovals((current) => current.filter((item) => item.approvalId !== approvalId));
    } catch (error) {
      notify(errorMessage(error));
    }
  }

  const transcript = data?.items ?? [];
  const activity = useMemo(() => {
    const merged = new Map<string, SessionActivity>();
    for (const event of data?.activity ?? []) {
      merged.set(`${event.timestamp}\0${event.type}`, event);
    }
    for (const event of sessionEvents) {
      if (!event.timestamp || !event.sessionId) continue;
      const key = `${event.timestamp}\0${event.type}`;
      if (!merged.has(key)) {
        merged.set(key, {
          sessionId: event.sessionId,
          timestamp: event.timestamp,
          type: event.type,
          payload: event.payload ?? {},
        });
      }
    }
    return [...merged.values()].sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp)
    );
  }, [data?.activity, sessionEvents]);
  const recovery = Boolean(data?.session.requiresRecovery);

  if (loading && !data) {
    return <div className="empty-state"><LoaderCircle className="animate-spin" /></div>;
  }
  if (!data) {
    return <Notice>{loadError || "Session could not be loaded."} <Button size="sm" onClick={() => void refreshTranscript()}>Retry</Button></Notice>;
  }

  return (
    <div className="chat-layout">
      <header className="chat-header">
        <div>
          <h1>{data.session.task}</h1>
          <p className="muted">{data.session.projectRoot} · {account?.label ?? data.session.provider}</p>
        </div>
        <div className="chat-actions">
          <Select
            aria-label="Export format"
            value={exportFormat}
            onChange={(value) => {
              if (value === "codex" || value === "claude-code") {
                setExportFormat(value);
              }
            }}
            options={[
              { value: "codex", label: "Codex JSONL" },
              { value: "claude-code", label: "Claude Code JSONL" },
            ]}
          />
          <Button onClick={() => void exportTranscript()} disabled={exporting || !transcript.length}>
            {exporting ? <LoaderCircle className="animate-spin" size={16} /> : null}
            Export
          </Button>
          {busy ? <Button variant="destructive" onClick={cancel}>Cancel turn</Button> : null}
        </div>
      </header>
      {loadError ? <Notice>{loadError} <Button size="sm" onClick={() => void refreshTranscript()}>Retry</Button></Notice> : null}
      {data.session.accountMissing ? (
        <Card className="approval-card">
          <CardHeader>
            <CardTitle>Provider account removed</CardTitle>
            <CardDescription>
              This conversation and its transcript are still saved. Choose another {data.session.provider} account to continue; accounts are never switched automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {replacementAccounts.length ? (
              <div className="inline-actions">
                <Select
                  aria-label="Replacement provider account"
                  value={replacementAccountId}
                  placeholder="Choose an account"
                  onChange={setReplacementAccountId}
                  options={replacementAccounts.map((item) => ({
                    value: item.id,
                    label: item.label,
                  }))}
                />
                <Button onClick={() => void rebindAccount()} disabled={!replacementAccountId || rebinding}>
                  {rebinding ? <LoaderCircle className="animate-spin" size={16} /> : null}
                  Use for this session
                </Button>
              </div>
            ) : (
              <div className="field-note">Add a {data.session.provider} account in Accounts to continue.</div>
            )}
          </CardContent>
        </Card>
      ) : null}
      {data.session.lastError ? (
        <Notice>Last turn failed: {data.session.lastError}</Notice>
      ) : null}
      {data.activityError ? (
        <Notice>Saved activity could not be loaded: {data.activityError}. The conversation transcript is still available.</Notice>
      ) : null}
      <div className="panel chat-stream" aria-live="polite">
        {transcript.map((item, index) => <Message key={`${item.timestamp}-${index}`} item={item} />)}
        {pending.map((approval) => (
          <ApprovalCard
            key={approval.approvalId}
            approval={approval}
            respond={(approved) => respond(approval.approvalId, approved)}
          />
        ))}
        {recovery && !data.session.accountMissing ? (
          <Card className="approval-card">
            <CardHeader>
              <CardTitle>Provider recovery required</CardTitle>
              <CardDescription>
                moncripsy will inspect the existing conversation without resending the uncertain request.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="default" onClick={resume} disabled={busy}>
                {busy ? <LoaderCircle className="animate-spin" size={16} /> : null}
                Recover session
              </Button>
            </CardContent>
          </Card>
        ) : null}
        <ActivityTimeline events={activity} />
        {transcript.length === 0 && activity.length === 0 ? (
          <div className="empty-state">
            <div><strong>Starting session…</strong>Waiting for the provider and browser.</div>
          </div>
        ) : null}
      </div>
      <form className="panel composer" onSubmit={send}>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={data.session.accountMissing ? "Choose an account to continue this session" : recovery ? "Recover the pending turn before sending another message" : "Send a follow-up message…"}
          disabled={busy || recovery || data.session.accountMissing}
        />
        <div className="composer-footer">
          <span>{busy ? "Agent is working" : "Local tools may request approval"}</span>
          <Button type="submit" variant="default" disabled={busy || recovery || data.session.accountMissing || !text.trim()}>
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : null}
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}

function SettingsPage() {
  const { info } = useAppState();
  const [checks, setChecks] = useState<SetupCheck[]>([]);
  const [checking, setChecking] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState("");

  async function runDiagnostics() {
    setChecking(true);
    setDiagnosticError("");
    try {
      setChecks(await window.moncripsy.diagnoseSetup());
    } catch (error) {
      setDiagnosticError(errorMessage(error));
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <PageHeading
        title="Settings"
        description="Desktop application and local data information."
      />
      <Card>
        <CardHeader>
          <CardTitle>Application</CardTitle>
          <CardDescription>moncripsy is local-first and has no hosted service in this release.</CardDescription>
        </CardHeader>
        <CardContent className="meta-list">
          <span>Version</span><strong>{info?.version ?? "…"}</strong>
          <span>Data directory</span><strong>{info?.appDataDir ?? "…"}</strong>
          <span>Execution</span><strong>Project files and tools run locally</strong>
          <span>Provider</span><strong>Your web account and its usage limits</strong>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <div className="health-heading">
            <div>
              <CardTitle>Setup & health</CardTitle>
              <CardDescription>
                Check local prerequisites without sending a prompt or opening provider pages.
              </CardDescription>
            </div>
            <Button onClick={() => void runDiagnostics()} disabled={checking}>
              {checking ? <LoaderCircle className="animate-spin" size={16} /> : null}
              {checks.length ? "Run checks again" : "Run checks"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {diagnosticError ? <Notice>{diagnosticError}</Notice> : null}
          {checks.length ? (
            <div className="health-checks">
              {checks.map((check) => (
                <div className={`health-check ${check.status}`} key={check.id}>
                  <div className="health-status" aria-label={check.status}>
                    {check.status === "ok" ? <Check size={16} /> : <ShieldAlert size={16} />}
                  </div>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.detail}</p>
                    {check.action ? <p className="health-action">{check.action}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="health-empty">Run a local check to see browser and data-directory readiness.</p>
          )}
        </CardContent>
      </Card>
      <Notice variant="info" className="mt-4">
        Keep private credentials and unrelated sensitive data out of prompts and project files.
      </Notice>
    </>
  );
}

function NotFound() {
  return (
    <div className="empty-state">
      <div><strong>Page not found</strong><Button asChild size="sm"><Link to="/projects">Back to Projects</Link></Button></div>
    </div>
  );
}

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [eventsBySession, setEventsBySession] = useState<Record<string, AgentEvent[]>>({});
  const [busySessions, setBusySessions] = useState(() => new Set<string>());
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [toast, setToast] = useState("");
  const [loadError, setLoadError] = useState("");

  const notify = React.useCallback((message: string) => {
    setToast(String(message ?? ""));
    window.setTimeout(() => setToast(""), 3800);
  }, []);

  const refreshAccounts = React.useCallback(async () => {
    const result = await window.moncripsy.listAccounts();
    setAccounts(result);
    return result;
  }, []);

  const refreshRecentProjects = React.useCallback(async () => {
    const result = await window.moncripsy.listRecentProjects();
    setRecentProjects(result);
    return result;
  }, []);

  const setBusy = React.useCallback((sessionId: string, busy: boolean) => {
    setBusySessions((current) => {
      const next = new Set(current);
      if (busy) next.add(sessionId);
      else next.delete(sessionId);
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      window.moncripsy.getAppInfo(),
      window.moncripsy.listAccounts(),
      window.moncripsy.listRecentProjects(),
    ])
      .then(([appInfo, accountList, projectList]) => {
        if (!active) return;
        setInfo(appInfo);
        setAccounts(accountList);
        setRecentProjects(projectList);
      })
      .catch((error) => {
        if (active) setLoadError(errorMessage(error));
      });

    const unsubscribers = [
      window.moncripsy.onAgentEvent(({ sessionId, event }) => {
        setEventsBySession((current) => {
          const events = [...(current[sessionId] ?? []), event].slice(-60);
          return { ...current, [sessionId]: events };
        });
      }),
      window.moncripsy.onApprovalRequired((approval) => {
        setApprovals((current) => [
          ...current.filter((item) => item.approvalId !== approval.approvalId),
          approval,
        ]);
      }),
      window.moncripsy.onTurnStarted(({ sessionId }) => setBusy(sessionId, true)),
      window.moncripsy.onTurnFinished(({ sessionId }) => setBusy(sessionId, false)),
      window.moncripsy.onTurnFailed(({ sessionId, message }) => {
        setBusy(sessionId, false);
        notify(message);
      }),
    ];
    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [notify, setBusy]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const providers = info?.providers ?? [];
  const contextValue = useMemo(() => ({
    info,
    providers,
    accounts,
    refreshAccounts,
    recentProjects,
    refreshRecentProjects,
    eventsBySession,
    busySessions,
    approvals,
    notify,
    setBusy,
    setApprovals,
  }), [
    info,
    providers,
    accounts,
    refreshAccounts,
    recentProjects,
    refreshRecentProjects,
    eventsBySession,
    busySessions,
    approvals,
    notify,
    setBusy,
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      <AppLayout>
        {loadError ? (
          <Notice>{loadError}</Notice>
        ) : !info ? (
          <div className="empty-state"><LoaderCircle className="animate-spin" /></div>
        ) : (
          <Routes>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/sessions/:sessionId" element={<SessionPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        )}
      </AppLayout>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </AppContext.Provider>
  );
}

import React, { Fragment, useEffect, useRef, useState } from "react";
import { API_BASE, apiDelete, apiGet, apiGetBlob, apiPost, apiPostForm, downloadDiagnostics, saveBlob } from "./lib/api";
import defaultLogo from "./assets/logo.png";

const pages = [
  { id: "dashboard", label: "Overview", meta: "Today" },
  { id: "accounts", label: "Accounts", meta: "Ledger" },
  { id: "transactions", label: "Transactions", meta: "Inbox" },
  { id: "budgets", label: "Budgets", meta: "Plan" },
  { id: "debts", label: "Debts", meta: "Payoff" },
  { id: "business", label: "Clients + Invoices", meta: "Business" },
  { id: "timesheets", label: "Projects + Time", meta: "Hours" },
  { id: "imports", label: "Imports", meta: "CSV" },
  { id: "reports", label: "Reports", meta: "Insights" },
  { id: "fx", label: "FX", meta: "AUD/USD" },
  { id: "settings", label: "Settings", meta: "Profile" },
  { id: "diagnostics", label: "Diagnostics", meta: "System" }
];

const navBuckets = [
  {
    id: "home",
    label: "Home",
    summary: "Daily view",
    pages: ["dashboard"]
  },
  {
    id: "money",
    label: "Money",
    summary: "Accounts, transactions, imports, reports",
    pages: ["accounts", "transactions", "imports", "reports"]
  },
  {
    id: "planning",
    label: "Planning",
    summary: "Budgets, debts, FX",
    pages: ["budgets", "debts", "fx"]
  },
  {
    id: "business",
    label: "Business",
    summary: "Clients, invoices, time",
    pages: ["business", "timesheets"]
  },
  {
    id: "control",
    label: "Control",
    summary: "Settings, diagnostics",
    pages: ["settings", "diagnostics"]
  }
];

const PAGE_FOCUS_COPY: Record<string, string> = {
  dashboard: "Start from the daily picture, then move into the workspace that needs attention.",
  accounts: "Keep the account structure clean so balances, reports, and imports all land in the right place.",
  transactions: "Clear the review queue, attach evidence, and keep the register audit-ready.",
  budgets: "Work the plan at the month level first, then drill into variance and category pressure.",
  debts: "Maintain debt balances and payment links before trusting any payoff scenario.",
  business: "Run clients, invoices, receipts, and archived documents from one business ledger.",
  timesheets: "Capture hours cleanly so project costing and invoice creation stay reliable.",
  imports: "Map and preview statement files before new activity hits the ledger.",
  reports: "Read liquidity, cashflow, and variance without leaving the money workspace.",
  fx: "Use FX guidance as planning input only. It never changes accounting truth.",
  settings: "Set the local profile, connectors, and AI guardrails without adding cloud dependencies.",
  diagnostics: "Check local system health, data location, and export support files when needed."
};

const amountFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currencyFormatters: Record<string, Intl.NumberFormat> = {};
const DEFAULT_LOCAL_AI_BASE_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_LOCAL_AI_MODEL = "qwen2.5:7b-instruct";
const DEFAULT_EMBEDDING_MODEL = "fts5-local";
const DEFAULT_LOCAL_AI_TIMEOUT_SECONDS = 30;
const PLAID_LINK_SCRIPT_SRC = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
const PLAID_LINK_SCRIPT_TIMEOUT_MS = 15000;
const PLAID_OAUTH_REDIRECT_PATH = "/plaid-oauth";
const PLAID_OAUTH_PENDING_KEY = "finances.plaid.oauthPending";
const PLAID_REFRESH_EVENT_KEY = "finances.plaid.updatedAt";
const MATRIX_BREAKDOWN_COLORS = ["#264653", "#e9c46a", "#f4a261", "#a8dadc", "#6d597a", "#90be6d", "#b56576", "#457b9d"];

type PlaidLinkMode = "connect" | "update";

type PendingPlaidLinkSession = {
  token: string;
  mode: PlaidLinkMode;
  itemId?: string;
};

type LlmSettings = {
  local_ai_enabled: boolean;
  local_ai_base_url: string;
  local_ai_model: string;
  local_ai_timeout_seconds: number;
  embedding_model: string;
  personal_context: string;
};

function normalizeLlmSettings(data?: any): LlmSettings {
  const timeout = Number(data?.local_ai_timeout_seconds);
  return {
    local_ai_enabled: Boolean(data?.local_ai_enabled),
    local_ai_base_url: data?.local_ai_base_url || DEFAULT_LOCAL_AI_BASE_URL,
    local_ai_model: data?.local_ai_model || data?.classification_model || DEFAULT_LOCAL_AI_MODEL,
    local_ai_timeout_seconds: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_LOCAL_AI_TIMEOUT_SECONDS,
    embedding_model: data?.embedding_model || DEFAULT_EMBEDDING_MODEL,
    personal_context: data?.personal_context || ""
  };
}

function toNumber(value: any): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatAmount(value: any): string {
  const num = toNumber(value);
  if (num === null) return "—";
  return amountFormatter.format(num);
}

function formatCurrency(value: any, currency?: string): string {
  const num = toNumber(value);
  if (num === null) return "—";
  if (currency) {
    if (!currencyFormatters[currency]) {
      try {
        currencyFormatters[currency] = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      } catch {
        currencyFormatters[currency] = amountFormatter;
      }
    }
    return currencyFormatters[currency].format(num);
  }
  return amountFormatter.format(num);
}

function formatSignedCurrency(value: any, currency?: string): string {
  const num = toNumber(value);
  if (num === null) return "—";
  if (Math.abs(num) < 0.005) return formatCurrency(0, currency);
  const prefix = num < 0 ? "-" : "+";
  return `${prefix}${formatCurrency(Math.abs(num), currency)}`;
}

function formatCount(value: any): string {
  const num = toNumber(value);
  if (num === null) return "0";
  return integerFormatter.format(num);
}

function isClosedReceivableStatus(status: any): boolean {
  return ["paid", "void"].includes(String(status || "").toLowerCase());
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${minutes}:${pad(secs)}`;
}

function formatFileSize(bytes: any): string {
  const num = toNumber(bytes);
  if (num === null || num < 0) return "—";
  if (num < 1024) return `${Math.round(num)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = num / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatMonthLabel(value?: string): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  if (Number.isNaN(dt.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(dt);
}

function formatMonthYearLabel(value?: string): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  if (Number.isNaN(dt.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(dt);
}

function formatTimestampLabel(value?: string): string {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(dt);
}

function formatRemainingSummary(value: any, currency?: string): string {
  const num = toNumber(value);
  if (num === null) return "—";
  if (Math.abs(num) < 0.005) return "On track";
  const formatted = formatCurrency(Math.abs(num), currency);
  return num > 0 ? `${formatted} left` : `${formatted} over`;
}

function formatCompactCurrency(value: any, currency?: string): string {
  const num = toNumber(value);
  if (num === null) return "—";
  if (currency) {
    try {
      const abs = Math.abs(num);
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        notation: abs >= 1000 ? "compact" : "standard",
        compactDisplay: "short",
        minimumFractionDigits: abs >= 1000 ? 1 : abs >= 100 ? 0 : abs >= 10 ? 1 : 2,
        maximumFractionDigits: abs >= 1000 ? 1 : abs >= 100 ? 0 : abs >= 10 ? 1 : 2
      }).format(num);
    } catch {
      return formatCurrency(num, currency);
    }
  }
  return formatAmount(num);
}

function renderMatrixMoney(value: any, currency?: string) {
  return (
    <span title={formatCurrency(value, currency)}>
      {formatCompactCurrency(value, currency)}
    </span>
  );
}

function buildConicGradient(segments: Array<{ value: number; color: string }>, fallback = "rgba(226, 232, 240, 0.9)") {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);
  if (total <= 0) {
    return `conic-gradient(${fallback} 0deg 360deg)`;
  }
  let start = 0;
  const stops: string[] = [];
  for (const segment of segments) {
    const value = Math.max(segment.value, 0);
    if (value <= 0) continue;
    const end = start + (value / total) * 360;
    stops.push(`${segment.color} ${start}deg ${end}deg`);
    start = end;
  }
  if (start < 360) {
    stops.push(`${fallback} ${start}deg 360deg`);
  }
  return `conic-gradient(${stops.join(", ")})`;
}

function formatHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0.0";
  return (minutes / 60).toFixed(1);
}

function toDateValue(value?: string): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function todayDate(): string {
  const dt = new Date();
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function currentMonthLabel(): string {
  return todayDate().slice(0, 7);
}

function monthStateLabel(value?: string, referenceMonth?: string): "past" | "current" | "future" {
  const month = value || "";
  const current = referenceMonth || currentMonthLabel();
  if (month < current) return "past";
  if (month > current) return "future";
  return "current";
}

function toDatetimeLocal(value?: string): string {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function weekStartLabel(value?: string): string {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value.slice(0, 10);
  const day = dt.getDay();
  const diff = (day + 6) % 7;
  dt.setDate(dt.getDate() - diff);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function toLogoSrc(path?: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("file://")) return path;
  if (path.startsWith("/")) return `file://${encodeURI(path)}`;
  return path;
}

function isPlaidOAuthRedirectLocation(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname === PLAID_OAUTH_REDIRECT_PATH && window.location.search.includes("oauth_state_id=");
}

function formatPlaidLinkExitError(err: any, fallback = "Plaid Link exited."): string {
  if (!err) return fallback;
  const message = err.display_message || err.error_message || fallback;
  const code = err.error_code ? ` (${err.error_code})` : "";
  return `${message}${code}`;
}

function savePendingPlaidLinkSession(session: PendingPlaidLinkSession) {
  window.localStorage.setItem(PLAID_OAUTH_PENDING_KEY, JSON.stringify(session));
}

function readPendingPlaidLinkSession(): PendingPlaidLinkSession | null {
  try {
    const stored = window.localStorage.getItem(PLAID_OAUTH_PENDING_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as PendingPlaidLinkSession;
    if (!parsed?.token || (parsed.mode !== "connect" && parsed.mode !== "update")) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPendingPlaidLinkSession() {
  window.localStorage.removeItem(PLAID_OAUTH_PENDING_KEY);
}

function notifyPlaidRefresh() {
  window.localStorage.setItem(PLAID_REFRESH_EVENT_KEY, String(Date.now()));
}

const loadPlaidScript = () =>
  new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeoutId: number | undefined;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      callback();
    };
    const verifyReady = () => {
      if (window.Plaid?.create) {
        finish(resolve);
        return;
      }
      finish(() => reject(new Error("Plaid Link loaded, but the Plaid launcher was not available.")));
    };
    timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error("Plaid Link did not load. Check network access to cdn.plaid.com.")));
    }, PLAID_LINK_SCRIPT_TIMEOUT_MS);

    if (window.Plaid?.create) {
      finish(resolve);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-plaid]");
    if (existing?.dataset.plaidStatus === "loaded") {
      verifyReady();
      return;
    }
    if (existing?.dataset.plaidStatus === "failed") {
      existing.remove();
    } else if (existing) {
      existing.addEventListener("load", verifyReady, { once: true });
      existing.addEventListener(
        "error",
        () => {
          existing.dataset.plaidStatus = "failed";
          finish(() => reject(new Error("Failed to load Plaid Link script.")));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = PLAID_LINK_SCRIPT_SRC;
    script.async = true;
    script.dataset.plaid = "true";
    script.dataset.plaidStatus = "loading";
    script.onload = () => {
      script.dataset.plaidStatus = "loaded";
      verifyReady();
    };
    script.onerror = () => {
      script.dataset.plaidStatus = "failed";
      finish(() => reject(new Error("Failed to load Plaid Link script.")));
    };
    document.body.appendChild(script);
  });

function PlaidOAuthRedirectHandler() {
  const [message, setMessage] = useState("Completing Plaid login...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const completeRedirect = async () => {
      const pending = readPendingPlaidLinkSession();
      if (!pending) {
        setError("Plaid login session expired. Return to Settings and reconnect the bank item again.");
        return;
      }

      try {
        await loadPlaidScript();
        if (cancelled) return;
        const handler = window.Plaid.create({
          token: pending.token,
          receivedRedirectUri: window.location.href,
          onSuccess: async (publicToken: string, metadata: any) => {
            try {
              if (pending.mode === "connect") {
                await apiPost("/plaid/exchange", { public_token: publicToken, metadata });
              } else {
                await apiPost("/plaid/sync");
              }
              clearPendingPlaidLinkSession();
              notifyPlaidRefresh();
              setMessage("Plaid login complete. Returning to the app...");
              window.setTimeout(() => window.close(), 800);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Unable to finish Plaid login in the app.");
            }
          },
          onExit: (err: any) => {
            setError(formatPlaidLinkExitError(err, "Plaid login was closed before the app received the update."));
          }
        });
        handler.open();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to resume Plaid login.");
      }
    };

    completeRedirect().catch((err) => {
      setError(err instanceof Error ? err.message : "Unable to resume Plaid login.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="plaid-oauth-return">
      <div className="backend-loading-card">
        <h2>Plaid login</h2>
        {error ? <p className="form-error">{error}</p> : <p className="muted">{message}</p>}
      </div>
    </div>
  );
}

function App() {
  if (isPlaidOAuthRedirectLocation()) {
    return <PlaidOAuthRedirectHandler />;
  }

  const [activeWorkspace, setActiveWorkspace] = useState("home");
  const [workspaceView, setWorkspaceView] = useState<Record<string, string>>({
    home: "dashboard",
    money: "transactions",
    planning: "budgets",
    business: "business",
    control: "settings"
  });
  const [accountFocus, setAccountFocus] = useState("");
  const [companyLogoPath, setCompanyLogoPath] = useState("");
  const [customLogoFailed, setCustomLogoFailed] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [backendRetryNonce, setBackendRetryNonce] = useState(0);
  const [backendStatus, setBackendStatus] = useState<{
    ok: boolean;
    message: string;
    counts?: Record<string, number>;
    dbPath?: string;
  }>({ ok: false, message: "Checking backend..." });

  useEffect(() => {
    let cancelled = false;
    const delayMs = 1000;

    const run = async () => {
      setBackendReady(false);
      setBackendStatus({ ok: false, message: "Starting local backend..." });
      for (let attempt = 1; !cancelled; attempt += 1) {
        try {
          const data = await apiGet<{ status: string; counts: Record<string, number>; db_path: string }>("/diagnostics/status");
          if (cancelled) return;
          setBackendStatus({
            ok: true,
            message: "Backend connected",
            counts: data.counts,
            dbPath: data.db_path
          });
          setBackendReady(true);
          return;
        } catch (err: any) {
          if (cancelled) return;
          setBackendStatus({
            ok: false,
            message: `Starting local backend... (${attempt} retries). ${err?.message || "Backend unavailable"}`
          });
          await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        }
      }
    };

    run().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [backendRetryNonce]);

  useEffect(() => {
    if (!backendReady) return;
    apiGet<any>("/settings")
      .then((data) => setCompanyLogoPath(data.company_logo_path || ""))
      .catch(() => undefined);
  }, [backendReady]);

  useEffect(() => {
    setCustomLogoFailed(false);
  }, [companyLogoPath]);

  const customLogoSrc = companyLogoPath ? toLogoSrc(companyLogoPath) : "";
  const usingCustomLogo = Boolean(customLogoSrc) && !customLogoFailed;
  const logoSrc = usingCustomLogo ? customLogoSrc : defaultLogo;
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const activeBucket = navBuckets.find((bucket) => bucket.id === activeWorkspace) || navBuckets[0];
  const activePageId = workspaceView[activeBucket.id] || activeBucket.pages[0];
  const activePage = pageById.get(activePageId) || pages[0];

  const navigateToPage = (pageId: string) => {
    const bucket = navBuckets.find((item) => item.pages.includes(pageId));
    if (!bucket) return;
    setActiveWorkspace(bucket.id);
    setWorkspaceView((current) => ({ ...current, [bucket.id]: pageId }));
  };

  const openAccountRegister = (accountId: number) => {
    setAccountFocus(String(accountId));
    navigateToPage("transactions");
  };

  const openAccountReport = () => {
    navigateToPage("reports");
  };

  const renderWorkspaceOverview = () => {
    if (activeBucket.id === "money") {
      return <MoneyWorkspaceOverview activePageId={activePageId} onSelect={navigateToPage} />;
    }
    if (activeBucket.id === "planning") {
      return <PlanningWorkspaceOverview activePageId={activePageId} onSelect={navigateToPage} />;
    }
    if (activeBucket.id === "business") {
      return <BusinessWorkspaceOverview activePageId={activePageId} onSelect={navigateToPage} />;
    }
    if (activeBucket.id === "control") {
      return <ControlWorkspaceOverview activePageId={activePageId} onSelect={navigateToPage} />;
    }
    return null;
  };

  const renderPage = (pageId: string) => {
    if (pageId === "dashboard") return <Dashboard />;
    if (pageId === "accounts") {
      return <Accounts onOpenRegister={openAccountRegister} onOpenReport={openAccountReport} />;
    }
    if (pageId === "transactions") {
      return (
        <Transactions
          accountFocus={accountFocus}
          onConsumeAccountFocus={() => setAccountFocus("")}
        />
      );
    }
    if (pageId === "budgets") return <Budgets />;
    if (pageId === "debts") return <Debts />;
    if (pageId === "business") {
      return <Business companyLogoSrc={logoSrc} usingCustomLogo={usingCustomLogo} />;
    }
    if (pageId === "timesheets") return <Timesheets onInvoiceCreated={() => navigateToPage("business")} />;
    if (pageId === "imports") return <Imports />;
    if (pageId === "reports") return <Reports />;
    if (pageId === "fx") return <FXOptimizer />;
    if (pageId === "settings") return <Settings onLogoChange={setCompanyLogoPath} />;
    if (pageId === "diagnostics") return <Diagnostics />;
    return <Dashboard />;
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo custom-logo">
            <img
              src={logoSrc}
              alt="Company logo"
              onError={() => {
                if (usingCustomLogo) setCustomLogoFailed(true);
              }}
            />
            <span className="logo-ring" />
          </div>
          <div className="brand-copy">
            <div className="brand-title">JAI Ledger</div>
            <div className="brand-sub">Personal + business finance</div>
          </div>
        </div>
        <nav className="nav">
          {navBuckets.map((bucket) => (
            <button
              key={bucket.id}
              className={activeWorkspace === bucket.id ? "nav-workspace active" : "nav-workspace"}
              onClick={() => setActiveWorkspace(bucket.id)}
            >
              <span className="nav-workspace-label">{bucket.label}</span>
              <span className="nav-workspace-meta">{bucket.summary}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="content">
        <div className={backendStatus.ok ? "status-bar ok" : "status-bar error"}>
          <span>{backendStatus.message}</span>
          {backendStatus.ok && backendStatus.counts && (
            <span className="status-meta">
              Accounts: {backendStatus.counts.account} · Transactions: {backendStatus.counts.transactions} · FX rates:{" "}
              {backendStatus.counts.fx_rate}
            </span>
          )}
        </div>
        {backendReady ? (
          activeWorkspace === "home" ? (
            <>{renderPage(activePageId)}</>
          ) : (
            <WorkspaceShell
              bucketLabel={activeBucket.label}
              bucketSummary={activeBucket.summary}
              pages={activeBucket.pages.map((pageId) => pageById.get(pageId)).filter(Boolean)}
              activePageId={activePageId}
              activePage={activePage}
              focusCopy={PAGE_FOCUS_COPY[activePageId] || activePage.meta}
              onSelect={navigateToPage}
              overview={renderWorkspaceOverview()}
            >
              {renderPage(activePageId)}
            </WorkspaceShell>
          )
        ) : (
          <div className="backend-loading-card">
            <h2>Connecting to local backend</h2>
            <p className="muted">
              The desktop app is waiting for the bundled backend to start on {API_BASE}.
            </p>
            <p className="muted">{backendStatus.message}</p>
            <div className="row">
              <button onClick={() => setBackendRetryNonce((value) => value + 1)}>Retry</button>
              <span className="muted">The main UI will load automatically once the backend responds.</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}

function WorkspaceShell({
  bucketLabel,
  bucketSummary,
  pages,
  activePageId,
  activePage,
  focusCopy,
  onSelect,
  overview,
  children
}: {
  bucketLabel: string;
  bucketSummary: string;
  pages: Array<{ id: string; label: string; meta: string } | undefined>;
  activePageId: string;
  activePage: { id: string; label: string; meta: string };
  focusCopy: string;
  onSelect: (pageId: string) => void;
  overview?: React.ReactNode;
  children: React.ReactNode;
}) {
  const visiblePages = pages.filter((page): page is { id: string; label: string; meta: string } => Boolean(page));
  return (
    <div className="workspace-shell">
      <div className="workspace-bar">
        <div className="workspace-copy">
          <div className="workspace-kicker">{bucketLabel}</div>
          <div className="workspace-summary">{bucketSummary}</div>
          <div className="workspace-focus">
            <strong className="workspace-focus-label">{activePage.label}</strong>
            <span className="workspace-focus-copy">{focusCopy}</span>
          </div>
        </div>
        <div className="workspace-switcher">
          {visiblePages.map((page) => (
            <button
              key={page.id}
              className={activePageId === page.id ? "workspace-tab active" : "workspace-tab"}
              onClick={() => onSelect(page.id)}
            >
              <span className="workspace-tab-label">{page.label}</span>
              <span className="workspace-tab-meta">{page.meta}</span>
            </button>
          ))}
        </div>
      </div>
      {overview}
      {children}
    </div>
  );
}

function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  autoOpenSignal,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  autoOpenSignal?: unknown;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (autoOpenSignal) {
      setOpen(true);
    }
  }, [autoOpenSignal]);

  return (
    <section className={open ? "collapsible-section open" : "collapsible-section"}>
      <button
        type="button"
        className="collapsible-section-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="collapsible-section-copy">
          <span className="collapsible-section-title">{title}</span>
          <span className="collapsible-section-summary">{summary}</span>
        </span>
        <span className="collapsible-section-state">{open ? "Hide" : "Show"}</span>
      </button>
      {open && <div className="collapsible-section-body">{children}</div>}
    </section>
  );
}

function RowDisclosureButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="table-disclosure-button" onClick={onClick}>
      {open ? "Hide" : "Details"}
    </button>
  );
}

function WorkspaceInsightCard({
  title,
  value,
  meta,
  pageId,
  activePageId,
  onSelect
}: {
  title: string;
  value: string;
  meta: string;
  pageId: string;
  activePageId: string;
  onSelect: (pageId: string) => void;
}) {
  return (
    <button
      type="button"
      className={activePageId === pageId ? "workspace-insight-card active" : "workspace-insight-card"}
      onClick={() => onSelect(pageId)}
    >
      <span className="workspace-insight-label">{title}</span>
      <strong className="workspace-insight-value">{value}</strong>
      <span className="workspace-insight-meta">{meta}</span>
    </button>
  );
}

function MoneyWorkspaceOverview({
  activePageId,
  onSelect
}: {
  activePageId: string;
  onSelect: (pageId: string) => void;
}) {
  const [netWorth, setNetWorth] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [cashflow, setCashflow] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet<any>("/reports/net-worth"),
      apiGet<any[]>("/transactions/details"),
      apiGet<any[]>("/imports/batches"),
      apiGet<any[]>("/reports/cashflow")
    ])
      .then(([netWorthData, transactionData, batchData, cashflowData]) => {
        if (cancelled) return;
        setNetWorth(netWorthData);
        setTransactions(transactionData);
        setBatches(batchData);
        setCashflow(cashflowData);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const reviewTransactions = transactions.filter((txn) =>
    ["pending", "imported"].includes(txn.reconciliation_state || "imported")
  );
  const uncategorizedReviewCount = reviewTransactions.filter((txn) => !txn.splits || txn.splits.length === 0).length;
  const latestBatch = [...batches].sort((left, right) => Number(right.id || 0) - Number(left.id || 0))[0];
  const latestMonth = Array.from(new Set(cashflow.map((row) => row.month).filter(Boolean))).sort().pop();
  const latestCashflow = latestMonth ? cashflow.find((row) => row.month === latestMonth) || null : null;
  const checkingAsOfLabel = formatTimestampLabel(netWorth?.checking_as_of);
  const businessCheckingAsOfLabel = formatTimestampLabel(netWorth?.business_checking_as_of);
  const personalCheckingTotal = netWorth?.personal_checking_total ?? netWorth?.checking_total;
  const businessCheckingTotal = netWorth?.business_checking_total ?? 0;
  const personalCheckingCount = netWorth?.personal_checking_account_count ?? netWorth?.checking_account_count ?? 0;
  const businessCheckingCount = netWorth?.business_checking_account_count ?? 0;
  const activeCopy =
    {
      accounts: "Use this workspace to keep the ledger structure and account balances clean.",
      transactions: "Stay here while you clear imported activity, categorize it, and attach support.",
      imports: "Preview and import statement files here so the inbox stays controlled.",
      reports: "Use the same money workspace to read cashflow and spot register problems quickly."
    }[activePageId] || "Keep accounts, imported activity, and money reporting in one operating loop.";

  return (
    <div className="workspace-overview">
      <div className="workspace-overview-copy">
        <div className="workspace-overview-title">Money operating view</div>
        <p className="workspace-overview-note">{activeCopy}</p>
      </div>
      <div className="workspace-overview-grid">
        <WorkspaceInsightCard
          title="Personal liquidity"
          value={formatCurrency(personalCheckingTotal, netWorth?.base_currency)}
          meta={
            netWorth
              ? `${formatCount(personalCheckingCount)} checking accounts${
                  checkingAsOfLabel ? ` · ${checkingAsOfLabel}` : ""
                }`
              : "Loading local account balances"
          }
          pageId="accounts"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Business cash"
          value={formatCurrency(businessCheckingTotal, netWorth?.base_currency)}
          meta={
            netWorth
              ? `${formatCount(businessCheckingCount)} checking accounts${
                  businessCheckingAsOfLabel ? ` · ${businessCheckingAsOfLabel}` : ""
                }`
              : "Loading linked business balances"
          }
          pageId="accounts"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Review queue"
          value={formatCount(reviewTransactions.length)}
          meta={
            reviewTransactions.length > 0
              ? `${formatCount(uncategorizedReviewCount)} uncategorized · clear in transactions`
              : "Inbox is clear"
          }
          pageId="transactions"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Latest personal cashflow"
          value={latestCashflow ? formatCurrency(latestCashflow.net, latestCashflow.currency) : "—"}
          meta={
            latestCashflow
              ? `${latestMonth} · in ${formatCurrency(latestCashflow.inflow, latestCashflow.currency)} · out ${formatCurrency(
                  latestCashflow.outflow,
                  latestCashflow.currency
                )}`
              : "No cashflow history yet"
          }
          pageId="reports"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Import pipeline"
          value={formatCount(batches.length)}
          meta={
            latestBatch
              ? `${formatCount(latestBatch.imported_rows || 0)}/${formatCount(latestBatch.total_rows || 0)} rows · ${
                  latestBatch.file_name || latestBatch.source || "latest batch"
                }`
              : "No import batches yet"
          }
          pageId="imports"
          activePageId={activePageId}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

function PlanningWorkspaceOverview({
  activePageId,
  onSelect
}: {
  activePageId: string;
  onSelect: (pageId: string) => void;
}) {
  const [budgetMatrix, setBudgetMatrix] = useState<any | null>(null);
  const [netWorth, setNetWorth] = useState<any | null>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    const currentYear = new Date().getFullYear();
    Promise.all([
      apiGet<any>(`/reports/budget-matrix?year=${currentYear}`),
      apiGet<any>("/reports/net-worth"),
      apiGet<any[]>("/debts/profiles"),
      apiGet<any[]>("/fx/rates"),
      apiGet<any[]>("/fx/recommendations")
    ])
      .then(([budgetData, netWorthData, profileData, rateData, recommendationData]) => {
        if (cancelled) return;
        setBudgetMatrix(budgetData);
        setNetWorth(netWorthData);
        setProfiles(profileData);
        setRates(rateData);
        setRecommendations(recommendationData);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const currentBudgetMonth = budgetMatrix?.current_month || currentMonthLabel();
  const currentBudgetMeta = budgetMatrix?.month_meta?.[currentBudgetMonth] || null;
  const planningCurrency = budgetMatrix?.base_currency || netWorth?.base_currency || "USD";
  const overspentCount = (budgetMatrix?.categories || [])
    .filter((row: any) => row.type !== "income")
    .filter((row: any) => {
      const target = Number(row.budget?.[currentBudgetMonth] || 0);
      const hasBudget = Boolean(row.budget_entered?.[currentBudgetMonth]) || target > 0.005;
      const spent = Number(row.expense?.[currentBudgetMonth] || 0);
      return hasBudget && spent - target > 0.005;
    }).length;
  const balanceMap = new Map<number, number>();
  (netWorth?.accounts || []).forEach((row: any) =>
    balanceMap.set(row.account_id, Number(row.display_balance_base ?? row.balance_base ?? row.balance ?? 0))
  );
  const debtTotal = profiles.reduce((sum, profile) => sum + Math.abs(balanceMap.get(profile.account_id) || 0), 0);
  const minimumPaymentTotal = profiles.reduce((sum, profile) => sum + Number(profile.min_payment || 0), 0);
  const latestRate = [...rates].sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")))[0];
  const latestRateValue = toNumber(latestRate?.aud_per_usd);
  const latestRecommendation = recommendations[0];
  const activeCopy =
    {
      budgets: "Keep the forward plan and actual variance side by side so cash pressure is obvious.",
      debts: "Update balances and payment links here before testing avalanche or snowball scenarios.",
      fx: "Treat FX as a planning input only. It should inform decisions, not mutate the books."
    }[activePageId] || "Use one planning workspace for budgets, debt pressure, and FX context.";

  return (
    <div className="workspace-overview">
      <div className="workspace-overview-copy">
        <div className="workspace-overview-title">Planning control view</div>
        <p className="workspace-overview-note">{activeCopy}</p>
      </div>
      <div className="workspace-overview-grid">
        <WorkspaceInsightCard
          title="Budget month"
          value={formatRemainingSummary(currentBudgetMeta?.remaining_to_allocate, planningCurrency)}
          meta={
            currentBudgetMeta
              ? `${formatMonthYearLabel(currentBudgetMonth)} · income ${formatCurrency(
                  currentBudgetMeta.effective_income,
                  planningCurrency
                )} · expense ${formatCurrency(currentBudgetMeta.effective_expense, planningCurrency)}`
              : "No budget month loaded"
          }
          pageId="budgets"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Budget hotspots"
          value={formatCount(overspentCount)}
          meta={
            currentBudgetMonth
              ? `${formatMonthYearLabel(currentBudgetMonth)} categories over plan`
              : "Waiting for budget data"
          }
          pageId="budgets"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Debt load"
          value={formatCurrency(debtTotal, planningCurrency)}
          meta={
            profiles.length > 0
              ? `${formatCount(profiles.length)} tracked debts · minimums ${formatCurrency(
                  minimumPaymentTotal,
                  planningCurrency
                )}`
              : "No debt profiles yet"
          }
          pageId="debts"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="FX watch"
          value={latestRateValue === null ? "—" : latestRateValue.toFixed(4)}
          meta={
            latestRecommendation
              ? `Latest guidance ${formatTimestampLabel(latestRecommendation.created_at)} · ${
                  latestRecommendation.risk_profile || "neutral"
                }`
              : latestRate
                ? `${latestRate.date} · AUD per USD`
                : "No local FX snapshot yet"
          }
          pageId="fx"
          activePageId={activePageId}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

function BusinessWorkspaceOverview({
  activePageId,
  onSelect
}: {
  activePageId: string;
  onSelect: (pageId: string) => void;
}) {
  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [archives, setArchives] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet<any[]>("/business/clients"),
      apiGet<any[]>("/business/invoices"),
      apiGet<any[]>("/business/invoice-archives"),
      apiGet<any[]>("/timesheets/entries"),
      apiGet<any>("/reports/timesheets/summary")
    ])
      .then(([clientData, invoiceData, archiveData, entryData, summaryData]) => {
        if (cancelled) return;
        setClients(clientData);
        setInvoices(invoiceData);
        setArchives(archiveData);
        setEntries(entryData);
        setSummary(summaryData);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const activeClients = clients.filter((client) => client.is_active !== 0);
  const openInvoices = invoices.filter((invoice) => !isClosedReceivableStatus(invoice.status));
  const receivablesCurrency = openInvoices[0]?.currency || archives[0]?.currency || "USD";
  const openReceivables = openInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.balance_due ?? invoice.total ?? 0),
    0
  );
  const archivedTotal = archives.reduce((sum, archive) => sum + Number(archive.total || 0), 0);
  const runningEntry = entries.find((entry) => !entry.end_time);
  const latestInvoice = [...invoices]
    .filter((invoice) => invoice.issue_date)
    .sort((left, right) => String(right.issue_date || "").localeCompare(String(left.issue_date || "")))[0];
  const activeCopy =
    {
      business: "Handle client records, receivables, historical invoices, and receipt matching from one business view.",
      timesheets: "Capture delivery work cleanly here, then turn approved hours into invoices without rebuilding the data."
    }[activePageId] || "Keep clients, invoices, archive records, and time capture tied to the same local business ledger.";

  return (
    <div className="workspace-overview">
      <div className="workspace-overview-copy">
        <div className="workspace-overview-title">Business operating view</div>
        <p className="workspace-overview-note">{activeCopy}</p>
      </div>
      <div className="workspace-overview-grid">
        <WorkspaceInsightCard
          title="Active clients"
          value={formatCount(activeClients.length)}
          meta={
            clients.length > 0
              ? `${formatCount(clients.length - activeClients.length)} archived client records`
              : "No client records yet"
          }
          pageId="business"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Receivables"
          value={formatCurrency(openReceivables, receivablesCurrency)}
          meta={
            openInvoices.length > 0
              ? `${formatCount(openInvoices.length)} open invoices${
                  latestInvoice?.number ? ` · latest ${latestInvoice.number}` : ""
                }`
              : "No live invoices outstanding"
          }
          pageId="business"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Archive library"
          value={formatCount(archives.length)}
          meta={
            archives.length > 0
              ? `${formatCurrency(archivedTotal, receivablesCurrency)} historical total`
              : "No archived invoices loaded"
          }
          pageId="business"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Time capture"
          value={runningEntry ? "Running" : formatHours(Number(summary?.billable_hours || 0) * 60)}
          meta={
            runningEntry
              ? `Timer live on entry ${runningEntry.id}`
              : `${formatHours(Number(summary?.total_hours || 0) * 60)} total hours · ${formatCount(entries.length)} entries`
          }
          pageId="timesheets"
          activePageId={activePageId}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

function ControlWorkspaceOverview({
  activePageId,
  onSelect
}: {
  activePageId: string;
  onSelect: (pageId: string) => void;
}) {
  const [settings, setSettings] = useState<any | null>(null);
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<any[]>([]);
  const [assistantStatus, setAssistantStatus] = useState<any | null>(null);
  const [plaidStatus, setPlaidStatus] = useState<any | null>(null);
  const [upStatus, setUpStatus] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet<any>("/settings"),
      apiGet<any>("/diagnostics/status"),
      apiGet<any[]>("/diagnostics/backups"),
      apiGet<any[]>("/connectors"),
      apiGet<any>("/assistant/status"),
      apiGet<any>("/plaid/status").catch(() => ({ configured: false, items: 0 })),
      apiGet<any>("/up/status").catch(() => ({ configured: false, accounts: 0 }))
    ])
      .then(([settingsData, diagnosticsData, backupData, connectorData, assistantData, plaidData, upData]) => {
        if (cancelled) return;
        setSettings(settingsData);
        setDiagnostics(diagnosticsData);
        setBackups(backupData);
        setConnectors(connectorData);
        setAssistantStatus(assistantData);
        setPlaidStatus(plaidData);
        setUpStatus(upData);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const totalRows = Object.values(diagnostics?.counts || {}).reduce((sum: number, value: any) => sum + Number(value || 0), 0);
  const latestBackup = backups[0];
  const enabledConnectors = connectors.filter((connector) => connector.enabled).length;
  const configuredFeeds = [Boolean(plaidStatus?.configured), Boolean(upStatus?.configured)].filter(Boolean).length;
  const activeCopy =
    {
      settings: "Keep company profile, local connectors, categories, backups, and AI guardrails in one control area.",
      diagnostics: "Use diagnostics for export and health checks, not day-to-day finance work."
    }[activePageId] || "Control stays focused on local system setup, safety, and recovery.";

  return (
    <div className="workspace-overview">
      <div className="workspace-overview-copy">
        <div className="workspace-overview-title">Control center view</div>
        <p className="workspace-overview-note">{activeCopy}</p>
      </div>
      <div className="workspace-overview-grid">
        <WorkspaceInsightCard
          title="Local profile"
          value={settings?.company_name || "Not set"}
          meta={settings?.base_currency ? `Base currency ${settings.base_currency}` : "Set company profile and invoice defaults"}
          pageId="settings"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Backups"
          value={formatCount(backups.length)}
          meta={
            latestBackup
              ? `${latestBackup.name} · ${formatFileSize(latestBackup.size)}`
              : "No backups created yet"
          }
          pageId="settings"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Connectors"
          value={formatCount(enabledConnectors)}
          meta={`${formatCount(configuredFeeds)} bank feeds configured · ${formatCount(connectors.length)} local connectors listed`}
          pageId="settings"
          activePageId={activePageId}
          onSelect={onSelect}
        />
        <WorkspaceInsightCard
          title="Local AI"
          value={assistantStatus?.enabled ? "Enabled" : "Off"}
          meta={
            assistantStatus?.enabled
              ? `${assistantStatus?.model || "model not set"} · ${assistantStatus?.configured ? "configured" : "not configured"}`
              : `Diagnostics rows ${formatCount(totalRows)} · ${diagnostics?.db_path ? "local DB connected" : "waiting on DB"}`
          }
          pageId={assistantStatus?.enabled ? "settings" : "diagnostics"}
          activePageId={activePageId}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

const BOX_HELP: Record<string, string> = {
  "Checking cash": "Provider-backed balances for active personal checking and bank accounts, with ledger fallback when needed.",
  "Personal checking cash": "Provider-backed balances for active personal checking and bank accounts, excluding business checking.",
  "Business checking cash": "Provider-backed balances for active business checking and bank accounts.",
  "Personal liquidity": "Personal checking cash available for household spending and budget planning.",
  "Business cash": "Business checking cash tracked separately from personal spending.",
  "Cashflow (latest)": "Net movement for the most recent month.",
  "Personal cashflow (latest)": "Personal net movement for the most recent month, excluding business checking activity.",
  "Budget remaining": "Current month income support minus effective spending in the budget matrix.",
  "Debt outstanding": "Sum of tracked debt balances.",
  "Open invoices": "Count of unpaid or partial invoices.",
  "Active timer": "Current time entry status.",
  "Budget hotspots": "Categories closest to overspending.",
  "Upcoming invoices": "Invoices with upcoming due dates.",
  "Add account": "Create a new account to track.",
  "Edit account": "Update the selected account details.",
  "Chart of accounts": "QuickBooks-style account list and balances.",
  "Add transaction": "Record manual transactions or corrections.",
  "Edit transaction": "Update the selected transaction.",
  "Post transaction": "Record manual transactions or corrections.",
  "For review": "Banking inbox staging area for match and categorization.",
  "Banking register": "Filter, classify, reconcile, and attach receipts.",
  "Merge duplicates": "Combine duplicate imports into one record.",
  "Create budget month": "Set the month and rollover behavior.",
  "Budget months": "Select a month to view or update.",
  "Budget status": "Totals for target, spend, and remaining.",
  "Budget targets": "Set category targets and rollover amounts.",
  "Yearly budget matrix": "Month-by-month plan with actuals pulled automatically.",
  "Budget templates": "Import monthly targets from a CSV template.",
  "Debt profiles": "Define APRs and minimums per debt.",
  "Link payments": "Match payments to debt accounts.",
  "Payoff simulator": "Compare snowball vs avalanche outcomes.",
  "Quick add client": "Create a client record you can invoice and archive documents against.",
  "Edit client": "Update the selected client details.",
  "Active clients": "Manage your client list and see which records already have invoice history.",
  "Create invoice": "Draft an invoice with line items.",
  "Edit invoice": "Update the selected invoice.",
  "Current invoices": "Track live invoice status, exported PDFs, and applied payments.",
  "Business snapshot": "Core business counts for clients, open invoices, and historical invoice documents.",
  "Invoice archive upload": "Upload legacy invoice PDFs. Empty fields are auto-filled from the PDF when possible.",
  "Archived invoice library": "Historical invoice PDFs stored locally for reference and retrieval.",
  "Create project": "Set up a project for time tracking.",
  "Projects": "Manage project list and rates.",
  "Projects tracker": "Project totals tied to clients and billable hours.",
  "Create task": "Add optional tasks under projects.",
  "Tasks": "Manage tasks for tracking time.",
  "Add time entry": "Log time manually or after a timer.",
  "Edit time entry": "Update a logged time entry.",
  "Recent entries": "Review recent time entries.",
  "Weekly timesheet": "Weekly rollups generated from tracked time.",
  "Invoice from time entries": "Convert selected time into an invoice.",
  "CSV import wizard": "Map columns and preview import results.",
  "Import batches": "Review past imports or rollbacks.",
  "Cashflow": "Monthly personal inflows, outflows, and net.",
  "Personal cashflow": "Monthly personal inflows, outflows, and net, with business activity shown separately in details.",
  "Cashflow forecast": "Forward-looking trend from history.",
  "Category spend": "Top categories by spend.",
  "Expense analysis": "Average spend and biggest merchants.",
  "Business P&L": "Income vs expenses for business.",
  "Timesheets summary": "Hours and effective rate overview.",
  "Budget vs actual": "Compare planned budgets to actual results, QuickBooks-style.",
  "FX controls": "Ingest rates and generate recommendations.",
  "Recent FX rates": "Latest AUD/USD rates on record.",
  "Recommendations": "Suggested conversion timing.",
  "Categories": "Manage categories and allowed usage.",
  "Data location + backups": "Where data lives and how to back up.",
  "Company profile (invoices)": "Details shown on invoices.",
  "Connectors": "Optional bank connectors (CSV is default).",
  "Local AI assistant": "Local-only assistant settings for categorization help, retrieval, and summaries.",
  "Classification rules": "Deterministic rules for auto-tagging.",
  "Knowledge base (RAG)": "Personal notes used for context.",
  "Merchant profiles": "Default categories per merchant.",
  "Security & demo data": "Lock the app and manage demo data.",
  "Export diagnostics": "Export logs and a database snapshot.",
  "Database": "Health checks and file details."
};

function BoxTitle({ title, variant = "panel" }: { title: string; variant?: "panel" | "card" }) {
  const help = BOX_HELP[title] || "Details for this section.";
  const className = variant === "card" ? "card-help" : "panel-help";
  return (
    <>
      <h3>{title}</h3>
      <p className={className}>{help}</p>
    </>
  );
}

type InvoicePreviewProfile = {
  company_name: string;
  company_legal_name: string;
  company_dba: string;
  company_entity_type: string;
  company_tax_id: string;
  company_email: string;
  company_phone: string;
  company_address: string;
  company_city_state: string;
};

type InvoicePreviewLineItem = {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  isPlaceholder?: boolean;
};

const EMPTY_INVOICE_PREVIEW_PROFILE: InvoicePreviewProfile = {
  company_name: "",
  company_legal_name: "",
  company_dba: "",
  company_entity_type: "",
  company_tax_id: "",
  company_email: "",
  company_phone: "",
  company_address: "",
  company_city_state: "",
};

function formatCalendarDate(value?: string): string {
  const raw = toDateValue(value);
  if (!raw) return "—";
  const dt = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return raw;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(dt);
}

function buildInvoicePreviewCompanyLines(profile: InvoicePreviewProfile): string[] {
  const lines: string[] = [];
  const companyName = (profile.company_name || profile.company_dba || profile.company_legal_name || "").trim();
  if (profile.company_legal_name && profile.company_legal_name.trim() !== companyName) {
    lines.push(profile.company_legal_name.trim());
  }
  lines.push(
    ...String(profile.company_address || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  );
  if (profile.company_city_state && !String(profile.company_address || "").toLowerCase().includes(profile.company_city_state.toLowerCase())) {
    lines.push(profile.company_city_state.trim());
  }
  const contactBits = [profile.company_email, profile.company_phone].filter((value) => String(value || "").trim());
  if (contactBits.length) {
    lines.push(contactBits.join(" · "));
  }
  return lines;
}

function buildInvoicePreviewClientLines(client: any): string[] {
  if (!client) {
    return ["Select a client to preview the bill-to block."];
  }
  const lines = [client.name];
  lines.push(
    ...String(client.address || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const contactBits = [client.email, client.phone].filter((value) => String(value || "").trim());
  if (contactBits.length) {
    lines.push(contactBits.join(" · "));
  }
  return lines;
}

function titleCaseStatus(value?: string): string {
  const raw = String(value || "draft").replace(/[-_]+/g, " ").trim();
  if (!raw) return "Draft";
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildInvoicePreviewFacts(issueDate?: string, dueDate?: string, total?: number, currency?: string) {
  return [
    { label: "Issue", value: formatCalendarDate(issueDate) },
    { label: "Due", value: dueDate ? formatCalendarDate(dueDate) : "On receipt" },
    { label: "Total due", value: formatCurrency(total ?? 0, currency) },
  ];
}

function InvoiceSheetPreview({
  companyLogoSrc,
  companyProfile,
  client,
  invoiceNumber,
  issueDate,
  dueDate,
  currency,
  status,
  notes,
  lineItems,
  subtotal,
  total,
  heading,
  subtitle,
}: {
  companyLogoSrc: string;
  companyProfile: InvoicePreviewProfile;
  client: any | null;
  invoiceNumber: string;
  issueDate?: string;
  dueDate?: string;
  currency: string;
  status: string;
  notes?: string;
  lineItems: InvoicePreviewLineItem[];
  subtotal: number;
  total: number;
  heading: string;
  subtitle: string;
}) {
  const companyName =
    companyProfile.company_name ||
    companyProfile.company_dba ||
    companyProfile.company_legal_name ||
    "Your business";
  const companyLines = buildInvoicePreviewCompanyLines(companyProfile);
  const clientLines = buildInvoicePreviewClientLines(client);
  const invoiceFacts = buildInvoicePreviewFacts(issueDate, dueDate, total, currency);
  const adjustment = total - subtotal;
  const resolvedItems =
    lineItems.length > 0
      ? lineItems
      : [{ description: "Add line items to preview the invoice body.", quantity: null, unitPrice: null, amount: 0, isPlaceholder: true }];

  return (
    <div className="invoice-preview-panel">
      <div className="invoice-preview-head">
        <div>
          <strong>{heading}</strong>
          <p className="muted">{subtitle}</p>
        </div>
        <span className={`status-pill status-${String(status || "draft").toLowerCase()}`}>
          {titleCaseStatus(status)}
        </span>
      </div>
      <div className="invoice-sheet">
        <div className="invoice-sheet-watermark" aria-hidden="true">
          <img src={companyLogoSrc} alt="" />
        </div>
        <div className="invoice-sheet-top">
          <div className="invoice-sheet-brand">
            <div className="invoice-sheet-logo">
              <img src={companyLogoSrc} alt="Invoice logo" />
            </div>
            <div className="invoice-sheet-brand-copy">
              <div className="invoice-sheet-kicker">From</div>
              <div className="invoice-sheet-company-name">{companyName}</div>
              {companyLines.map((line) => (
                <div key={`company-${line}`} className="invoice-sheet-company-line">
                  {line}
                </div>
              ))}
            </div>
          </div>
          <div className="invoice-sheet-meta">
            <div className="invoice-sheet-kicker">Invoice</div>
            <div className="invoice-sheet-meta-number">{invoiceNumber}</div>
            {invoiceFacts.map((fact) => (
              <div key={fact.label} className="invoice-sheet-meta-row">
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="invoice-sheet-parties">
          <div className="invoice-sheet-party invoice-sheet-party-full">
            <div className="invoice-sheet-party-title">Bill To</div>
            {clientLines.map((line, index) => (
              <div
                key={`client-${line}-${index}`}
                className={index === 0 ? "invoice-sheet-party-line invoice-sheet-party-primary" : "invoice-sheet-party-line"}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
        <div className="invoice-sheet-table-wrap">
          <table className="invoice-sheet-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {resolvedItems.map((item, index) => (
                <tr key={`preview-item-${index}`}>
                  <td className={item.isPlaceholder ? "invoice-sheet-placeholder" : "invoice-sheet-description"}>
                    {item.description}
                  </td>
                  <td className="invoice-sheet-money">{item.quantity === null ? "—" : formatAmount(item.quantity)}</td>
                  <td className="invoice-sheet-money">
                    {item.unitPrice === null ? "—" : formatCurrency(item.unitPrice, currency)}
                  </td>
                  <td className="invoice-sheet-money">
                    {item.isPlaceholder ? "—" : formatCurrency(item.amount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {notes && notes.trim() && (
          <div className="invoice-sheet-notes">
            <div className="invoice-sheet-notes-title">Notes</div>
            <div className="invoice-sheet-notes-copy">{notes.trim()}</div>
          </div>
        )}
        <div className="invoice-sheet-total">
          <div className="invoice-sheet-total-card">
            <div className="invoice-sheet-total-row">
              <span>Subtotal</span>
              <strong>{formatCurrency(subtotal, currency)}</strong>
            </div>
            {Math.abs(adjustment) > 0.005 && (
              <div className="invoice-sheet-total-row">
                <span>Adjustment</span>
                <strong>{formatSignedCurrency(adjustment, currency)}</strong>
              </div>
            )}
            <div className="invoice-sheet-total-row invoice-sheet-total-row-final">
              <span>Total due</span>
              <strong>{formatCurrency(total, currency)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [netWorth, setNetWorth] = useState<any | null>(null);
  const [accountCatalog, setAccountCatalog] = useState<any[]>([]);
  const [cashflow, setCashflow] = useState<any[]>([]);
  const [budgetMatrixOverview, setBudgetMatrixOverview] = useState<any | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [debtProfiles, setDebtProfiles] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    const currentYear = new Date().getFullYear();
    Promise.all([
      apiGet<any>("/reports/net-worth"),
      apiGet<any[]>("/accounts"),
      apiGet<any[]>("/reports/cashflow"),
      apiGet<any>(`/reports/budget-matrix?year=${currentYear}`),
      apiGet<any[]>("/business/invoices"),
      apiGet<any[]>("/debts/profiles"),
      apiGet<any[]>("/timesheets/entries")
    ])
      .then(([netWorthData, accountData, cashflowData, budgetMatrixData, invoicesData, debtData, entriesData]) => {
        setNetWorth(netWorthData);
        setAccountCatalog(accountData);
        setCashflow(cashflowData);
        setBudgetMatrixOverview(budgetMatrixData);
        setInvoices(invoicesData);
        setDebtProfiles(debtData);
        setEntries(entriesData);
      })
      .catch(() => undefined);
  }, []);

  const cashflowByMonth = new Map<string, any[]>();
  cashflow.forEach((row: any) => {
    const month = row.month || "Unknown";
    if (!cashflowByMonth.has(month)) {
      cashflowByMonth.set(month, []);
    }
    cashflowByMonth.get(month)?.push(row);
  });
  const latestMonth = Array.from(cashflowByMonth.keys()).sort().pop();
  const latestCashflowRows = latestMonth ? cashflowByMonth.get(latestMonth) || [] : [];
  const balanceMap = new Map<number, number>();
  (netWorth?.accounts || []).forEach((row: any) =>
    balanceMap.set(row.account_id, Number(row.balance_base ?? row.balance ?? 0))
  );
  const currentBudgetMonth = budgetMatrixOverview?.current_month || currentMonthLabel();
  const currentBudgetMeta = budgetMatrixOverview?.month_meta?.[currentBudgetMonth] || null;
  const dashboardCurrency =
    netWorth?.base_currency || budgetMatrixOverview?.base_currency || latestCashflowRows[0]?.currency || "USD";
  const checkingAsOfLabel = formatTimestampLabel(netWorth?.checking_as_of);
  const businessCheckingAsOfLabel = formatTimestampLabel(netWorth?.business_checking_as_of);
  const personalCheckingTotal = netWorth?.personal_checking_total ?? netWorth?.checking_total;
  const businessCheckingTotal = netWorth?.business_checking_total ?? 0;
  const personalCheckingCount = netWorth?.personal_checking_account_count ?? netWorth?.checking_account_count ?? 0;
  const businessCheckingCount = netWorth?.business_checking_account_count ?? 0;
  const debtTotal = debtProfiles.reduce((sum, profile) => sum + Math.abs(balanceMap.get(profile.account_id) || 0), 0);
  const runningEntry = entries.find((entry) => !entry.end_time);
  const openInvoices = invoices.filter((invoice) => !isClosedReceivableStatus(invoice.status));
  const openInvoiceTotal = openInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.balance_due ?? invoice.total ?? 0),
    0
  );
  const openInvoiceCurrency = openInvoices[0]?.currency || dashboardCurrency;
  const upcomingInvoices = openInvoices
    .filter((invoice) => invoice.due_date)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, 3);
  const budgetRows = budgetMatrixOverview?.categories || [];
  const budgetTargets = budgetRows
    .filter((row: any) => row.type !== "income")
    .map((row: any) => {
      const target = Number(row.budget?.[currentBudgetMonth] || 0);
      const hasBudget = Boolean(row.budget_entered?.[currentBudgetMonth]) || target > 0.005;
      const spent = Number(row.expense?.[currentBudgetMonth] || 0);
      return {
        target_id: `${row.id}-${currentBudgetMonth}`,
        category: row.name,
        target,
        spent,
        remaining: target - spent,
        hasBudget
      };
    })
    .filter((row: any) => row.hasBudget)
    .sort((a: any, b: any) => a.remaining - b.remaining)
    .slice(0, 5);
  const budgetRemainingLabel = formatRemainingSummary(
    currentBudgetMeta?.remaining_to_allocate,
    budgetMatrixOverview?.base_currency
  );

  return (
    <div className="page">
      <SectionHeader title="Overview" subtitle="Personal cash, business cash, cashflow, budgets, and what needs attention." />
      <div className="grid">
        <div className="card">
          <BoxTitle title="Personal checking cash" variant="card" />
          <p className="metric">{formatCurrency(personalCheckingTotal, netWorth?.base_currency)}</p>
          <span className="muted">
            {formatCount(personalCheckingCount)} accounts
            {checkingAsOfLabel ? ` · As of ${checkingAsOfLabel}` : ""}
            {(netWorth?.checking_ledger_fallback_count || 0) > 0
              ? ` · ${formatCount(netWorth?.checking_ledger_fallback_count || 0)} ledger fallback`
              : ""}
          </span>
        </div>
        <div className="card">
          <BoxTitle title="Business checking cash" variant="card" />
          <p className="metric">{formatCurrency(businessCheckingTotal, netWorth?.base_currency)}</p>
          <span className="muted">
            {formatCount(businessCheckingCount)} accounts
            {businessCheckingAsOfLabel ? ` · As of ${businessCheckingAsOfLabel}` : ""}
            {(netWorth?.business_checking_ledger_fallback_count || 0) > 0
              ? ` · ${formatCount(netWorth?.business_checking_ledger_fallback_count || 0)} ledger fallback`
              : ""}
          </span>
        </div>
        <div className="card">
          <BoxTitle title="Personal cashflow (latest)" variant="card" />
          {latestCashflowRows.length > 0 ? (
            <>
              <p className="metric">
                {formatCurrency(latestCashflowRows[0]?.net, latestCashflowRows[0]?.currency)}
              </p>
              <span className="muted">
                In: {formatCurrency(latestCashflowRows[0]?.inflow, latestCashflowRows[0]?.currency)} · Out:{" "}
                {formatCurrency(latestCashflowRows[0]?.outflow, latestCashflowRows[0]?.currency)}
              </span>
            </>
          ) : (
            <>
              <p className="metric">—</p>
              <span className="muted">No cashflow yet</span>
            </>
          )}
        </div>
        <div className="card">
          <BoxTitle title="Budget remaining" variant="card" />
          <p className="metric">{budgetRemainingLabel}</p>
          <span className="muted">
            {currentBudgetMonth
              ? `${formatMonthYearLabel(currentBudgetMonth)} · income ${formatCurrency(
                  currentBudgetMeta?.effective_income,
                  budgetMatrixOverview?.base_currency
                )} · expense ${formatCurrency(
                  currentBudgetMeta?.effective_expense,
                  budgetMatrixOverview?.base_currency
                )}`
              : "No budget month"}
          </span>
        </div>
        <div className="card">
          <BoxTitle title="Debt outstanding" variant="card" />
          <p className="metric">{formatCurrency(debtTotal, dashboardCurrency)}</p>
          <span className="muted">{debtProfiles.length} active debts</span>
        </div>
        <div className="card">
          <BoxTitle title="Open invoices" variant="card" />
          <p className="metric">{formatCount(openInvoices.length)}</p>
          <span className="muted">Due {formatCurrency(openInvoiceTotal, openInvoiceCurrency)}</span>
        </div>
        <div className="card">
          <BoxTitle title="Active timer" variant="card" />
          <p className="metric">{runningEntry ? "Running" : "Idle"}</p>
          <span className="muted">{runningEntry ? `Entry #${runningEntry.id}` : "No active entry"}</span>
        </div>
      </div>
      <div className="panel">
        <BoxTitle title="Budget hotspots" />
        {budgetTargets.length === 0 ? (
          <p className="muted">
            {currentBudgetMonth
              ? `No explicit budget targets set for ${formatMonthYearLabel(currentBudgetMonth)}.`
              : "No budget data available."}
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Target</th>
                <th>Spent</th>
                <th>Remaining</th>
              </tr>
            </thead>
            <tbody>
              {budgetTargets.map((row: any) => (
                <tr key={row.target_id}>
                  <td>{row.category}</td>
                  <td>{formatCurrency(row.target, budgetMatrixOverview?.base_currency)}</td>
                  <td>{formatCurrency(row.spent, budgetMatrixOverview?.base_currency)}</td>
                  <td>{formatCurrency(row.remaining, budgetMatrixOverview?.base_currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="panel">
        <BoxTitle title="Upcoming invoices" />
        {upcomingInvoices.length === 0 ? (
          <p className="muted">No outstanding invoices with due dates.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Due</th>
                <th>Total</th>
                <th>Status</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {upcomingInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.number}</td>
                  <td>{invoice.due_date}</td>
                  <td>{formatCurrency(invoice.balance_due ?? invoice.total, invoice.currency)}</td>
                  <td>{invoice.is_overdue ? `overdue (${invoice.status})` : invoice.status}</td>
                  <td>
                    <a href={`${API_BASE}/business/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
                      Open PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="callout">
        <strong>Heads up:</strong> FX guidance is informational only. Not financial advice.
      </div>
    </div>
  );
}

function Accounts({
  onOpenRegister,
  onOpenReport
}: {
  onOpenRegister: (accountId: number) => void;
  onOpenReport: () => void;
}) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<number, number>>({});
  const [form, setForm] = useState({
    name: "",
    type: "bank",
    currency: "AUD",
    institution: "",
    note: ""
  });
  const [editing, setEditing] = useState<number | null>(null);

  const load = async () => {
    const [accountsData, netWorth] = await Promise.all([
      apiGet<any[]>("/accounts"),
      apiGet<any>("/reports/net-worth")
    ]);
    setAccounts(accountsData);
    const nextBalances: Record<number, number> = {};
    (netWorth.accounts || []).forEach((row: any) => {
      nextBalances[row.account_id] = Number(row.display_balance ?? row.balance ?? 0);
    });
    setBalances(nextBalances);
  };
  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const submit = async () => {
    await apiPost("/accounts", { ...form, is_active: true });
    setForm({ name: "", type: "bank", currency: "AUD", institution: "", note: "" });
    load();
  };

  const startEdit = (account: any) => {
    setEditing(account.id);
    setForm({
      name: account.name,
      type: account.type,
      currency: account.currency,
      institution: account.institution || "",
      note: account.note || ""
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    await apiPost(`/accounts/${editing}`, { ...form, is_active: true });
    setEditing(null);
    setForm({ name: "", type: "bank", currency: "AUD", institution: "", note: "" });
    load();
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({ name: "", type: "bank", currency: "AUD", institution: "", note: "" });
  };

  const deleteAccount = async (accountId: number) => {
    const confirmed = window.confirm("Delete this account? It will be archived and removed from lists.");
    if (!confirmed) return;
    await apiDelete(`/accounts/${accountId}`);
    load();
  };

  return (
    <div className="page">
      <SectionHeader title="Chart of Accounts" subtitle="Central ledger of assets, liabilities, income, and expenses." />
      <div className="panel">
        <BoxTitle title={editing ? "Edit account" : "Add account"} />
        <div className="row">
          <input
            placeholder="Account name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="bank">Bank</option>
            <option value="credit card">Credit card</option>
            <option value="savings">Savings</option>
            <option value="investment">Investment</option>
            <option value="loan">Loan</option>
            <option value="student loan">Student loan</option>
            <option value="cash">Cash</option>
          </select>
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            <option value="AUD">AUD</option>
            <option value="USD">USD</option>
          </select>
          <input
            placeholder="Detail type / Institution"
            value={form.institution}
            onChange={(e) => setForm({ ...form, institution: e.target.value })}
          />
          <input
            placeholder="Notes"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
          {editing ? (
            <>
              <button onClick={saveEdit}>Save</button>
              <button onClick={cancelEdit}>Cancel</button>
            </>
          ) : (
            <button onClick={submit}>Create</button>
          )}
        </div>
      </div>
      <div className="panel">
        <BoxTitle title="Chart of accounts" />
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Detail</th>
              <th>Currency</th>
              <th>Balance</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td>{account.type}</td>
                <td>{account.detail_type || account.institution || account.note || "—"}</td>
                <td>{account.currency}</td>
                <td>{formatCurrency(balances[account.id] ?? 0, account.currency)}</td>
                <td>
                  <button className="button-ghost" onClick={() => onOpenRegister(account.id)}>
                    Open register
                  </button>
                  <button className="button-ghost" onClick={onOpenReport}>
                    View reports
                  </button>
                  <button onClick={() => startEdit(account)}>Edit</button>
                  <button onClick={() => deleteAccount(account.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Transactions({
  accountFocus,
  onConsumeAccountFocus
}: {
  accountFocus: string;
  onConsumeAccountFocus: () => void;
}) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filters, setFilters] = useState({ search: "", account_id: "all", category_id: "all" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<Record<number, any[]>>({});
  const [mergeForm, setMergeForm] = useState({ primary_id: "", duplicate_id: "" });
  const [splitInputs, setSplitInputs] = useState<
    Record<number, { category_id: string; subcategory_id: string; subcategory_name: string; amount: string }>
  >({});
  const [txnError, setTxnError] = useState<string | null>(null);
  const [txnAttempted, setTxnAttempted] = useState(false);
  const [autoClassifyBusy, setAutoClassifyBusy] = useState(false);
  const [autoClassifyStatus, setAutoClassifyStatus] = useState<string | null>(null);
  const [autoClassifyError, setAutoClassifyError] = useState<string | null>(null);
  const [reviewBulkCategoryId, setReviewBulkCategoryId] = useState("");
  const [reviewBulkBusy, setReviewBulkBusy] = useState(false);
  const [reviewBulkStatus, setReviewBulkStatus] = useState<string | null>(null);
  const [reviewBulkError, setReviewBulkError] = useState<string | null>(null);
  const [registerPage, setRegisterPage] = useState(1);
  const [registerPageSize, setRegisterPageSize] = useState(50);
  const [expandedTransactionId, setExpandedTransactionId] = useState<number | null>(null);
  const [form, setForm] = useState({
    account_id: "",
    date: "",
    description: "",
    amount: "",
    currency: "AUD",
    payee: "",
    notes: ""
  });

  const load = async () => {
    const [txns, accs, cats] = await Promise.all([
      apiGet<any[]>("/transactions/details"),
      apiGet<any[]>("/accounts"),
      apiGet<any[]>("/categories")
    ]);
    setTransactions(txns);
    setAccounts(accs);
    setCategories(cats);
  };

  const subcategoriesForCategory = (categoryId: string) => {
    const selected = categories.find((category) => String(category.id) === categoryId);
    return selected?.subcategories || [];
  };

  const formatSplitCategoryLabel = (split: any) =>
    split.subcategory_name
      ? `${split.category_name || "Uncategorized"} / ${split.subcategory_name}`
      : split.category_name || "Uncategorized";

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!accountFocus) return;
    setFilters((prev) => ({ ...prev, account_id: accountFocus }));
    onConsumeAccountFocus();
  }, [accountFocus, onConsumeAccountFocus]);

  useEffect(() => {
    setRegisterPage(1);
  }, [filters.search, filters.account_id, filters.category_id, registerPageSize]);

  const submit = async () => {
    setTxnAttempted(true);
    setTxnError(null);
    if (!form.account_id) {
      setTxnError("Select an account.");
      return;
    }
    if (!form.date) {
      setTxnError("Date is required.");
      return;
    }
    if (!form.description.trim()) {
      setTxnError("Description is required.");
      return;
    }
    const amountValue = Number(form.amount);
    if (!Number.isFinite(amountValue) || amountValue === 0) {
      setTxnError("Amount must be a non-zero number.");
      return;
    }
    try {
      await apiPost("/transactions", {
        account_id: Number(form.account_id),
        date: form.date,
        description: form.description,
        amount: amountValue,
        currency: form.currency,
        payee: form.payee || undefined,
        notes: form.notes || undefined
      });
      setForm({ account_id: "", date: "", description: "", amount: "", currency: "AUD", payee: "", notes: "" });
      setTxnAttempted(false);
      load();
    } catch (err) {
      setTxnError(err instanceof Error ? err.message : "Unable to save transaction.");
    }
  };

  const startEdit = (txn: any) => {
    setEditingId(txn.id);
    setForm({
      account_id: String(txn.account_id),
      date: txn.date,
      description: txn.description,
      amount: String(txn.amount),
      currency: txn.currency,
      payee: txn.payee || "",
      notes: txn.notes || ""
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setTxnAttempted(true);
    setTxnError(null);
    if (!form.account_id) {
      setTxnError("Select an account.");
      return;
    }
    if (!form.date) {
      setTxnError("Date is required.");
      return;
    }
    if (!form.description.trim()) {
      setTxnError("Description is required.");
      return;
    }
    const amountValue = Number(form.amount);
    if (!Number.isFinite(amountValue) || amountValue === 0) {
      setTxnError("Amount must be a non-zero number.");
      return;
    }
    try {
      await apiPost(`/transactions/${editingId}`, {
        account_id: Number(form.account_id),
        date: form.date,
        description: form.description,
        amount: amountValue,
        currency: form.currency,
        payee: form.payee || undefined,
        notes: form.notes || undefined
      });
      setEditingId(null);
      setForm({ account_id: "", date: "", description: "", amount: "", currency: "AUD", payee: "", notes: "" });
      setTxnAttempted(false);
      load();
    } catch (err) {
      setTxnError(err instanceof Error ? err.message : "Unable to update transaction.");
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ account_id: "", date: "", description: "", amount: "", currency: "AUD", payee: "", notes: "" });
    setTxnAttempted(false);
    setTxnError(null);
  };

  const deleteTxn = async (txnId: number) => {
    await apiDelete(`/transactions/${txnId}`);
    load();
  };

  const autoClassifyAll = async () => {
    setAutoClassifyError(null);
    setAutoClassifyStatus(null);
    setAutoClassifyBusy(true);
    try {
      const targetIds = transactions
        .filter((txn) => !txn.splits || txn.splits.length === 0)
        .map((txn) => txn.id);
      const hasUncategorized = targetIds.length > 0;
      const batchSize = 200;
      let totalClassified = 0;
      let totalErrors = 0;
      if (hasUncategorized) {
        for (let i = 0; i < targetIds.length; i += batchSize) {
          const batch = targetIds.slice(i, i + batchSize);
          const result = await apiPost<any>("/classify/bulk", { transaction_ids: batch, force: false });
          totalClassified += Number(result?.classified || 0);
          if (Array.isArray(result?.errors)) {
            totalErrors += result.errors.length;
          }
          const progress = formatCount(Math.min(i + batch.length, targetIds.length));
          const total = formatCount(targetIds.length);
          const suffix = totalErrors ? ` · ${formatCount(totalErrors)} errors` : "";
          setAutoClassifyStatus(`Auto-categorized ${progress} of ${total}${suffix}.`);
        }
      } else {
        setAutoClassifyStatus("No uncategorized transactions found.");
      }
      const verifyResult = await apiPost<any>("/transactions/verify-categorized", {});
      const verifiedCount = Number(verifyResult?.updated || 0);
      const statusParts: string[] = [];
      if (hasUncategorized) {
        statusParts.push(`Auto-categorized ${formatCount(totalClassified)} transactions`);
        if (totalErrors) {
          statusParts.push(`${formatCount(totalErrors)} errors`);
        }
      } else {
        statusParts.push("No uncategorized transactions found");
      }
      if (verifiedCount) {
        statusParts.push(`Verified ${formatCount(verifiedCount)} categorized transactions`);
      }
      setAutoClassifyStatus(`${statusParts.join(" · ")}.`);
    } catch (err) {
      setAutoClassifyError(err instanceof Error ? err.message : "Auto-categorize failed.");
    } finally {
      setAutoClassifyBusy(false);
      load();
    }
  };

  const classifyOne = async (transactionId: number) => {
    await apiPost(`/classify/transactions/${transactionId}`);
    load();
  };

  const addSplit = async (
    transactionId: number,
    categoryId: number,
    amount: number,
    currency: string,
    subcategoryId?: number | null,
    subcategoryName?: string,
    options?: { reload?: boolean }
  ) => {
    await apiPost(`/transactions/${transactionId}/splits`, {
      transaction_id: transactionId,
      category_id: categoryId,
      subcategory_id: subcategoryId || undefined,
      subcategory_name: subcategoryName?.trim() || undefined,
      amount,
      currency,
      classification: "Personal"
    });
    if (options?.reload !== false) {
      load();
    }
  };

  const updateSplitInput = (
    transactionId: number,
    field: "category_id" | "subcategory_id" | "subcategory_name" | "amount",
    value: string
  ) => {
    setSplitInputs((prev) => ({
      ...prev,
      [transactionId]: (() => {
        const current = {
          category_id: prev[transactionId]?.category_id || "",
          subcategory_id: prev[transactionId]?.subcategory_id || "",
          subcategory_name: prev[transactionId]?.subcategory_name || "",
          amount: prev[transactionId]?.amount || ""
        };
        if (field === "category_id") {
          return { ...current, category_id: value, subcategory_id: "", subcategory_name: "" };
        }
        if (field === "subcategory_name") {
          return { ...current, subcategory_name: value, subcategory_id: value ? "" : current.subcategory_id };
        }
        return { ...current, [field]: value };
      })()
    }));
  };

  const submitSplit = async (txn: any) => {
    const input = splitInputs[txn.id];
    if (!input?.category_id) return;
    const amount = input.amount ? Number(input.amount) : Number(txn.amount);
    await addSplit(
      txn.id,
      Number(input.category_id),
      amount,
      txn.currency,
      input.subcategory_name.trim() ? undefined : (input.subcategory_id ? Number(input.subcategory_id) : undefined),
      input.subcategory_name
    );
    setSplitInputs((prev) => ({
      ...prev,
      [txn.id]: { category_id: "", subcategory_id: "", subcategory_name: "", amount: "" }
    }));
  };

  const deleteSplit = async (splitId: number) => {
    await apiDelete(`/transactions/splits/${splitId}`);
    load();
  };

  const updateReconcile = async (transactionId: number, state: string) => {
    await apiPost(`/transactions/${transactionId}/reconcile`, { reconciliation_state: state });
    load();
  };

  const loadAttachments = async (transactionId: number) => {
    const data = await apiGet<any[]>(`/transactions/${transactionId}/attachments`);
    setAttachments((prev) => ({ ...prev, [transactionId]: data }));
  };

  const uploadAttachment = async (transactionId: number, file: File | null) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    await fetch(`${API_BASE}/transactions/${transactionId}/attachments`, { method: "POST", body: formData });
    await loadAttachments(transactionId);
  };

  const removeAttachment = async (transactionId: number, attachmentId: number) => {
    await apiDelete(`/transactions/attachments/${attachmentId}`);
    await loadAttachments(transactionId);
  };

  const mergeTransactions = async () => {
    if (!mergeForm.primary_id || !mergeForm.duplicate_id) return;
    await apiPost("/transactions/merge", {
      primary_id: Number(mergeForm.primary_id),
      duplicate_id: Number(mergeForm.duplicate_id)
    });
    setMergeForm({ primary_id: "", duplicate_id: "" });
    load();
  };

  const reviewTransactions = transactions.filter((txn) =>
    ["pending", "imported"].includes(txn.reconciliation_state || "imported")
  );
  const reviewTotal = reviewTransactions.reduce((sum, txn) => sum + Number(txn.amount || 0), 0);
  const uncategorizedReviewTransactions = reviewTransactions.filter((txn) => !txn.splits || txn.splits.length === 0);

  const applyCategoryToReview = async () => {
    setReviewBulkError(null);
    setReviewBulkStatus(null);
    if (!reviewBulkCategoryId) {
      setReviewBulkError("Select a category to apply across the review box.");
      return;
    }
    const targetTransactions = uncategorizedReviewTransactions;
    if (targetTransactions.length === 0) {
      setReviewBulkStatus("No uncategorized review transactions found.");
      return;
    }
    setReviewBulkBusy(true);
    try {
      let applied = 0;
      let errors = 0;
      const categoryId = Number(reviewBulkCategoryId);
      for (const txn of targetTransactions) {
        try {
          await addSplit(txn.id, categoryId, Number(txn.amount), txn.currency, undefined, undefined, { reload: false });
          applied += 1;
        } catch (_err) {
          errors += 1;
        }
      }
      const skipped = reviewTransactions.length - targetTransactions.length;
      const parts = [`Applied to ${formatCount(applied)} transactions`];
      if (skipped > 0) {
        parts.push(`Skipped ${formatCount(skipped)} already categorized`);
      }
      if (errors > 0) {
        parts.push(`${formatCount(errors)} errors`);
      }
      setReviewBulkStatus(`${parts.join(" · ")}.`);
      setReviewBulkCategoryId("");
    } catch (err) {
      setReviewBulkError(err instanceof Error ? err.message : "Unable to apply category across review transactions.");
    } finally {
      setReviewBulkBusy(false);
      load();
    }
  };

  const filtered = transactions.filter((txn) => {
    const matchesSearch =
      !filters.search ||
      `${txn.description} ${txn.payee || ""}`.toLowerCase().includes(filters.search.toLowerCase());
    const matchesAccount =
      filters.account_id === "all" || String(txn.account_id) === filters.account_id;
    const matchesCategory =
      filters.category_id === "all" ||
      (txn.splits || []).some((split: any) => String(split.category_id) === filters.category_id);
    return matchesSearch && matchesAccount && matchesCategory;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / registerPageSize));
  useEffect(() => {
    if (registerPage > totalPages) {
      setRegisterPage(totalPages);
    }
  }, [registerPage, totalPages]);
  const startIndex = filtered.length === 0 ? 0 : (registerPage - 1) * registerPageSize + 1;
  const endIndex = Math.min(registerPage * registerPageSize, filtered.length);
  const pagedFiltered = filtered.slice((registerPage - 1) * registerPageSize, registerPage * registerPageSize);
  const summarizeTxnCategory = (txn: any) => {
    const splits = txn.splits || [];
    if (!splits.length) return "Uncategorized";
    if (splits.length === 1) return formatSplitCategoryLabel(splits[0]);
    return `${formatSplitCategoryLabel(splits[0])} +${formatCount(splits.length - 1)}`;
  };
  const toggleTransactionDetails = async (txnId: number) => {
    if (expandedTransactionId === txnId) {
      setExpandedTransactionId(null);
      return;
    }
    setExpandedTransactionId(txnId);
    await loadAttachments(txnId).catch(() => undefined);
  };

  return (
    <div className="page">
      <SectionHeader title="Banking Inbox" subtitle="For review, match, categorize, and post transactions." />
      <div className="page-actions">
        <div>
          <strong>Auto-categorize</strong>
          <span className="muted">Run across {formatCount(transactions.length)} transactions.</span>
        </div>
        <button onClick={autoClassifyAll} disabled={autoClassifyBusy}>
          {autoClassifyBusy ? "Auto-categorizing…" : "Auto-categorize all"}
        </button>
      </div>
      {autoClassifyError && <p className="form-error">{autoClassifyError}</p>}
      {autoClassifyStatus && <p className="muted">{autoClassifyStatus}</p>}
      <div className="panel review-panel">
        <BoxTitle title="For review" />
        <div className="review-summary">
          <div>
            <strong>{formatCount(reviewTransactions.length)}</strong>
            <span className="muted">Waiting review</span>
          </div>
          <div>
            <strong>{formatAmount(reviewTotal)}</strong>
            <span className="muted">Total value</span>
          </div>
        </div>
        {categories.length > 0 && (
          <div className="row">
            <select
              value={reviewBulkCategoryId}
              onChange={(e) => setReviewBulkCategoryId(e.target.value)}
              disabled={reviewBulkBusy || uncategorizedReviewTransactions.length === 0}
            >
              <option value="">Apply one category to all uncategorized review items</option>
              {categories.map((cat) => (
                <option key={`review-bulk-${cat.id}`} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <button
              onClick={applyCategoryToReview}
              disabled={reviewBulkBusy || !reviewBulkCategoryId || uncategorizedReviewTransactions.length === 0}
            >
              {reviewBulkBusy
                ? "Applying…"
                : `Apply to ${formatCount(uncategorizedReviewTransactions.length)} uncategorized`}
            </button>
          </div>
        )}
        {reviewBulkError && <p className="form-error">{reviewBulkError}</p>}
        {reviewBulkStatus && <p className="muted">{reviewBulkStatus}</p>}
        {reviewTransactions.length === 0 ? (
          <p className="muted">All caught up. New imports will show here.</p>
        ) : (
          <div className="review-list">
            {reviewTransactions.map((txn) => {
              const suggested = (txn.splits || []).length > 0
                ? formatSplitCategoryLabel((txn.splits || [])[0])
                : "Uncategorized";
              return (
                <div key={`review-${txn.id}`} className="review-item">
                  <div className="review-main">
                    <div className="review-title">{txn.payee || txn.description}</div>
                    <div className="review-sub muted">
                      {txn.date} - {txn.account_name}
                    </div>
                    <div className="review-sub muted">Suggested: {suggested}</div>
                    {txn.classification_source && (
                      <div className="review-sub muted">
                        Source: {txn.classification_source}
                        {txn.classification_note ? ` · ${txn.classification_note}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="review-amount">{formatCurrency(txn.amount, txn.currency)}</div>
                  <div className="review-actions">
                    {categories.length > 0 && (
                      <div className="row">
                        <input
                          placeholder="Split amount"
                          value={splitInputs[txn.id]?.amount || ""}
                          onChange={(e) => updateSplitInput(txn.id, "amount", e.target.value)}
                        />
                        <select
                          value={splitInputs[txn.id]?.category_id || ""}
                          onChange={(e) => updateSplitInput(txn.id, "category_id", e.target.value)}
                        >
                          <option value="">Category</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                            ))}
                        </select>
                        <select
                          value={splitInputs[txn.id]?.subcategory_id || ""}
                          onChange={(e) => updateSplitInput(txn.id, "subcategory_id", e.target.value)}
                          disabled={!splitInputs[txn.id]?.category_id || Boolean(splitInputs[txn.id]?.subcategory_name)}
                        >
                          <option value="">Subcategory</option>
                          {subcategoriesForCategory(splitInputs[txn.id]?.category_id || "").map((subcategory: any) => (
                            <option key={`review-subcategory-${txn.id}-${subcategory.id}`} value={subcategory.id}>
                              {subcategory.name}
                            </option>
                          ))}
                        </select>
                        <input
                          placeholder="New subcategory"
                          value={splitInputs[txn.id]?.subcategory_name || ""}
                          onChange={(e) => updateSplitInput(txn.id, "subcategory_name", e.target.value)}
                          disabled={!splitInputs[txn.id]?.category_id}
                        />
                        <button onClick={() => submitSplit(txn)}>Split</button>
                      </div>
                    )}
                    <div className="row">
                      <button className="button-ghost" onClick={() => classifyOne(txn.id)}>
                        Auto-categorize
                      </button>
                      <button className="button-ghost" onClick={() => updateReconcile(txn.id, "verified")}>
                        Match
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="panel">
        <BoxTitle title={editingId ? "Edit transaction" : "Post transaction"} />
        {txnError && <p className="form-error">{txnError}</p>}
        <div className="row">
          <select
            className={txnAttempted && !form.account_id ? "field-error" : ""}
            value={form.account_id}
            onChange={(e) => setForm({ ...form, account_id: e.target.value })}
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </option>
            ))}
          </select>
          <input
            type="date"
            value={toDateValue(form.date)}
            className={txnAttempted && !form.date ? "field-error" : ""}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <input placeholder="Payee" value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} />
          <input
            placeholder="Description"
            value={form.description}
            className={txnAttempted && !form.description.trim() ? "field-error" : ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <input
            placeholder="Amount"
            value={form.amount}
            className={
              txnAttempted && (!form.amount || Number(form.amount) === 0 || Number.isNaN(Number(form.amount)))
                ? "field-error"
                : ""
            }
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            <option value="AUD">AUD</option>
            <option value="USD">USD</option>
          </select>
          <input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {editingId ? (
            <>
              <button onClick={saveEdit}>Save</button>
              <button onClick={cancelEdit}>Cancel</button>
            </>
          ) : (
            <button onClick={submit}>Create</button>
          )}
        </div>
      </div>
      <div className="panel">
        <BoxTitle title="Banking register" />
        <div className="row">
          <span className="muted">
            Showing {formatCount(startIndex)}-{formatCount(endIndex)} of {formatCount(filtered.length)}
          </span>
          <div className="row">
            <span className="muted">Rows</span>
            <select
              value={registerPageSize}
              onChange={(e) => setRegisterPageSize(Number(e.target.value))}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>
          <div className="row">
            <button
              className="button-ghost"
              onClick={() => setRegisterPage((page) => Math.max(1, page - 1))}
              disabled={registerPage <= 1}
            >
              Prev
            </button>
            <span className="muted">
              Page {formatCount(registerPage)} of {formatCount(totalPages)}
            </span>
            <button
              className="button-ghost"
              onClick={() => setRegisterPage((page) => Math.min(totalPages, page + 1))}
              disabled={registerPage >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
        <div className="row">
          <input
            placeholder="Search"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <select
            value={filters.account_id}
            onChange={(e) => setFilters({ ...filters, account_id: e.target.value })}
          >
            <option value="all">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <select
            value={filters.category_id}
            onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}
          >
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry</th>
              <th>Account</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {pagedFiltered.map((txn) => {
              const isExpanded = expandedTransactionId === txn.id;
              return (
                <Fragment key={txn.id}>
                  <tr>
                    <td>{txn.date}</td>
                    <td>
                      <div className="table-compact-title">{txn.payee || txn.description}</div>
                      <div className="table-compact-meta">{txn.description}</div>
                    </td>
                    <td>{txn.account_name}</td>
                    <td>{formatCurrency(txn.amount, txn.currency)}</td>
                    <td>
                      <div className="table-status-stack">
                        <span className={`status-pill status-${String(txn.reconciliation_state || "imported").toLowerCase()}`}>
                          {txn.reconciliation_state || "imported"}
                        </span>
                        <div className="table-compact-meta">
                          {(txn.classification || "Personal")} · {summarizeTxnCategory(txn)}
                        </div>
                      </div>
                    </td>
                    <td>
                      <RowDisclosureButton open={isExpanded} onClick={() => toggleTransactionDetails(txn.id)} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="table-detail-row">
                      <td colSpan={6}>
                        <div className="table-detail-grid">
                          <div className="table-detail-card">
                            <div className="table-detail-title">Classification + register controls</div>
                            <div className="row">
                              <select
                                value={txn.classification || "Personal"}
                                onChange={(e) =>
                                  apiPost(`/transactions/${txn.id}`, {
                                    classification: e.target.value
                                  }).then(load)
                                }
                              >
                                <option value="Personal">Personal</option>
                                <option value="Business">Business</option>
                                <option value="Split">Split</option>
                              </select>
                              <select
                                value={txn.reconciliation_state || "imported"}
                                onChange={(e) => updateReconcile(txn.id, e.target.value)}
                              >
                                <option value="imported">Imported</option>
                                <option value="pending">Pending</option>
                                <option value="cleared">Cleared</option>
                                <option value="verified">Verified</option>
                              </select>
                              <button onClick={() => classifyOne(txn.id)}>Classify</button>
                              <button className="button-ghost" onClick={() => startEdit(txn)}>Edit</button>
                              <button onClick={() => deleteTxn(txn.id)}>Delete</button>
                            </div>
                            {(txn.classification_source || txn.classification_note || txn.notes) && (
                              <div className="table-detail-copy">
                                {txn.classification_source && (
                                  <div className="muted">
                                    Source: {txn.classification_source}
                                    {txn.classification_note ? ` · ${txn.classification_note}` : ""}
                                  </div>
                                )}
                                {txn.notes && <div className="muted">Notes: {txn.notes}</div>}
                              </div>
                            )}
                            <div className="table-detail-copy">
                              {(txn.splits || []).length > 0 ? (
                                (txn.splits || []).map((split: any, idx: number) => (
                                  <div key={`${txn.id}-split-${idx}`} className="row">
                                    <span>
                                      {formatSplitCategoryLabel(split)} (
                                      {formatCurrency(split.amount, split.currency || txn.currency)})
                                    </span>
                                    {split.split_id && (
                                      <button onClick={() => deleteSplit(split.split_id)}>Remove</button>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <div className="muted">No category splits yet.</div>
                              )}
                            </div>
                            {categories.length > 0 && (
                              <div className="row">
                                <input
                                  placeholder="Split amount"
                                  value={splitInputs[txn.id]?.amount || ""}
                                  onChange={(e) => updateSplitInput(txn.id, "amount", e.target.value)}
                                />
                                <select
                                  value={splitInputs[txn.id]?.category_id || ""}
                                  onChange={(e) => updateSplitInput(txn.id, "category_id", e.target.value)}
                                >
                                  <option value="">Category</option>
                                  {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                      {cat.name}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={splitInputs[txn.id]?.subcategory_id || ""}
                                  onChange={(e) => updateSplitInput(txn.id, "subcategory_id", e.target.value)}
                                  disabled={!splitInputs[txn.id]?.category_id || Boolean(splitInputs[txn.id]?.subcategory_name)}
                                >
                                  <option value="">Subcategory</option>
                                  {subcategoriesForCategory(splitInputs[txn.id]?.category_id || "").map((subcategory: any) => (
                                    <option key={`register-subcategory-${txn.id}-${subcategory.id}`} value={subcategory.id}>
                                      {subcategory.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  placeholder="New subcategory"
                                  value={splitInputs[txn.id]?.subcategory_name || ""}
                                  onChange={(e) => updateSplitInput(txn.id, "subcategory_name", e.target.value)}
                                  disabled={!splitInputs[txn.id]?.category_id}
                                />
                                <button onClick={() => submitSplit(txn)}>Add split</button>
                              </div>
                            )}
                          </div>
                          <div className="table-detail-card">
                            <div className="table-detail-title">Attachments</div>
                            <div className="row">
                              <input
                                type="file"
                                onChange={(e) => uploadAttachment(txn.id, e.target.files?.[0] || null)}
                              />
                              <button className="button-ghost" onClick={() => loadAttachments(txn.id)}>Refresh</button>
                            </div>
                            <div className="table-detail-copy">
                              {(attachments[txn.id] || []).length === 0 ? (
                                <div className="muted">No attachments on this transaction.</div>
                              ) : (
                                (attachments[txn.id] || []).map((attachment: any) => (
                                  <div key={`att-${attachment.id}`} className="row">
                                    <a
                                      href={`${API_BASE}/transactions/attachments/${attachment.id}/download`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {attachment.file_name || `Attachment ${attachment.id}`}
                                    </a>
                                    <button onClick={() => removeAttachment(txn.id, attachment.id)}>Remove</button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <BoxTitle title="Merge duplicates" />
        <div className="row">
          <input
            placeholder="Primary transaction ID"
            value={mergeForm.primary_id}
            onChange={(e) => setMergeForm({ ...mergeForm, primary_id: e.target.value })}
          />
          <input
            placeholder="Duplicate transaction ID"
            value={mergeForm.duplicate_id}
            onChange={(e) => setMergeForm({ ...mergeForm, duplicate_id: e.target.value })}
          />
          <button onClick={mergeTransactions}>Merge</button>
        </div>
      </div>
    </div>
  );
}

function Budgets() {
  const [months, setMonths] = useState<any[]>([]);
  const [matrixCategories, setMatrixCategories] = useState<any[]>([]);
  const [matrixYear, setMatrixYear] = useState(String(new Date().getFullYear()));
  const [budgetMatrix, setBudgetMatrix] = useState<any | null>(null);
  const [matrixEdits, setMatrixEdits] = useState<Record<string, Record<string, string>>>({});
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrixBusy, setMatrixBusy] = useState(false);
  const [matrixBaseCurrency, setMatrixBaseCurrency] = useState("USD");
  const [matrixBaseCurrencyStatus, setMatrixBaseCurrencyStatus] = useState<string | null>(null);
  const [matrixDrilldown, setMatrixDrilldown] = useState<any | null>(null);
  const [matrixDrilldownAssignments, setMatrixDrilldownAssignments] = useState<Record<string, string>>({});
  const [matrixDrilldownBusySplitId, setMatrixDrilldownBusySplitId] = useState<number | null>(null);
  const [expandedMatrixRows, setExpandedMatrixRows] = useState<Record<string, boolean>>({});
  const [addingMatrixSubcategoryFor, setAddingMatrixSubcategoryFor] = useState<string | null>(null);
  const [matrixSubcategoryDrafts, setMatrixSubcategoryDrafts] = useState<Record<string, string>>({});
  const [editingMatrixSubcategoryId, setEditingMatrixSubcategoryId] = useState<string | null>(null);
  const [matrixSubcategoryRenameValues, setMatrixSubcategoryRenameValues] = useState<Record<string, string>>({});

  const loadMonths = async () => {
    const monthData = await apiGet<any[]>("/budgets");
    setMonths(monthData);
  };

  const loadMatrixCategories = async () => {
    const categoryData = await apiGet<any[]>("/categories");
    setMatrixCategories(categoryData);
    return categoryData;
  };

  useEffect(() => {
    loadMonths().catch(() => undefined);
    loadMatrixCategories().catch(() => undefined);
  }, []);

  const loadMatrix = async (yearValue?: string) => {
    const year = yearValue || matrixYear;
    const data = await apiGet<any>(`/reports/budget-matrix?year=${year}`);
    setBudgetMatrix(data);
    setMatrixDrilldown(null);
    setMatrixBaseCurrency(data.base_currency || "USD");
    const edits: Record<string, Record<string, string>> = {};
    (data.categories || []).forEach((category: any) => {
      const monthMap: Record<string, string> = {};
      (data.months || []).forEach((month: string) => {
        const plannedEntered = Boolean(category.budget_entered?.[month]);
        const plannedAmount = Number(category.budget?.[month] || 0);
        const actualAmount =
          category.type === "income"
            ? Number(category.income?.[month] || 0)
            : Number(category.expense?.[month] || 0);
        if (plannedEntered) {
          monthMap[month] = String(plannedAmount);
        } else if (actualAmount > 0) {
          monthMap[month] = actualAmount.toFixed(2);
        } else {
          monthMap[month] = "";
        }
      });
      edits[String(category.id)] = monthMap;
    });
    setMatrixEdits(edits);
    return data;
  };

  useEffect(() => {
    loadMatrix().catch(() => undefined);
  }, [matrixYear]);

  useEffect(() => {
    if (!matrixDrilldown) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMatrixDrilldown(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [matrixDrilldown]);

  const ensureMonthId = async (month: string) => {
    const existing = months.find((row) => row.month === month);
    if (existing) return existing.id;
    const created = await apiPost<any>("/budgets/months", { month, rollover_enabled: false });
    setMonths((prev) => [...prev, created]);
    return created.id;
  };

  const updateMatrixCell = (bucketKey: string, month: string, value: string) => {
    setMatrixEdits((prev) => ({
      ...prev,
      [bucketKey]: {
        ...(prev[bucketKey] || {}),
        [month]: value
      }
    }));
  };

  const monthMeta = budgetMatrix?.month_meta || {};
  const currentBudgetMonth = budgetMatrix?.current_month || currentMonthLabel();
  const getMonthState = (month: string) => String(monthMeta?.[month]?.state || monthStateLabel(month, currentBudgetMonth));
  const isMonthEditable = (month: string) => getMonthState(month) !== "past";
  const getRowActual = (row: any, month: string) =>
    Number(row[row.type === "income" ? "income" : "expense"]?.[month] || 0);
  const getCellInputValue = (row: any, month: string) => {
    const raw = matrixEdits[String(row.id)]?.[month];
    if (getMonthState(month) === "past") {
      const actual = getRowActual(row, month);
      return actual > 0 ? actual.toFixed(2) : "";
    }
    if (raw !== undefined) return raw;
    const actual = getRowActual(row, month);
    return actual > 0 ? actual.toFixed(2) : "";
  };
  const getEffectiveCellAmount = (row: any, month: string) => {
    const actual = getRowActual(row, month);
    if (getMonthState(month) === "past") {
      return actual;
    }
    const raw = matrixEdits[String(row.id)]?.[month];
    if (raw !== undefined && raw !== "") {
      const amount = Number(raw);
      if (Number.isFinite(amount)) return amount;
    }
    return actual;
  };

  const getBucketRow = (bucketKey: string) =>
    (budgetMatrix?.categories || []).find((row: any) => String(row.id) === bucketKey);
  const getMatrixCategoryForRow = (row: any) =>
    (matrixCategories || []).find((category: any) => category.name === row.name);
  const matrixSubcategoriesForBucket = (bucketName: string) =>
    ((matrixCategories || []).find((category: any) => category.name === bucketName)?.subcategories || []);

  const hasSubcategoryRows = (row: any) => (row?.subcategories || []).length > 0;
  const isMatrixRowExpanded = (rowId: string) => Boolean(expandedMatrixRows[rowId]);
  const toggleMatrixRowExpanded = (rowId: string) => {
    setExpandedMatrixRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };
  const startAddingMatrixSubcategory = (rowId: string) => {
    setAddingMatrixSubcategoryFor(rowId);
    setMatrixSubcategoryDrafts((prev) => ({ ...prev, [rowId]: prev[rowId] || "" }));
  };

  const loadMatrixDrilldownData = async ({
    left,
    top,
    row,
    month,
    subcategory
  }: {
    left: number;
    top: number;
    row: any;
    month: string;
    subcategory?: any | null;
  }) => {
    const actual =
      row.type === "income" ? Number(row.income?.[month] || 0) : Number(row.expense?.[month] || 0);
    const nextSubcategory = subcategory || null;
    const rowName = nextSubcategory ? `${row.name} / ${nextSubcategory.name}` : row.name;
    setMatrixDrilldownAssignments({});
    setMatrixDrilldown({
      left,
      top,
      month,
      rowName,
      bucket_key: String(row.id),
      bucket_type: row.type,
      bucket_name: row.name,
      subcategory_name: nextSubcategory?.name || null,
      subcategory_id: nextSubcategory?.subcategory_id || null,
      unassigned: Boolean(nextSubcategory?.is_unassigned),
      actual_total: actual,
      transactions: [],
      loading: true,
      error: null
    });
    try {
      const query = new URLSearchParams({
        month,
        bucket: String(row.id)
      });
      if (nextSubcategory?.subcategory_id) {
        query.set("subcategory_id", String(nextSubcategory.subcategory_id));
      } else if (nextSubcategory?.is_unassigned) {
        query.set("unassigned", "true");
      }
      const data = await apiGet<any>(`/reports/budget-cell-transactions?${query.toString()}`);
      setMatrixDrilldown({
        ...data,
        left,
        top,
        rowName,
        bucket_key: String(row.id),
        bucket_type: row.type,
        subcategory_name: nextSubcategory?.name || null,
        subcategory_id: nextSubcategory?.subcategory_id || null,
        unassigned: Boolean(nextSubcategory?.is_unassigned),
        loading: false,
        error: null
      });
    } catch (err) {
      setMatrixDrilldown({
        left,
        top,
        month,
        rowName,
        bucket_key: String(row.id),
        bucket_type: row.type,
        bucket_name: row.name,
        subcategory_name: nextSubcategory?.name || null,
        subcategory_id: nextSubcategory?.subcategory_id || null,
        unassigned: Boolean(nextSubcategory?.is_unassigned),
        actual_total: actual,
        transactions: [],
        loading: false,
        error: err instanceof Error ? err.message : "Unable to load transactions."
      });
    }
  };

  const openMatrixDrilldown = async (
    event: React.MouseEvent,
    row: any,
    month: string,
    options?: { subcategory?: any }
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const panelWidth = 360;
    const panelHeight = 420;
    const gutter = 16;
    const left =
      typeof window !== "undefined"
        ? Math.max(gutter, Math.min(event.clientX, window.innerWidth - panelWidth - gutter))
        : event.clientX;
    const top =
      typeof window !== "undefined"
        ? Math.max(gutter, Math.min(event.clientY, window.innerHeight - panelHeight - gutter))
        : event.clientY;
    await loadMatrixDrilldownData({ left, top, row, month, subcategory: options?.subcategory || null });
  };

  const applyMatrixDrilldownSubcategory = async (txn: any) => {
    const splitId = Number(txn.split_id || 0);
    const selectedValue = matrixDrilldownAssignments[String(splitId)] ?? (txn.subcategory_id ? String(txn.subcategory_id) : "");
    const subcategoryId = Number(selectedValue || 0);
    const rowCategory = matrixDrilldown ? (matrixCategories || []).find((category: any) => category.name === matrixDrilldown.bucket_name) : null;
    if (!splitId || !subcategoryId || !rowCategory?.id || !matrixDrilldown) {
      setMatrixError("Select a subcategory before applying it.");
      return;
    }
    setMatrixError(null);
    setMatrixBusy(true);
    setMatrixDrilldownBusySplitId(splitId);
    try {
      const result = await apiPost<any>(`/transactions/splits/${splitId}`, {
        category_id: rowCategory.id,
        subcategory_id: subcategoryId,
        classification: "Personal",
        cascade_matching_merchant: true
      });
      await loadMatrixCategories();
      const nextMatrix = await loadMatrix(matrixYear);
      const refreshedRow =
        (nextMatrix?.categories || []).find((row: any) => String(row.id) === String(matrixDrilldown.bucket_key)) ||
        {
          id: matrixDrilldown.bucket_key,
          name: matrixDrilldown.bucket_name,
          type: matrixDrilldown.bucket_type,
          income: {},
          expense: {},
        };
      const refreshSubcategory =
        matrixDrilldown.subcategory_id
          ? { subcategory_id: matrixDrilldown.subcategory_id, name: matrixDrilldown.subcategory_name }
          : matrixDrilldown.unassigned
            ? { is_unassigned: true, name: matrixDrilldown.subcategory_name || "Unassigned" }
            : null;
      await loadMatrixDrilldownData({
        left: matrixDrilldown.left,
        top: matrixDrilldown.top,
        row: refreshedRow,
        month: matrixDrilldown.month,
        subcategory: refreshSubcategory,
      });
      const cascaded = Number(result?.updated || 0);
      setMatrixBaseCurrencyStatus(
        cascaded > 0
          ? `Subcategory applied and cascaded to ${formatCount(cascaded)} matching transactions.`
          : "Subcategory applied."
      );
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to apply subcategory.");
    } finally {
      setMatrixBusy(false);
      setMatrixDrilldownBusySplitId(null);
    }
  };

  const assertMatrixBudgetable = () => {
    const invalid = invalidMonths.filter((row) => row.state !== "past");
    if (!invalid.length) return;
    const first = invalid[0];
    throw new Error(
      `${formatMonthLabel(first.month)} projected closing checking balance would be ${formatCurrency(
        first.plannedClosingBalance,
        budgetCurrency
      )}, below the allowed buffer of ${formatCurrency(-50, budgetCurrency)}.`
    );
  };

  const persistMatrixBucket = async (
    row: any,
    monthIds: Record<string, number>
  ) => {
    const bucketKey = String(row.id);
    for (const month of budgetMatrix?.months || []) {
      if (!isMonthEditable(month)) continue;
      const raw = matrixEdits[bucketKey]?.[month] ?? "";
      const targetId = row.budget_target_id?.[month];
      if (raw === "") {
        if (targetId) {
          await apiDelete(`/budgets/bucket-targets/${targetId}`);
        }
        continue;
      }
      const amount = Number(raw);
      if (!Number.isFinite(amount)) {
        throw new Error(`Invalid amount for ${row.name} ${formatMonthLabel(month)}`);
      }
      if (!monthIds[month]) {
        monthIds[month] = await ensureMonthId(month);
      }
      await apiPost("/budgets/bucket-targets", {
        budget_month_id: Number(monthIds[month]),
        budget_bucket: bucketKey,
        amount,
        rollover_amount: 0
      });
    }
  };

  const saveMatrixRow = async (bucketKey: string) => {
    if (!budgetMatrix) return;
    const row = getBucketRow(bucketKey);
    if (!row) return;
    setMatrixError(null);
    setMatrixBusy(true);
    try {
      await persistMatrixBucket(row, {});
      await loadMonths();
      await loadMatrix();
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to save row.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const saveMatrixAll = async () => {
    if (!budgetMatrix) return;
    setMatrixError(null);
    setMatrixBusy(true);
    try {
      assertMatrixBudgetable();
      const operations: Array<{
        kind: "upsert" | "delete";
        row: any;
        month: string;
        amount: number;
        currentAmount: number;
        targetId?: number;
      }> = [];
      for (const row of budgetMatrix.categories || []) {
        const bucketKey = String(row.id);
        for (const month of budgetMatrix.months || []) {
          if (!isMonthEditable(month)) continue;
          const raw = matrixEdits[bucketKey]?.[month] ?? "";
          const targetId = row.budget_target_id?.[month];
          const currentAmount = row.budget_entered?.[month] ? Number(row.budget?.[month] || 0) : 0;
          if (raw === "") {
            if (targetId) {
              operations.push({ kind: "delete", row, month, amount: 0, currentAmount, targetId });
            }
            continue;
          }
          const amount = Number(raw);
          if (!Number.isFinite(amount)) {
            throw new Error(`Invalid amount for ${row.name} ${formatMonthLabel(month)}`);
          }
          if (targetId && Math.abs(amount - currentAmount) < 0.00001) {
            continue;
          }
          operations.push({ kind: "upsert", row, month, amount, currentAmount, targetId });
        }
      }
      const stageForOperation = (operation: (typeof operations)[number]) => {
        if (operation.row.type === "income") {
          return operation.amount >= operation.currentAmount ? 1 : 4;
        }
        return operation.amount <= operation.currentAmount ? 2 : 3;
      };
      operations.sort((left, right) => stageForOperation(left) - stageForOperation(right));
      const monthIds: Record<string, number> = {};
      for (const operation of operations) {
        if (operation.kind === "delete") {
          await apiDelete(`/budgets/bucket-targets/${operation.targetId}`);
          continue;
        }
        if (!monthIds[operation.month]) {
          monthIds[operation.month] = await ensureMonthId(operation.month);
        }
        await apiPost("/budgets/bucket-targets", {
          budget_month_id: Number(monthIds[operation.month]),
          budget_bucket: String(operation.row.id),
          amount: operation.amount,
          rollover_amount: 0
        });
      }
      await loadMonths();
      await loadMatrix();
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to save matrix.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const autofillMatrixFromActuals = () => {
    if (!budgetMatrix) return;
    const next: Record<string, Record<string, string>> = { ...matrixEdits };
    for (const category of budgetMatrix.categories || []) {
      const bucketKey = String(category.id);
      const monthsMap: Record<string, string> = { ...(next[bucketKey] || {}) };
      for (const month of budgetMatrix.months || []) {
        if (!isMonthEditable(month)) continue;
        const actual =
          category.type === "income"
            ? Number(category.income?.[month] || 0)
            : Number(category.expense?.[month] || 0);
        monthsMap[month] = actual > 0 ? actual.toFixed(2) : "";
      }
      next[bucketKey] = monthsMap;
    }
    setMatrixEdits(next);
  };

  const matrixMonths: string[] = budgetMatrix?.months || [];
  const incomeRows = (budgetMatrix?.categories || [])
    .filter((row: any) => row.type === "income")
    .sort((a: any, b: any) => (b.total_income || 0) - (a.total_income || 0));
  const expenseRows = (budgetMatrix?.categories || [])
    .filter((row: any) => row.type !== "income")
    .sort((a: any, b: any) => (b.total_expense || 0) - (a.total_expense || 0));
  const matrixColSpan = matrixMonths.length + 5;
  const budgetCurrency = budgetMatrix?.base_currency || "USD";
  const openingLiquidBalance = Number(budgetMatrix?.totals?.opening_liquid_balance || 0);
  const cashTolerance = 50;
  const monthPlanning = matrixMonths.map((month) => {
    const state = getMonthState(month);
    const incomeActual = incomeRows.reduce((sum: number, row: any) => sum + Number(row.income?.[month] || 0), 0);
    const expenseActual = expenseRows.reduce((sum: number, row: any) => sum + Number(row.expense?.[month] || 0), 0);
    const plannedIncome = incomeRows.reduce((sum: number, row: any) => sum + getEffectiveCellAmount(row, month), 0);
    const plannedExpense = expenseRows.reduce((sum: number, row: any) => sum + getEffectiveCellAmount(row, month), 0);
    const remaining = plannedIncome - plannedExpense;
    return {
      month,
      state,
      editable: isMonthEditable(month),
      incomeActual,
      expenseActual,
      plannedIncome,
      plannedExpense,
      remaining
    };
  });
  let plannedClosingBalance = openingLiquidBalance;
  let actualClosingBalance = openingLiquidBalance;
  const monthPlanningWithBalances = monthPlanning.map((row) => {
    plannedClosingBalance += row.remaining;
    actualClosingBalance += row.incomeActual - row.expenseActual;
    return {
      ...row,
      plannedClosingBalance,
      actualClosingBalance
    };
  });
  const invalidMonths = monthPlanningWithBalances.filter(
    (row) => row.state !== "past" && row.plannedClosingBalance < -cashTolerance - 0.005
  );
  const saveBlocked = invalidMonths.length > 0;
  const summarizeMatrixSection = (rows: any[], field: "income" | "expense") => {
    let plannedTotal = 0;
    let actualTotal = 0;
    const byMonth = matrixMonths.map((month) => {
      const planned = rows.reduce((sum, row) => sum + getEffectiveCellAmount(row, month), 0);
      const actual = rows.reduce((sum, row) => sum + Number(row[field]?.[month] || 0), 0);
      plannedTotal += planned;
      actualTotal += actual;
      return { month, planned, actual };
    });
    return {
      byMonth,
      plannedTotal,
      actualTotal,
      variance: plannedTotal - actualTotal
    };
  };
  const incomeSummary = summarizeMatrixSection(incomeRows, "income");
  const expenseSummary = summarizeMatrixSection(expenseRows, "expense");
  const balanceSummary = {
    byMonth: monthPlanningWithBalances.map(({ month, state, actualClosingBalance }) => ({
      month,
      actual: state === "future" ? null : actualClosingBalance
    })),
    actualTotal:
      [...monthPlanningWithBalances]
        .reverse()
        .find((row) => row.state !== "future")?.actualClosingBalance ?? null
  };
  const liveCashflowSummary = {
    byMonth: monthPlanning.map(({ month, remaining }) => ({
      month,
      actual: remaining
    }))
  };
  const currentMonthPlan = monthPlanning.find((row) => row.month === currentBudgetMonth) || null;
  const currentMonthActualIncome = Number(currentMonthPlan?.incomeActual || 0);
  const currentMonthActualExpense = Number(currentMonthPlan?.expenseActual || 0);
  const currentMonthPlannedIncome = Number(currentMonthPlan?.plannedIncome || 0);
  const plannedIncomeExpansion = Math.max(currentMonthPlannedIncome - currentMonthActualIncome, 0);
  const chartAvailableIncome = currentMonthActualIncome + plannedIncomeExpansion;
  const chartUsedAmount = Math.min(currentMonthActualExpense, chartAvailableIncome);
  const remainingActualIncome = Math.max(currentMonthActualIncome - chartUsedAmount, 0);
  const remainingPlannedIncome = Math.max(chartAvailableIncome - chartUsedAmount - remainingActualIncome, 0);
  const currentMonthOverrun = Math.max(currentMonthActualExpense - chartAvailableIncome, 0);
  const currentMonthRemaining = Math.max(chartAvailableIncome - currentMonthActualExpense, 0);
  const currentMonthExpenseBreakdown = expenseRows
    .map((row: any, index: number) => ({
      id: String(row.id),
      name: row.name,
      actual: Number(row.expense?.[currentBudgetMonth] || 0),
      color: MATRIX_BREAKDOWN_COLORS[index % MATRIX_BREAKDOWN_COLORS.length]
    }))
    .filter((row: any) => row.actual > 0)
    .sort((a: any, b: any) => b.actual - a.actual)
    .map((row: any, index: number) => ({
      ...row,
      color: MATRIX_BREAKDOWN_COLORS[index % MATRIX_BREAKDOWN_COLORS.length],
      share: currentMonthActualExpense > 0 ? row.actual / currentMonthActualExpense : 0
    }));
  const currentMonthChartGradient = buildConicGradient([
    ...currentMonthExpenseBreakdown.map((row: any) => ({
      value: currentMonthActualExpense > 0 ? chartUsedAmount * row.share : 0,
      color: row.color
    })),
    { value: remainingActualIncome, color: "#2a9d8f" },
    { value: remainingPlannedIncome, color: "#8ecae6" }
  ]);
  const matrixDrilldownSubcategories = matrixDrilldown ? matrixSubcategoriesForBucket(matrixDrilldown.bucket_name || "") : [];

  const renderSubcategoryRows = (row: any) => {
    if (!hasSubcategoryRows(row) || !isMatrixRowExpanded(String(row.id))) return null;
    return (row.subcategories || []).map((subcategory: any) => {
      const renameKey = String(subcategory.subcategory_id || "");
      const isRenaming = Boolean(subcategory.subcategory_id) && editingMatrixSubcategoryId === renameKey;
      const actualTotal = matrixMonths.reduce(
        (sum, month) =>
          sum + Number((subcategory.type === "income" ? subcategory.income?.[month] : subcategory.expense?.[month]) || 0),
        0
      );
      return (
        <tr key={`subcategory-${row.id}-${subcategory.id}`} className="matrix-subrow">
          <td className="matrix-label-cell matrix-subcategory-label-cell">
            <div className="matrix-label-main">
              <span className="matrix-subcategory-indent">↳</span>
              {isRenaming ? (
                <>
                  <input
                    className="matrix-subcategory-input"
                    value={matrixSubcategoryRenameValues[renameKey] || ""}
                    onChange={(event) =>
                      setMatrixSubcategoryRenameValues((prev) => ({ ...prev, [renameKey]: event.target.value }))
                    }
                  />
                  <button
                    className="matrix-subcategory-action"
                    onClick={() => saveMatrixSubcategoryRename(row, subcategory)}
                    disabled={matrixBusy}
                  >
                    Save
                  </button>
                  <button
                    className="matrix-subcategory-action"
                    onClick={() => {
                      setEditingMatrixSubcategoryId(null);
                      setMatrixSubcategoryRenameValues((prev) => ({ ...prev, [renameKey]: subcategory.name || "" }));
                    }}
                    disabled={matrixBusy}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span>{subcategory.name}</span>
                  {subcategory.subcategory_id && !subcategory.is_unassigned && (
                    <>
                      <button
                        className="matrix-subcategory-action"
                        onClick={() => {
                          setEditingMatrixSubcategoryId(renameKey);
                          setMatrixSubcategoryRenameValues((prev) => ({
                            ...prev,
                            [renameKey]: subcategory.name || ""
                          }));
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="matrix-subcategory-action"
                        onClick={() => deleteMatrixSubcategory(row, subcategory)}
                        disabled={matrixBusy}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </td>
          {matrixMonths.map((month) => {
            const actual = Number(
              (subcategory.type === "income" ? subcategory.income?.[month] : subcategory.expense?.[month]) || 0
            );
            return (
              <td
                key={`subcategory-${row.id}-${subcategory.id}-${month}`}
                className="matrix-cell matrix-cell-drillable matrix-subcategory-cell"
                onContextMenu={(event) => openMatrixDrilldown(event, row, month, { subcategory })}
                title="Right-click to inspect transactions behind this subcategory actual"
              >
                {actual > 0 ? renderMatrixMoney(actual, budgetCurrency) : "—"}
              </td>
            );
          })}
          <td className="matrix-total-cell">—</td>
          <td className="matrix-total-cell">{renderMatrixMoney(actualTotal, budgetCurrency)}</td>
          <td className="matrix-total-cell">—</td>
          <td className="matrix-action-cell">—</td>
        </tr>
      );
    });
  };

  const renderInlineSubcategoryEditor = (row: any) => {
    if (addingMatrixSubcategoryFor !== String(row.id)) return null;
    return (
      <div className="matrix-inline-subcategory-editor">
        <input
          className="matrix-subcategory-input"
          placeholder={`Add ${row.name} subcategory`}
          value={matrixSubcategoryDrafts[String(row.id)] || ""}
          onChange={(event) =>
            setMatrixSubcategoryDrafts((prev) => ({ ...prev, [String(row.id)]: event.target.value }))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              createMatrixSubcategory(row);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setAddingMatrixSubcategoryFor(null);
            }
          }}
        />
        <button className="matrix-subcategory-action" onClick={() => createMatrixSubcategory(row)} disabled={matrixBusy}>
          Add
        </button>
        <button
          className="matrix-subcategory-action"
          onClick={() => {
            setAddingMatrixSubcategoryFor(null);
          }}
          disabled={matrixBusy}
        >
          Cancel
        </button>
      </div>
    );
  };

  const createMatrixSubcategory = async (row: any) => {
    const rowId = String(row.id);
    const name = (matrixSubcategoryDrafts[rowId] || "").trim();
    if (!name) {
      setMatrixError("Subcategory name is required.");
      return;
    }
    const category = getMatrixCategoryForRow(row);
    if (!category?.id) {
      setMatrixError(`Unable to map ${row.name} to a category for subcategory creation.`);
      return;
    }
    setMatrixError(null);
    setMatrixBusy(true);
    try {
      await apiPost(`/categories/${category.id}/subcategories`, { name, is_active: true });
      await loadMatrixCategories();
      await loadMatrix(matrixYear);
      setExpandedMatrixRows((prev) => ({ ...prev, [rowId]: true }));
      setAddingMatrixSubcategoryFor(null);
      setMatrixSubcategoryDrafts((prev) => ({ ...prev, [rowId]: "" }));
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to create subcategory.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const saveMatrixSubcategoryRename = async (row: any, subcategory: any) => {
    const renameKey = String(subcategory.subcategory_id || "");
    const name = (matrixSubcategoryRenameValues[renameKey] || "").trim();
    if (!name || !subcategory.subcategory_id) {
      setMatrixError("Subcategory name is required.");
      return;
    }
    setMatrixError(null);
    setMatrixBusy(true);
    try {
      await apiPost(`/categories/subcategories/${subcategory.subcategory_id}`, { name, is_active: true });
      await loadMatrixCategories();
      await loadMatrix(matrixYear);
      setExpandedMatrixRows((prev) => ({ ...prev, [String(row.id)]: true }));
      setEditingMatrixSubcategoryId(null);
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to rename subcategory.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const deleteMatrixSubcategory = async (row: any, subcategory: any) => {
    if (!subcategory?.subcategory_id || subcategory?.is_unassigned) return;
    const confirmed = window.confirm(
      `Delete subcategory "${subcategory.name}"? Existing transactions will become unassigned in ${row.name}.`
    );
    if (!confirmed) return;
    setMatrixError(null);
    setMatrixBusy(true);
    try {
      const result = await apiDelete<{ cleared_splits?: number; cleared_profiles?: number }>(
        `/categories/subcategories/${subcategory.subcategory_id}`
      );
      await loadMatrixCategories();
      await loadMatrix(matrixYear);
      setExpandedMatrixRows((prev) => ({ ...prev, [String(row.id)]: true }));
      setMatrixBaseCurrencyStatus(
        `Deleted ${subcategory.name}. Cleared ${formatCount(result?.cleared_splits || 0)} transaction links and ${formatCount(result?.cleared_profiles || 0)} merchant profiles.`
      );
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to delete subcategory.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const saveMatrixBaseCurrency = async () => {
    setMatrixError(null);
    setMatrixBaseCurrencyStatus(null);
    setMatrixBusy(true);
    try {
      await apiPost("/settings", { base_currency: matrixBaseCurrency });
      await loadMonths();
      await loadMatrix(matrixYear);
      setMatrixBaseCurrencyStatus(`Budget matrix base currency updated to ${matrixBaseCurrency}.`);
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to update base currency.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const refreshBudgetTransactions = async () => {
    setMatrixError(null);
    setMatrixBaseCurrencyStatus(null);
    setMatrixBusy(true);
    try {
      const [plaidStatus, upStatus] = await Promise.all([
        apiGet<any>("/plaid/status").catch(() => ({ configured: false })),
        apiGet<any>("/up/status").catch(() => ({ configured: false }))
      ]);
      const syncMessages: string[] = [];
      const syncErrors: string[] = [];
      if (plaidStatus?.configured) {
        try {
          const result = await apiPost<any>("/plaid/sync");
          syncMessages.push(
            `Plaid refreshed (${formatCount(result?.added || 0)} new, ${formatCount(result?.modified || 0)} updated)`
          );
        } catch (err) {
          syncErrors.push(err instanceof Error ? `Plaid: ${err.message}` : "Plaid refresh failed");
        }
      }
      if (upStatus?.configured) {
        try {
          const result = await apiPost<any>("/up/sync-transactions");
          const tx = result?.transactions || result || {};
          syncMessages.push(
            `Up refreshed (${formatCount(tx?.added || 0)} new, ${formatCount(tx?.updated || 0)} updated)`
          );
        } catch (err) {
          syncErrors.push(err instanceof Error ? `Up: ${err.message}` : "Up refresh failed");
        }
      }
      await loadMonths();
      await loadMatrix(matrixYear);
      if (syncErrors.length > 0) {
        setMatrixError(syncErrors.join(" · "));
      }
      setMatrixBaseCurrencyStatus(
        syncMessages.length > 0
          ? `${syncMessages.join(" · ")} · Matrix refreshed.`
          : syncErrors.length > 0
            ? "Matrix refreshed, but no linked feed sync succeeded."
            : "No linked bank feeds were available to refresh."
      );
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to refresh linked bank feeds.");
    } finally {
      setMatrixBusy(false);
    }
  };

  return (
    <div className="section-stack">
      <SectionHeader title="Budgets" subtitle="Yearly forecast buckets with actuals and variance." />
      <div className="panel">
        <BoxTitle title="Yearly budget matrix" />
        {matrixError && <p className="form-error">{matrixError}</p>}
        {matrixBaseCurrencyStatus && <p className="muted">{matrixBaseCurrencyStatus}</p>}
        <div className="row">
          <label className="row">
            <span>Base currency</span>
            <select
              value={matrixBaseCurrency}
              onChange={(e) => {
                setMatrixBaseCurrency(e.target.value);
                setMatrixBaseCurrencyStatus(null);
              }}
            >
              <option value="AUD">AUD</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <button onClick={saveMatrixBaseCurrency} disabled={matrixBusy || matrixBaseCurrency === budgetCurrency}>
            Save base currency
          </button>
          <input
            type="number"
            min="2000"
            max="2100"
            value={matrixYear}
            onChange={(e) => setMatrixYear(e.target.value)}
          />
          <button onClick={refreshBudgetTransactions} disabled={matrixBusy}>
            Refresh
          </button>
          <button onClick={autofillMatrixFromActuals} disabled={matrixBusy || !budgetMatrix}>
            Autofill from actuals
          </button>
          <button onClick={saveMatrixAll} disabled={matrixBusy || !budgetMatrix || saveBlocked}>
            Save all
          </button>
          <span className="muted">Past months lock to actuals. Open months must keep projected closing personal checking balance above the cash buffer.</span>
        </div>
        <p className="muted">
          Matrix values are displayed in {budgetCurrency}. Blank open cells fall back to actuals until you enter a plan.
        </p>
        <p className="muted">Refresh pulls new Plaid and Up transactions, updates linked balances, then refreshes the matrix. Expand a bucket to inspect subcategories.</p>
        {matrixMonths.includes(currentBudgetMonth) && (
          <div className="matrix-chart-card">
            <div
              className="matrix-chart-visual"
              style={{ backgroundImage: currentMonthChartGradient }}
              aria-label={`Current month budget chart for ${formatMonthYearLabel(currentBudgetMonth)}`}
            >
              <div className="matrix-chart-center">
                <span className="matrix-chart-caption">{formatMonthYearLabel(currentBudgetMonth)}</span>
                <strong>
                  {currentMonthOverrun > 0
                    ? formatCompactCurrency(currentMonthOverrun, budgetCurrency)
                    : formatCompactCurrency(currentMonthRemaining, budgetCurrency)}
                </strong>
                <span className="matrix-chart-caption">
                  {currentMonthOverrun > 0 ? "Over current income" : "Remaining"}
                </span>
              </div>
            </div>
            <div className="matrix-chart-copy">
              <strong>Current month income use</strong>
              <p className="muted">
                Actual income sets the base, planned income expands it temporarily, and current expense shows what has already been used.
              </p>
              <div className="matrix-chart-legend">
                <div className="matrix-chart-legend-item">
                  <span className="matrix-chart-swatch matrix-chart-swatch-actual" />
                  <span>Actual income remaining</span>
                  <strong>{formatCurrency(remainingActualIncome, budgetCurrency)}</strong>
                </div>
                <div className="matrix-chart-legend-item">
                  <span className="matrix-chart-swatch matrix-chart-swatch-planned" />
                  <span>Planned income</span>
                  <strong>{formatCurrency(plannedIncomeExpansion, budgetCurrency)}</strong>
                </div>
              </div>
              <div className="matrix-chart-breakdown">
                <strong>Current expense categories</strong>
                {currentMonthExpenseBreakdown.length > 0 ? (
                  <div className="matrix-chart-breakdown-list">
                    {currentMonthExpenseBreakdown.map((row: any) => (
                      <div key={`breakdown-${row.id}`} className="matrix-chart-breakdown-item">
                        <span className="matrix-chart-swatch" style={{ background: row.color }} />
                        <span>{row.name}</span>
                        <span className="muted">{Math.round(row.share * 100)}%</span>
                        <strong>{formatCurrency(row.actual, budgetCurrency)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No current month expense categories yet.</p>
                )}
              </div>
              {currentMonthOverrun > 0 && (
                <p className="form-error">
                  Current expense is {formatCurrency(currentMonthOverrun, budgetCurrency)} above actual plus planned income for{" "}
                  {formatMonthYearLabel(currentBudgetMonth)}.
                </p>
              )}
            </div>
          </div>
        )}
        {invalidMonths.length > 0 && (
          <p className="form-error">
            {invalidMonths.map((row) => `${formatMonthLabel(row.month)} ${formatCurrency(row.plannedClosingBalance, budgetCurrency)}`).join(" · ")}
          </p>
        )}
        {budgetMatrix ? (
          <div className="matrix-scroll">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th>Bucket</th>
                  {matrixMonths.map((month) => (
                    <th key={`head-${month}`}>{formatMonthLabel(month)}</th>
                  ))}
                  <th>Plan total</th>
                  <th>Actual total</th>
                  <th>Variance</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="matrix-label-cell"><strong>Live personal cashflow</strong></td>
                  {liveCashflowSummary.byMonth.map(({ month, actual }) => (
                    <td key={`live-working-cashflow-${month}`} className="matrix-cell">
                      {actual === null ? "—" : renderMatrixMoney(actual, budgetCurrency)}
                    </td>
                  ))}
                  <td className="matrix-total-cell">—</td>
                  <td className="matrix-total-cell">—</td>
                  <td className="matrix-total-cell">—</td>
                  <td className="matrix-action-cell">—</td>
                </tr>
                <tr>
                  <td className="matrix-label-cell"><strong>Closing personal checking balance</strong></td>
                  {balanceSummary.byMonth.map(({ month, actual }) => (
                    <td key={`headroom-${month}`} className="matrix-cell">
                      {actual === null ? "—" : renderMatrixMoney(actual, budgetCurrency)}
                    </td>
                  ))}
                  <td className="matrix-total-cell">—</td>
                  <td className="matrix-total-cell">{renderMatrixMoney(balanceSummary.actualTotal, budgetCurrency)}</td>
                  <td className="matrix-total-cell">—</td>
                  <td className="matrix-action-cell">—</td>
                </tr>
                <tr>
                  <td className="matrix-label-cell"><strong>Operating income total</strong></td>
                  {incomeSummary.byMonth.map(({ month, planned }) => (
                    <td key={`income-summary-top-${month}`} className="matrix-cell">
                      {renderMatrixMoney(planned, budgetCurrency)}
                    </td>
                  ))}
                  <td className="matrix-total-cell">{renderMatrixMoney(incomeSummary.plannedTotal, budgetCurrency)}</td>
                  <td className="matrix-total-cell">{renderMatrixMoney(incomeSummary.actualTotal, budgetCurrency)}</td>
                  <td className="matrix-total-cell">{renderMatrixMoney(incomeSummary.variance, budgetCurrency)}</td>
                  <td className="matrix-action-cell">—</td>
                </tr>
                <tr>
                  <td className="matrix-label-cell"><strong>Operating expense total</strong></td>
                  {expenseSummary.byMonth.map(({ month, planned }) => (
                    <td key={`expense-summary-top-${month}`} className="matrix-cell">
                      {renderMatrixMoney(planned, budgetCurrency)}
                    </td>
                  ))}
                  <td className="matrix-total-cell">{renderMatrixMoney(expenseSummary.plannedTotal, budgetCurrency)}</td>
                  <td className="matrix-total-cell">{renderMatrixMoney(expenseSummary.actualTotal, budgetCurrency)}</td>
                  <td className="matrix-total-cell">{renderMatrixMoney(expenseSummary.variance, budgetCurrency)}</td>
                  <td className="matrix-action-cell">—</td>
                </tr>
                {incomeRows.length > 0 && (
                  <tr className="matrix-section-row">
                    <td colSpan={matrixColSpan}>
                      <strong>Operating income</strong>
                    </td>
                  </tr>
                )}
                {incomeRows.map((row: any) => {
                  const budgetTotal = matrixMonths.reduce(
                    (sum, month) => sum + getEffectiveCellAmount(row, month),
                    0
                  );
                  const actualTotal = matrixMonths.reduce(
                    (sum, month) => sum + Number(row.income?.[month] || 0),
                    0
                  );
                  const variance = budgetTotal - actualTotal;
                  return (
                    <Fragment key={`income-${row.id}`}>
                      <tr>
                        <td className="matrix-label-cell">
                          <div className="matrix-label-stack">
                            <div className="matrix-label-main">
                              {hasSubcategoryRows(row) ? (
                                <button
                                  className="matrix-expand-button"
                                  onClick={() => toggleMatrixRowExpanded(String(row.id))}
                                  title={isMatrixRowExpanded(String(row.id)) ? "Hide subcategories" : "Show subcategories"}
                                >
                                  {isMatrixRowExpanded(String(row.id)) ? "Subs ▾" : "Subs ▸"}
                                </button>
                              ) : (
                                <span className="matrix-expand-spacer" />
                              )}
                              <span>{row.name}</span>
                              {hasSubcategoryRows(row) && (
                                <span className="matrix-subcategory-count">{row.subcategories.length}</span>
                              )}
                              {getMatrixCategoryForRow(row)?.id && (
                                <button
                                  className="matrix-subcategory-action"
                                  onClick={() => startAddingMatrixSubcategory(String(row.id))}
                                >
                                  Add
                                </button>
                              )}
                            </div>
                            {renderInlineSubcategoryEditor(row)}
                          </div>
                        </td>
                        {matrixMonths.map((month) => {
                          const actual = Number(row.income?.[month] || 0);
                          const locked = !isMonthEditable(month);
                          return (
                            <td
                              key={`${row.id}-${month}`}
                              className="matrix-cell matrix-cell-drillable"
                              onContextMenu={(event) => openMatrixDrilldown(event, row, month)}
                              title="Right-click to inspect transactions behind the actual value"
                            >
                              {locked ? (
                                <div>{actual > 0 ? renderMatrixMoney(actual, budgetCurrency) : "—"}</div>
                              ) : (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={getCellInputValue(row, month)}
                                  placeholder={actual > 0 ? actual.toFixed(2) : "0.00"}
                                  onChange={(e) => updateMatrixCell(String(row.id), month, e.target.value)}
                                />
                              )}
                              {actual > 0 && <div className="muted">Act {formatCompactCurrency(actual, budgetCurrency)}</div>}
                            </td>
                          );
                        })}
                        <td className="matrix-total-cell">{renderMatrixMoney(budgetTotal, budgetCurrency)}</td>
                        <td className="matrix-total-cell">{renderMatrixMoney(actualTotal, budgetCurrency)}</td>
                        <td className="matrix-total-cell">{renderMatrixMoney(variance, budgetCurrency)}</td>
                        <td className="matrix-action-cell">
                          <button onClick={() => saveMatrixRow(String(row.id))} disabled={matrixBusy}>
                            Save row
                          </button>
                        </td>
                      </tr>
                      {renderSubcategoryRows(row)}
                    </Fragment>
                  );
                })}
                {expenseRows.length > 0 && (
                  <tr className="matrix-section-row">
                    <td colSpan={matrixColSpan}>
                      <strong>Operating expense</strong>
                    </td>
                  </tr>
                )}
                {expenseRows.map((row: any) => {
                  const budgetTotal = matrixMonths.reduce(
                    (sum, month) => sum + getEffectiveCellAmount(row, month),
                    0
                  );
                  const actualTotal = matrixMonths.reduce(
                    (sum, month) => sum + Number(row.expense?.[month] || 0),
                    0
                  );
                  const variance = budgetTotal - actualTotal;
                  return (
                    <Fragment key={`expense-${row.id}`}>
                      <tr>
                        <td className="matrix-label-cell">
                          <div className="matrix-label-stack">
                            <div className="matrix-label-main">
                              {hasSubcategoryRows(row) ? (
                                <button
                                  className="matrix-expand-button"
                                  onClick={() => toggleMatrixRowExpanded(String(row.id))}
                                  title={isMatrixRowExpanded(String(row.id)) ? "Hide subcategories" : "Show subcategories"}
                                >
                                  {isMatrixRowExpanded(String(row.id)) ? "Subs ▾" : "Subs ▸"}
                                </button>
                              ) : (
                                <span className="matrix-expand-spacer" />
                              )}
                              <span>{row.name}</span>
                              {hasSubcategoryRows(row) && (
                                <span className="matrix-subcategory-count">{row.subcategories.length}</span>
                              )}
                              {getMatrixCategoryForRow(row)?.id && (
                                <button
                                  className="matrix-subcategory-action"
                                  onClick={() => startAddingMatrixSubcategory(String(row.id))}
                                >
                                  Add
                                </button>
                              )}
                            </div>
                            {renderInlineSubcategoryEditor(row)}
                          </div>
                        </td>
                        {matrixMonths.map((month) => {
                          const actual = Number(row.expense?.[month] || 0);
                          const rawValue = getCellInputValue(row, month);
                          const locked = !isMonthEditable(month);
                          return (
                            <td
                              key={`${row.id}-${month}`}
                              className="matrix-cell matrix-cell-drillable"
                              onContextMenu={(event) => openMatrixDrilldown(event, row, month)}
                              title="Right-click to inspect transactions behind the actual value"
                            >
                              {locked ? (
                                <div>{actual > 0 ? renderMatrixMoney(actual, budgetCurrency) : "—"}</div>
                              ) : (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={rawValue}
                                  placeholder={actual > 0 ? actual.toFixed(2) : "0.00"}
                                  onChange={(e) => updateMatrixCell(String(row.id), month, e.target.value)}
                                />
                              )}
                              {actual > 0 && <div className="muted">Act {formatCompactCurrency(actual, budgetCurrency)}</div>}
                            </td>
                          );
                        })}
                        <td className="matrix-total-cell">{renderMatrixMoney(budgetTotal, budgetCurrency)}</td>
                        <td className="matrix-total-cell">{renderMatrixMoney(actualTotal, budgetCurrency)}</td>
                        <td className="matrix-total-cell">{renderMatrixMoney(variance, budgetCurrency)}</td>
                        <td className="matrix-action-cell">
                          <button onClick={() => saveMatrixRow(String(row.id))} disabled={matrixBusy}>
                            Save row
                          </button>
                        </td>
                      </tr>
                      {renderSubcategoryRows(row)}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Loading matrix…</p>
        )}
        {matrixDrilldown && (
          <div className="matrix-drilldown-backdrop" onClick={() => setMatrixDrilldown(null)}>
            <div
              className="matrix-drilldown-card"
              style={{ left: matrixDrilldown.left, top: matrixDrilldown.top }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className="matrix-drilldown-header">
                <div>
                  <strong>{matrixDrilldown.rowName || matrixDrilldown.bucket_name}</strong>
                  <div className="muted">{formatMonthYearLabel(matrixDrilldown.month)} actual contributors</div>
                </div>
                <button onClick={() => setMatrixDrilldown(null)}>Close</button>
              </div>
              <p className="muted">
                {matrixDrilldown.subcategory_name ? `${matrixDrilldown.subcategory_name} · ` : ""}
                Act {formatCurrency(matrixDrilldown.actual_total, budgetCurrency)}
              </p>
              {matrixDrilldown.loading ? (
                <p className="muted">Loading transactions…</p>
              ) : matrixDrilldown.error ? (
                <p className="form-error">{matrixDrilldown.error}</p>
              ) : (matrixDrilldown.transactions || []).length === 0 ? (
                <p className="muted">No synced transactions contributed to this actual value.</p>
              ) : (
                <div className="matrix-drilldown-list">
                  {(matrixDrilldown.transactions || []).map((txn: any) => (
                    <div key={`drilldown-${txn.split_id || txn.transaction_id}`} className="matrix-drilldown-item">
                      <div className="matrix-drilldown-item-top">
                        <strong>{txn.payee || txn.description || `Transaction ${txn.transaction_id}`}</strong>
                        <span
                          className={`matrix-drilldown-amount ${
                            Number(txn.effect_on_actual || 0) < 0 ? "matrix-drilldown-credit" : ""
                          }`}
                        >
                          {formatCurrency(txn.effect_on_actual, budgetCurrency)}
                        </span>
                      </div>
                      <div className="muted">
                        {txn.date} · {txn.account_name}
                      </div>
                      {txn.description && txn.payee && txn.description !== txn.payee && (
                        <div className="muted">{txn.description}</div>
                      )}
                      <div className="muted">
                        {formatCurrency(txn.native_amount, txn.native_currency)} native
                        {Number(txn.effect_on_actual || 0) < 0 ? " · Credit/refund" : " · Expense/income"}
                      </div>
                      {matrixDrilldownSubcategories.length > 0 && txn.split_id && (
                        <div className="matrix-drilldown-subcategory-row">
                          <select
                            value={
                              matrixDrilldownAssignments[String(txn.split_id)] ??
                              (txn.subcategory_id ? String(txn.subcategory_id) : "")
                            }
                            onChange={(event) =>
                              setMatrixDrilldownAssignments((prev) => ({
                                ...prev,
                                [String(txn.split_id)]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Subcategory</option>
                            {matrixDrilldownSubcategories.map((subcategory: any) => (
                              <option key={`drilldown-subcategory-${txn.split_id}-${subcategory.id}`} value={subcategory.id}>
                                {subcategory.name}
                              </option>
                            ))}
                          </select>
                          <button
                            className="matrix-subcategory-action"
                            onClick={() => applyMatrixDrilldownSubcategory(txn)}
                            disabled={
                              matrixBusy ||
                              matrixDrilldownBusySplitId === Number(txn.split_id) ||
                              !(
                                matrixDrilldownAssignments[String(txn.split_id)] ??
                                (txn.subcategory_id ? String(txn.subcategory_id) : "")
                              ) ||
                              Number(
                                matrixDrilldownAssignments[String(txn.split_id)] ??
                                  (txn.subcategory_id ? String(txn.subcategory_id) : "0")
                              ) === Number(txn.subcategory_id || 0)
                            }
                          >
                            {matrixDrilldownBusySplitId === Number(txn.split_id) ? "Applying" : "Apply"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Debts() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<number, number>>({});
  const [transactions, setTransactions] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const [extraPayment, setExtraPayment] = useState("0");
  const [strategy, setStrategy] = useState("avalanche");
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    account_id: "",
    apr: "",
    min_payment: "",
    due_date: "",
    compounding: "daily"
  });
  const [linkForm, setLinkForm] = useState({ transaction_id: "", account_id: "", amount: "" });

  const load = async () => {
    const [profilesData, accountData, netWorth, transactionData, linkData] = await Promise.all([
      apiGet<any[]>("/debts/profiles"),
      apiGet<any[]>("/accounts"),
      apiGet<any>("/reports/net-worth"),
      apiGet<any[]>("/transactions"),
      apiGet<any[]>("/debts/links")
    ]);
    setProfiles(profilesData);
    setAccounts(accountData);
    setTransactions(transactionData);
    setLinks(linkData);
    const nextBalances: Record<number, number> = {};
    (netWorth.accounts || []).forEach((row: any) => {
      nextBalances[row.account_id] = row.balance;
    });
    setBalances(nextBalances);
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const validateProfile = () => {
    if (!profileForm.account_id) return "Select a debt account.";
    const aprValue = Number(profileForm.apr);
    if (!Number.isFinite(aprValue)) return "APR must be a number.";
    const minValue = Number(profileForm.min_payment);
    if (!Number.isFinite(minValue)) return "Minimum payment must be a number.";
    return null;
  };

  const saveProfile = async () => {
    setProfileError(null);
    const error = validateProfile();
    if (error) {
      setProfileError(error);
      return;
    }
    const payload = {
      account_id: Number(profileForm.account_id),
      apr: Number(profileForm.apr),
      min_payment: Number(profileForm.min_payment),
      due_date: profileForm.due_date || undefined,
      compounding: profileForm.compounding
    };
    if (editingProfileId) {
      await apiPost(`/debts/profiles/${editingProfileId}`, payload);
    } else {
      await apiPost("/debts/profiles", payload);
    }
    setEditingProfileId(null);
    setProfileForm({ account_id: "", apr: "", min_payment: "", due_date: "", compounding: "daily" });
    load();
  };

  const startEditProfile = (profile: any) => {
    setEditingProfileId(profile.id);
    setProfileError(null);
    setProfileForm({
      account_id: String(profile.account_id),
      apr: String(profile.apr ?? ""),
      min_payment: String(profile.min_payment ?? ""),
      due_date: profile.due_date || "",
      compounding: profile.compounding || "daily"
    });
  };

  const cancelEditProfile = () => {
    setEditingProfileId(null);
    setProfileError(null);
    setProfileForm({ account_id: "", apr: "", min_payment: "", due_date: "", compounding: "daily" });
  };

  const runPlan = async () => {
    const debts = profiles.map((profile) => {
      const account = accounts.find((acc) => acc.id === profile.account_id);
      const balance = Math.abs(balances[profile.account_id] || 0);
      return {
        debt_id: String(profile.id),
        name: account ? account.name : `Account ${profile.account_id}`,
        balance,
        apr: profile.apr,
        min_payment: profile.min_payment
      };
    });
    const data = await apiPost("/debts/payoff", {
      strategy,
      extra_payment: Number(extraPayment),
      debts
    });
    setResult(data);
  };

  const linkPayment = async () => {
    if (!linkForm.transaction_id || !linkForm.account_id) return;
    await apiPost("/debts/link-payment", {
      transaction_id: Number(linkForm.transaction_id),
      account_id: Number(linkForm.account_id),
      amount: Number(linkForm.amount || 0)
    });
    setLinkForm({ transaction_id: "", account_id: "", amount: "" });
    load();
  };

  return (
    <div className="page">
      <SectionHeader title="Debt Lab" subtitle="Snowball or avalanche payoff scenarios." />
      <div className="panel">
        <BoxTitle title="Debt profiles" />
        {profileError && <p className="form-error">{profileError}</p>}
        <div className="row">
          <select
            value={profileForm.account_id}
            onChange={(e) => setProfileForm({ ...profileForm, account_id: e.target.value })}
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <input
            placeholder="APR (0.05)"
            value={profileForm.apr}
            onChange={(e) => setProfileForm({ ...profileForm, apr: e.target.value })}
          />
          <input
            placeholder="Min payment"
            value={profileForm.min_payment}
            onChange={(e) => setProfileForm({ ...profileForm, min_payment: e.target.value })}
          />
          <input
            type="date"
            value={toDateValue(profileForm.due_date)}
            onChange={(e) => setProfileForm({ ...profileForm, due_date: e.target.value })}
          />
          <select
            value={profileForm.compounding}
            onChange={(e) => setProfileForm({ ...profileForm, compounding: e.target.value })}
          >
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
          </select>
          <button onClick={saveProfile}>{editingProfileId ? "Save profile" : "Add profile"}</button>
          {editingProfileId && <button onClick={cancelEditProfile}>Cancel</button>}
        </div>
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Balance</th>
              <th>APR</th>
              <th>Min payment</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => {
              const account = accounts.find((acc) => acc.id === profile.account_id);
              return (
                <tr key={profile.id}>
                  <td>{account ? account.name : profile.account_id}</td>
                  <td>{formatCurrency(Math.abs(balances[profile.account_id] || 0), account?.currency)}</td>
                  <td>{profile.apr}</td>
                  <td>{formatAmount(profile.min_payment)}</td>
                  <td>
                    <button className="button-ghost" onClick={() => startEditProfile(profile)}>
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        await apiDelete(`/debts/profiles/${profile.id}`);
                        load();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <BoxTitle title="Link payments" />
        <div className="row">
          <select
            value={linkForm.account_id}
            onChange={(e) => setLinkForm({ ...linkForm, account_id: e.target.value })}
          >
            <option value="">Debt account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <select
            value={linkForm.transaction_id}
            onChange={(e) => setLinkForm({ ...linkForm, transaction_id: e.target.value })}
          >
            <option value="">Payment transaction</option>
            {transactions.map((txn) => (
              <option key={txn.id} value={txn.id}>
                {txn.date} {txn.description} {formatCurrency(txn.amount, txn.currency)}
              </option>
            ))}
          </select>
          <input
            placeholder="Amount"
            value={linkForm.amount}
            onChange={(e) => setLinkForm({ ...linkForm, amount: e.target.value })}
          />
          <button onClick={linkPayment}>Link payment</button>
        </div>
        {links.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Account</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => {
                const account = accounts.find((acc) => acc.id === link.account_id);
                const txn = transactions.find((t) => t.id === link.transaction_id);
                return (
                  <tr key={link.id}>
                    <td>{txn ? `${txn.date} ${txn.description}` : link.transaction_id}</td>
                    <td>{account ? account.name : link.account_id}</td>
                    <td>{formatAmount(link.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="panel">
        <BoxTitle title="Payoff simulator" />
        <div className="row">
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="avalanche">Avalanche</option>
            <option value="snowball">Snowball</option>
          </select>
          <input
            placeholder="Extra payment"
            value={extraPayment}
            onChange={(e) => setExtraPayment(e.target.value)}
          />
          <button onClick={runPlan}>Run payoff plan</button>
        </div>
        {result && (
          <div className="result">
            <p>Months to payoff: {result.months}</p>
            <p>Total interest: {formatAmount(result.total_interest)}</p>
          </div>
        )}
      </div>
      <div className="callout">Not financial advice. Use scenarios to explore options only.</div>
    </div>
  );
}

function Business({
  companyLogoSrc,
  usingCustomLogo
}: {
  companyLogoSrc: string;
  usingCustomLogo: boolean;
}) {
  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [archivedInvoices, setArchivedInvoices] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<number, string>>({});
  const [invoiceRecipientEmails, setInvoiceRecipientEmails] = useState<Record<number, string>>({});
  const [archivePaymentAmounts, setArchivePaymentAmounts] = useState<Record<number, string>>({});
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceNotice, setInvoiceNotice] = useState<string | null>(null);
  const [invoiceSendError, setInvoiceSendError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientNotice, setClientNotice] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveNotice, setArchiveNotice] = useState<string | null>(null);
  const [showArchivedClients, setShowArchivedClients] = useState(false);
  const [showSettledInvoices, setShowSettledInvoices] = useState(false);
  const [archivePickerKey, setArchivePickerKey] = useState(0);
  const [selectedArchiveId, setSelectedArchiveId] = useState<number | null>(null);
  const [archiveDetail, setArchiveDetail] = useState<any | null>(null);
  const [archiveDetailLoading, setArchiveDetailLoading] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState("");
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | null>(null);
  const [clientToolOpenToken, setClientToolOpenToken] = useState(0);
  const [invoiceToolOpenToken, setInvoiceToolOpenToken] = useState(0);
  const [archiveIntakeOpenToken, setArchiveIntakeOpenToken] = useState(0);
  const [invoicePreviewBusy, setInvoicePreviewBusy] = useState(false);
  const [invoicePreview, setInvoicePreview] = useState<{ url: string; name: string; title: string } | null>(null);
  const [companyProfile, setCompanyProfile] = useState<InvoicePreviewProfile>(EMPTY_INVOICE_PREVIEW_PROFILE);
  const clientEditorRef = useRef<HTMLDivElement | null>(null);
  const invoiceEditorRef = useRef<HTMLDivElement | null>(null);
  const archiveIntakeRef = useRef<HTMLDivElement | null>(null);
  const [clientForm, setClientForm] = useState({ name: "", email: "", phone: "", address: "", notes: "" });
  const [invoiceForm, setInvoiceForm] = useState({
    client_id: "",
    number: "",
    issue_date: todayDate(),
    due_date: "",
    currency: "USD",
    notes: "",
    status: "draft",
    agreed_total: ""
  });
  const [archiveForm, setArchiveForm] = useState({
    client_id: "",
    client_name: "",
    number: "",
    issue_date: "",
    due_date: "",
    currency: "USD",
    total: "",
    status: "archived",
    notes: "",
    file: null as File | null
  });
  const [lineItems, setLineItems] = useState([{ description: "", quantity: "1", unit_price: "0" }]);

  const today = todayDate();
  const visibleClients = clients.filter((client) => String(client.name || "").trim());
  const activeClients = visibleClients.filter((client) => client.is_active !== 0);
  const archivedClients = visibleClients.filter((client) => client.is_active === 0);
  const openInvoices = invoices.filter((invoice) => !isClosedReceivableStatus(invoice.status));
  const settledInvoices = invoices.filter((invoice) => isClosedReceivableStatus(invoice.status));
  const displayedInvoices = showSettledInvoices ? invoices : openInvoices;
  const outstandingTotal = openInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due ?? invoice.total ?? 0), 0);
  const archivedInvoiceTotal = archivedInvoices.reduce((sum, invoice) => sum + (invoice.total || 0), 0);
  const outstandingCurrencies = Array.from(new Set(openInvoices.map((invoice) => invoice.currency).filter(Boolean)));
  const archiveCurrencies = Array.from(
    new Set(archivedInvoices.map((invoice) => invoice.currency).filter(Boolean))
  );
  const businessSnapshotCurrency =
    (outstandingCurrencies.length === 1 ? outstandingCurrencies[0] : null) ||
    (archiveCurrencies.length === 1 ? archiveCurrencies[0] : null) ||
    invoices.find((invoice) => invoice.currency)?.currency ||
    archivedInvoices.find((invoice) => invoice.currency)?.currency ||
    "USD";
  const clientCurrentCounts = invoices.reduce((counts: Record<number, number>, invoice) => {
    counts[invoice.client_id] = (counts[invoice.client_id] || 0) + 1;
    return counts;
  }, {});
  const clientArchivedCounts = archivedInvoices.reduce((counts: Record<number, number>, invoice) => {
    counts[invoice.client_id] = (counts[invoice.client_id] || 0) + 1;
    return counts;
  }, {});
  const canDeleteClientRecord = (clientId: number) =>
    (clientCurrentCounts[clientId] || 0) === 0 && (clientArchivedCounts[clientId] || 0) === 0;
  const draftInvoiceSubtotal = lineItems.reduce((sum, item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return sum;
    return sum + quantity * unitPrice;
  }, 0);
  const draftAgreedTotalInput = invoiceForm.agreed_total.trim();
  const draftAgreedTotal = draftAgreedTotalInput ? Number(draftAgreedTotalInput) : null;
  const hasDraftAgreedTotal = draftAgreedTotalInput.length > 0 && Number.isFinite(draftAgreedTotal);
  const draftInvoiceTotal = hasDraftAgreedTotal && draftAgreedTotal !== null ? draftAgreedTotal : draftInvoiceSubtotal;
  const draftInvoiceAdjustment = draftInvoiceTotal - draftInvoiceSubtotal;
  const selectedInvoiceClient = activeClients.find((client) => client.id === Number(invoiceForm.client_id)) || null;
  const editingInvoiceRecord = editingInvoiceId ? invoices.find((invoice) => invoice.id === editingInvoiceId) || null : null;
  const draftPreviewItems = lineItems
    .map((item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      const description = String(item.description || "").trim();
      const hasNumber = Number.isFinite(quantity) || Number.isFinite(unitPrice);
      if (!description && !hasNumber) {
        return null;
      }
      return {
        description: description || "Line item description",
        quantity: Number.isFinite(quantity) ? quantity : null,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
        amount: Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0,
      };
    })
    .filter((item): item is InvoicePreviewLineItem => Boolean(item));
  const draftPreviewNumber = invoiceForm.number.trim() || (editingInvoiceId ? `Invoice ${editingInvoiceId}` : "Invoice draft");
  const invoiceStats = {
    archived: archivedInvoices.length,
    overdue: invoices.filter(
      (invoice) =>
        invoice.status !== "paid" && invoice.due_date && String(invoice.due_date).slice(0, 10) < today
    ).length
  };
  const clientToolSummary = editingClientId
    ? `Editing ${clientForm.name.trim() || `client #${editingClientId}`}`
    : `${formatCount(activeClients.length)} active clients · contact details only when needed`;
  const invoiceToolSummary = editingInvoiceId
    ? `${draftPreviewNumber} · ${formatCurrency(draftInvoiceTotal, invoiceForm.currency || "USD")} due`
    : `${selectedInvoiceClient?.name || "No client selected"} · ${formatCurrency(
        draftInvoiceTotal,
        invoiceForm.currency || "USD"
      )} draft total`;
  const archiveIntakeSummary = archiveForm.file
    ? `${archiveForm.file.name} · ${archiveForm.client_id ? "existing client linked" : archiveForm.client_name.trim() || "new client if needed"}`
    : `${formatCount(invoiceStats.archived)} historical PDFs already stored`;

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    apiGet<any>("/settings")
      .then((data) =>
        setCompanyProfile({
          company_name: data.company_name || "",
          company_legal_name: data.company_legal_name || "",
          company_dba: data.company_dba || "",
          company_entity_type: data.company_entity_type || "",
          company_tax_id: data.company_tax_id || "",
          company_email: data.company_email || "",
          company_phone: data.company_phone || "",
          company_address: data.company_address || "",
          company_city_state: data.company_city_state || "",
        })
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      if (invoicePreview?.url) {
        URL.revokeObjectURL(invoicePreview.url);
      }
    };
  }, [invoicePreview]);

  useEffect(() => {
    if (!editingClientId || !clientEditorRef.current) return;
    clientEditorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editingClientId]);

  useEffect(() => {
    if (!editingInvoiceId || !invoiceEditorRef.current) return;
    invoiceEditorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editingInvoiceId]);

  useEffect(() => {
    if (!clientToolOpenToken || !clientEditorRef.current) return;
    clientEditorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [clientToolOpenToken]);

  useEffect(() => {
    if (!invoiceToolOpenToken || !invoiceEditorRef.current) return;
    invoiceEditorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [invoiceToolOpenToken]);

  useEffect(() => {
    if (!archiveIntakeOpenToken || !archiveIntakeRef.current) return;
    archiveIntakeRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [archiveIntakeOpenToken]);

  const refresh = (preferredArchiveId?: number | null) => {
    Promise.all([
      apiGet<any[]>("/business/clients").catch(() => []),
      apiGet<any[]>("/business/invoices").catch(() => []),
      apiGet<any[]>("/business/invoice-archives").catch(() => []),
      apiGet<any[]>("/transactions/details").catch(() => [])
    ]).then(([clientsData, invoicesData, archivedData, transactionsData]) => {
      setClients(clientsData);
      setInvoices(invoicesData);
      setArchivedInvoices(archivedData);
      setTransactions(transactionsData);
      if (preferredArchiveId && archivedData.some((archive) => archive.id === preferredArchiveId)) {
        setSelectedArchiveId(preferredArchiveId);
      }
    });
  };

  const resetClientForm = () => {
    setEditingClientId(null);
    setClientForm({ name: "", email: "", phone: "", address: "", notes: "" });
  };

  const resetInvoiceForm = () => {
    setEditingInvoiceId(null);
    setInvoiceForm({
      client_id: "",
      number: "",
      issue_date: todayDate(),
      due_date: "",
      currency: "USD",
      notes: "",
      status: "draft",
      agreed_total: ""
    });
    setLineItems([{ description: "", quantity: "1", unit_price: "0" }]);
  };

  const resetArchiveForm = () => {
    setArchiveForm({
      client_id: "",
      client_name: "",
      number: "",
      issue_date: "",
      due_date: "",
      currency: "USD",
      total: "",
      status: "archived",
      notes: "",
      file: null
    });
    setArchivePickerKey((prev) => prev + 1);
  };

  const openClientCreator = () => {
    setClientError(null);
    setClientNotice(null);
    resetClientForm();
    setClientToolOpenToken((prev) => prev + 1);
  };

  const openInvoiceComposer = (clientId?: number) => {
    setInvoiceError(null);
    setInvoiceNotice(null);
    setInvoiceSendError(null);
    setEditingInvoiceId(null);
    setInvoiceForm({
      client_id: clientId ? String(clientId) : "",
      number: "",
      issue_date: todayDate(),
      due_date: "",
      currency: "USD",
      notes: "",
      status: "draft",
      agreed_total: ""
    });
    setLineItems([{ description: "", quantity: "1", unit_price: "0" }]);
    setInvoiceToolOpenToken((prev) => prev + 1);
  };

  const openArchiveIntake = (clientId?: number) => {
    setArchiveError(null);
    setArchiveNotice(null);
    setArchiveForm({
      client_id: clientId ? String(clientId) : "",
      client_name: "",
      number: "",
      issue_date: "",
      due_date: "",
      currency: "USD",
      total: "",
      status: "archived",
      notes: "",
      file: null
    });
    setArchivePickerKey((prev) => prev + 1);
    setArchiveIntakeOpenToken((prev) => prev + 1);
  };

  const syncArchiveDetail = (detail: any) => {
    setArchiveDetail(detail);
    const invoice = detail?.invoice || {};
    const defaults: Record<number, string> = {};
    (detail?.candidate_transactions || []).forEach((candidate: any) => {
      const suggested = Math.max(
        0,
        Math.min(Number(detail?.balance_due || 0), Number(candidate?.available_amount || 0))
      );
      defaults[candidate.id] = suggested > 0 ? String(suggested) : "";
    });
    setArchivePaymentAmounts(defaults);
    return {
      client_id: String(invoice.client_id || ""),
      number: invoice.number || "",
      issue_date: toDateValue(invoice.issue_date),
      due_date: toDateValue(invoice.due_date),
      currency: invoice.currency || "USD",
      total: String(invoice.total ?? ""),
      status: invoice.status || "archived",
      notes: invoice.notes || ""
    };
  };

  const [archiveEditForm, setArchiveEditForm] = useState({
    client_id: "",
    number: "",
    issue_date: "",
    due_date: "",
    currency: "USD",
    total: "",
    status: "archived",
    notes: ""
  });

  useEffect(() => {
    if (!archivedInvoices.length) {
      setSelectedArchiveId(null);
      setArchiveDetail(null);
      return;
    }
    if (!selectedArchiveId || !archivedInvoices.some((archive) => archive.id === selectedArchiveId)) {
      setSelectedArchiveId(archivedInvoices[0].id);
    }
  }, [archivedInvoices, selectedArchiveId]);

  useEffect(() => {
    if (!selectedArchiveId) {
      setArchiveDetail(null);
      return;
    }
    setArchiveDetailLoading(true);
    setArchiveError(null);
    apiGet<any>(`/business/invoice-archives/${selectedArchiveId}`)
      .then((detail) => {
        setArchiveEditForm(syncArchiveDetail(detail));
      })
      .catch((err) => {
        setArchiveError(err instanceof Error ? err.message : "Unable to load historical invoice.");
      })
      .finally(() => setArchiveDetailLoading(false));
  }, [selectedArchiveId]);

  const saveClient = async () => {
    setClientError(null);
    setClientNotice(null);
    const name = clientForm.name.trim();
    if (!name) {
      setClientError("Client name is required.");
      return;
    }
    if (editingClientId) {
      try {
        await apiPost(`/business/clients/${editingClientId}`, { ...clientForm, name, is_active: true });
      } catch (err) {
        setClientError(err instanceof Error ? err.message : "Unable to save client.");
        return;
      }
    } else {
      try {
        await apiPost("/business/clients", { ...clientForm, name });
      } catch (err) {
        setClientError(err instanceof Error ? err.message : "Unable to add client.");
        return;
      }
    }
    resetClientForm();
    refresh();
  };

  const startEditClient = (client: any) => {
    setClientError(null);
    setClientNotice(null);
    setEditingClientId(client.id);
    setClientForm({
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      notes: client.notes || ""
    });
  };

  const deleteClient = async (clientId: number) => {
    setClientError(null);
    setClientNotice(null);
    try {
      const result = await apiDelete<{ status: string }>(`/business/clients/${clientId}`);
      if (editingClientId === clientId) {
        resetClientForm();
      }
      setExpandedClientId((current) => (current === clientId ? null : current));
      setClientNotice(
        result.status === "deleted"
          ? "Client deleted."
          : "Client archived because it still has linked invoices, history, or projects."
      );
      refresh();
    } catch (err) {
      setClientError(err instanceof Error ? err.message : "Unable to delete client.");
    }
  };

  const restoreClient = async (client: any) => {
    setClientError(null);
    setClientNotice(null);
    try {
      await apiPost(`/business/clients/${client.id}`, {
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        notes: client.notes,
        is_active: true
      });
      setClientNotice("Client restored.");
      refresh();
    } catch (err) {
      setClientError(err instanceof Error ? err.message : "Unable to restore client.");
    }
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", quantity: "1", unit_price: "0" }]);
  };

  const updateLineItem = (index: number, field: string, value: string) => {
    const next = [...lineItems];
    next[index] = { ...next[index], [field]: value };
    setLineItems(next);
  };

  const removeLineItem = (index: number) => {
    const next = lineItems.filter((_, idx) => idx !== index);
    setLineItems(next.length ? next : [{ description: "", quantity: "1", unit_price: "0" }]);
  };

  const saveInvoice = async () => {
    setInvoiceError(null);
    setInvoiceNotice(null);
    setInvoiceSendError(null);
    if (!invoiceForm.client_id) {
      setInvoiceError("Select a client before saving.");
      return;
    }
    const issueDate = invoiceForm.issue_date || todayDate();
    setInvoiceForm((prev) => ({ ...prev, issue_date: issueDate }));
    const cleanedItems: { description: string; quantity: number; unit_price: number }[] = [];
    for (const [index, item] of lineItems.entries()) {
      const description = item.description.trim();
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      const rowIndex = index + 1;
      const isEmptyRow = !description && !quantity && !unitPrice;
      if (isEmptyRow) {
        continue;
      }
      if (!description) {
        setInvoiceError(`Line item ${rowIndex} needs a description.`);
        return;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setInvoiceError(`Line item ${rowIndex} needs a quantity greater than 0.`);
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        setInvoiceError(`Line item ${rowIndex} needs a non-negative unit price.`);
        return;
      }
      cleanedItems.push({ description, quantity, unit_price: unitPrice });
    }
    if (!cleanedItems.length) {
      setInvoiceError("Add at least one line item.");
      return;
    }
    const payload = {
      client_id: Number(invoiceForm.client_id),
      number: invoiceForm.number,
      status: invoiceForm.status || "draft",
      issue_date: issueDate,
      due_date: invoiceForm.due_date || undefined,
      currency: invoiceForm.currency,
      notes: invoiceForm.notes || undefined,
      agreed_total: draftAgreedTotalInput ? Number(invoiceForm.agreed_total) : undefined,
      line_items: cleanedItems
    };
    if (draftAgreedTotalInput && (!Number.isFinite(draftAgreedTotal) || Number(draftAgreedTotal) < 0)) {
      setInvoiceError("Agreed total must be zero or greater.");
      return;
    }
    try {
      if (editingInvoiceId) {
        await apiPost(`/business/invoices/${editingInvoiceId}`, payload);
      } else {
        await apiPost("/business/invoices", payload);
      }
      resetInvoiceForm();
      refresh();
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to save invoice.");
    }
  };

  const uploadArchive = async () => {
    setArchiveError(null);
    setArchiveNotice(null);
    if (!archiveForm.file) {
      setArchiveError("Choose the historical invoice PDF to upload.");
      return;
    }
    const totalValue = archiveForm.total.trim();
    if (totalValue && !Number.isFinite(Number(totalValue))) {
      setArchiveError("Archive total must be a valid number.");
      return;
    }
    const formData = new FormData();
    formData.append("file", archiveForm.file);
    if (archiveForm.client_id) formData.append("client_id", archiveForm.client_id);
    if (archiveForm.client_name.trim()) formData.append("client_name", archiveForm.client_name.trim());
    if (archiveForm.number.trim()) formData.append("number", archiveForm.number.trim());
    if (archiveForm.issue_date) formData.append("issue_date", archiveForm.issue_date);
    if (archiveForm.due_date) formData.append("due_date", archiveForm.due_date);
    if (archiveForm.currency.trim()) formData.append("currency", archiveForm.currency.trim().toUpperCase());
    if (totalValue) formData.append("total", totalValue);
    if (archiveForm.status) formData.append("status", archiveForm.status);
    if (archiveForm.notes.trim()) formData.append("notes", archiveForm.notes.trim());
    try {
      const record = await apiPostForm<any>("/business/invoice-archives/upload", formData);
      const linkedClient =
        activeClients.find((client) => client.id === record.client_id) ||
        archivedClients.find((client) => client.id === record.client_id);
      setArchiveNotice(`Archived ${record.file_name} for ${linkedClient?.name || "client"}.`);
      resetArchiveForm();
      refresh(record.id);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Unable to upload archived invoice.");
    }
  };

  const applyPayment = async (invoiceId: number, transactionId: number, amount: number) => {
    if (!Number.isFinite(transactionId) || transactionId <= 0) return;
    if (!Number.isFinite(amount) || amount <= 0) {
      setInvoiceError("Payment amount must be greater than 0.");
      return;
    }
    setInvoiceError(null);
    try {
      await apiPost(`/business/invoices/${invoiceId}/apply-payment`, {
        transaction_id: transactionId,
        amount
      });
      refresh();
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to apply invoice payment.");
    }
  };

  const downloadInvoicePdf = async (invoice: any) => {
    setInvoiceError(null);
    setInvoiceNotice(null);
    try {
      const blob = await apiGetBlob(`/business/invoices/${invoice.id}/pdf?ts=${Date.now()}`);
      const fallbackName = `Invoice-${invoice.number || invoice.id}.pdf`;
      saveBlob(blob, fallbackName);
      setInvoiceNotice(`Downloaded ${fallbackName}.`);
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to download invoice PDF.");
    }
  };

  const closeInvoicePreview = () => {
    if (invoicePreview?.url) {
      URL.revokeObjectURL(invoicePreview.url);
    }
    setInvoicePreview(null);
  };

  const openInvoicePreview = async (invoice: any) => {
    setInvoiceError(null);
    setInvoiceNotice(null);
    setInvoicePreviewBusy(true);
    try {
      const blob = await apiGetBlob(`/business/invoices/${invoice.id}/pdf?ts=${Date.now()}`);
      const fallbackName = `Invoice-${invoice.number || invoice.id}.pdf`;
      const url = URL.createObjectURL(blob);
      setInvoicePreview((current) => {
        if (current?.url) {
          URL.revokeObjectURL(current.url);
        }
        return {
          url,
          name: fallbackName,
          title: invoice.number || `Invoice ${invoice.id}`,
        };
      });
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to preview invoice PDF.");
    } finally {
      setInvoicePreviewBusy(false);
    }
  };

  const saveArchiveDetail = async () => {
    if (!selectedArchiveId) return;
    setArchiveError(null);
    setArchiveNotice(null);
    if (!archiveEditForm.client_id) {
      setArchiveError("Select a client for the historical invoice.");
      return;
    }
    const totalValue = Number(archiveEditForm.total);
    if (!Number.isFinite(totalValue) || totalValue < 0) {
      setArchiveError("Historical invoice total must be a valid non-negative number.");
      return;
    }
    try {
      const detail = await apiPost<any>(`/business/invoice-archives/${selectedArchiveId}`, {
        client_id: Number(archiveEditForm.client_id),
        number: archiveEditForm.number || undefined,
        issue_date: archiveEditForm.issue_date || undefined,
        due_date: archiveEditForm.due_date || undefined,
        currency: archiveEditForm.currency,
        total: totalValue,
        status: archiveEditForm.status,
        notes: archiveEditForm.notes || undefined
      });
      setArchiveEditForm(syncArchiveDetail(detail));
      setArchiveNotice("Historical invoice updated.");
      refresh();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Unable to update historical invoice.");
    }
  };

  const removeArchivePayment = async (paymentLinkId: number) => {
    if (!selectedArchiveId) return;
    setArchiveError(null);
    setArchiveNotice(null);
    try {
      await apiDelete(`/business/invoice-archives/${selectedArchiveId}/payments/${paymentLinkId}`);
      const detail = await apiGet<any>(`/business/invoice-archives/${selectedArchiveId}`);
      setArchiveEditForm(syncArchiveDetail(detail));
      setArchiveNotice("Receipt link removed.");
      refresh();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Unable to remove receipt link.");
    }
  };

  const applyArchivePayment = async (transactionId: number) => {
    if (!selectedArchiveId || !archiveDetail) return;
    const amountValue = Number(archivePaymentAmounts[transactionId]);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setArchiveError("Receipt amount must be greater than 0.");
      return;
    }
    setArchiveError(null);
    setArchiveNotice(null);
    try {
      await apiPost(`/business/invoice-archives/${selectedArchiveId}/apply-payment`, {
        transaction_id: transactionId,
        amount: amountValue
      });
      const detail = await apiGet<any>(`/business/invoice-archives/${selectedArchiveId}`);
      setArchiveEditForm(syncArchiveDetail(detail));
      setArchiveNotice("Receipt linked to historical invoice.");
      refresh();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Unable to link receipt.");
    }
  };

  const startEditInvoice = async (invoiceId: number) => {
    try {
      const detail = await apiGet<any>(`/business/invoices/${invoiceId}`);
      const invoice = detail?.invoice || {};
      const rawLineItems = Array.isArray(detail?.line_items) ? detail.line_items : [];
      const hydratedLineItems = rawLineItems
        .map((item: any) => ({
          description: String(item?.description || ""),
          quantity: String(item?.quantity ?? ""),
          unit_price: String(item?.unit_price ?? "")
        }))
        .filter((item: { description: string; quantity: string; unit_price: string }) =>
          item.description || item.quantity || item.unit_price
        );
      setInvoiceError(null);
      setEditingInvoiceId(invoiceId);
      setInvoiceForm({
        client_id: String(invoice.client_id || ""),
        number: String(invoice.number || ""),
        issue_date: String(invoice.issue_date || todayDate()),
        due_date: String(invoice.due_date || ""),
        currency: String(invoice.currency || "USD"),
        notes: String(invoice.notes || ""),
        status: String(invoice.status || "draft"),
        agreed_total:
          Math.abs(Number(invoice.total || 0) - Number(invoice.subtotal || 0)) > 0.005
            ? String(invoice.total ?? "")
            : ""
      });
      setLineItems(hydratedLineItems.length ? hydratedLineItems : [{ description: "", quantity: "1", unit_price: "0" }]);
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to load invoice.");
    }
  };

  const deleteInvoice = async (invoiceId: number) => {
    setInvoiceError(null);
    try {
      await apiDelete(`/business/invoices/${invoiceId}`);
      refresh();
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to delete invoice.");
    }
  };

  const deleteArchive = async (archiveId: number) => {
    setArchiveError(null);
    setArchiveNotice(null);
    try {
      await apiDelete(`/business/invoice-archives/${archiveId}`);
      if (selectedArchiveId === archiveId) {
        setSelectedArchiveId(null);
        setArchiveDetail(null);
      }
      refresh();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Unable to delete archived invoice.");
    }
  };

  const updateInvoiceStatus = async (invoiceId: number, status: string) => {
    setInvoiceError(null);
    try {
      await apiPost(`/business/invoices/${invoiceId}/status?status=${encodeURIComponent(status)}`);
      refresh();
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to update invoice status.");
    }
  };

  const sendInvoice = async (invoice: any) => {
    setInvoiceNotice(null);
    setInvoiceSendError(null);
    const client = clients.find((c) => c.id === invoice.client_id);
    const recipientEmail = String(invoiceRecipientEmails[invoice.id] ?? client?.email ?? "").trim();
    try {
      await apiPost(`/business/invoices/${invoice.id}/send`, {
        recipient_email: recipientEmail || undefined
      });
      setInvoiceNotice(`Sent invoice to ${recipientEmail || client?.email || "recipient"}.`);
      refresh();
    } catch (err) {
      setInvoiceSendError(err instanceof Error ? err.message : "Unable to send invoice.");
    }
  };

  const clientById = new Map(clients.map((client) => [client.id, client]));
  const incomingTransactions = transactions
    .filter((txn) => Number(txn.amount) > 0)
    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")) || right.id - left.id);
  const openHistoricalInvoices = archivedInvoices.filter(
    (archive) => !isClosedReceivableStatus(archive.status) && Number(archive.balance_due ?? archive.total) > 0.005
  );
  const historicalOutstandingTotal = openHistoricalInvoices.reduce(
    (sum, archive) => sum + Number(archive.balance_due ?? archive.total ?? 0),
    0
  );
  const historicalCurrencies = Array.from(
    new Set(openHistoricalInvoices.map((invoice) => invoice.currency).filter(Boolean))
  );
  const clientLiveBalance = invoices.reduce((balances: Record<number, number>, invoice) => {
    if (isClosedReceivableStatus(invoice.status)) return balances;
    balances[invoice.client_id] =
      (balances[invoice.client_id] || 0) + Number(invoice.balance_due ?? invoice.total ?? 0);
    return balances;
  }, {});
  const clientHistoricalBalance = archivedInvoices.reduce((balances: Record<number, number>, archive) => {
    balances[archive.client_id] = (balances[archive.client_id] || 0) + Number(archive.balance_due ?? archive.total ?? 0);
    return balances;
  }, {});
  const filteredArchivedInvoices = archivedInvoices.filter((archive) => {
    const client = clientById.get(archive.client_id);
    const haystack = [
      archive.number,
      archive.file_name,
      archive.status,
      archive.notes,
      client?.name
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(archiveFilter.trim().toLowerCase());
  });
  const filteredArchivedOutstanding = filteredArchivedInvoices.reduce(
    (sum, archive) => sum + Number(archive.balance_due ?? archive.total ?? 0),
    0
  );
  const archiveDetailStatusLabel = archiveDetail?.invoice?.is_overdue
    ? "overdue"
    : (archiveDetail?.invoice?.status || "archived");
  const toggleClientDetails = (clientId: number) => {
    setExpandedClientId((current) => (current === clientId ? null : clientId));
  };
  const toggleInvoiceDetails = (invoiceId: number) => {
    setExpandedInvoiceId((current) => (current === invoiceId ? null : invoiceId));
  };

  return (
    <div className="page">
      <SectionHeader
        title="Business"
        subtitle="Run client records, receivables, and historical invoice collections from one local workspace."
      />
      <div className="panel business-summary-panel">
        <div className="business-summary-head">
          <div>
            <BoxTitle title="Business snapshot" />
            <p className="panel-help">
              Keep daily attention on live receivables and active clients. Open the tools only when you need to add or repair records.
            </p>
          </div>
          <div className="business-summary-actions">
            <button className="button-ghost button-small" onClick={() => openInvoiceComposer()} type="button">
              New invoice
            </button>
            <button className="button-ghost button-small" onClick={openClientCreator} type="button">
              New client
            </button>
            <button className="button-ghost button-small" onClick={() => openArchiveIntake()} type="button">
              Import history
            </button>
          </div>
        </div>
        <div className="business-brand-inline">
          <img src={companyLogoSrc} alt="Invoice logo" />
          <div>
            <strong>Invoice branding ready</strong>
            <span>
              {usingCustomLogo ? "Custom logo active." : "Default logo active."} Exported invoices follow the company profile in Control Room.
            </span>
          </div>
        </div>
        <div className="grid kpi-grid">
          <div className="card kpi-card">
            <div className="kpi-label">Active clients</div>
            <div className="kpi-value">{formatCount(activeClients.length)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">Open invoices</div>
            <div className="kpi-value">{formatCount(openInvoices.length)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">Live outstanding</div>
            <div className="kpi-value kpi-value-money">
              {formatCurrency(
                outstandingTotal,
                outstandingCurrencies.length === 1 ? outstandingCurrencies[0] : businessSnapshotCurrency
              )}
            </div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">Historical outstanding</div>
            <div className="kpi-value kpi-value-money">
              {formatCurrency(
                historicalOutstandingTotal,
                historicalCurrencies.length === 1 ? historicalCurrencies[0] : businessSnapshotCurrency
              )}
            </div>
          </div>
        </div>
        <div className="business-summary-meta">
          <span>{formatCount(invoiceStats.archived)} historical docs</span>
          <span>
            Archive value{" "}
            {formatCurrency(
              archivedInvoiceTotal,
              archiveCurrencies.length === 1 ? archiveCurrencies[0] : businessSnapshotCurrency
            )}
          </span>
          <span>{formatCount(invoiceStats.overdue)} overdue live invoices</span>
        </div>
      </div>
      <div className="panel">
        <BoxTitle title="Business tools" />
        <p className="panel-help">
          Create and repair records here when needed. The operating lists below stay focused on invoices, clients, and collections.
        </p>
        <div className="business-tool-stack">
          <CollapsibleSection
            title={editingInvoiceId ? "Edit live invoice" : "Create live invoice"}
            summary={invoiceToolSummary}
            defaultOpen={Boolean(editingInvoiceId)}
            autoOpenSignal={editingInvoiceId || invoiceToolOpenToken}
          >
            <div
              ref={invoiceEditorRef}
              className={`business-tool-card business-invoice-panel${editingInvoiceId ? " business-invoice-panel-editing" : ""}`}
            >
              {invoiceError && <p className="form-error">{invoiceError}</p>}
              <div className="invoice-compose-layout">
                <div className="invoice-compose-fields">
                  <div className="invoice-compose-summary">
                    <div>
                      <strong>
                        {editingInvoiceId
                          ? `Editing invoice ${invoiceForm.number.trim() || `#${editingInvoiceId}`}`
                          : "Unsaved invoice draft"}
                      </strong>
                      <p className="muted">
                        {editingInvoiceId
                          ? "Update the live invoice here, then save or cancel when you are done."
                          : "Keep the line-item subtotal for the work performed, then set an agreed total only when the payable amount is different."}
                      </p>
                    </div>
                    <div className="invoice-compose-total-stack">
                      <div className="invoice-compose-total-label">Total due</div>
                      <div className="invoice-compose-total">
                        {formatCurrency(draftInvoiceTotal, invoiceForm.currency || "USD")}
                      </div>
                    </div>
                  </div>
                  <div className="invoice-compose-grid">
                    <select
                      value={invoiceForm.client_id}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, client_id: e.target.value })}
                    >
                      <option value="">Select client</option>
                      {activeClients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Invoice number"
                      value={invoiceForm.number}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, number: e.target.value })}
                    />
                    <input
                      type="date"
                      value={toDateValue(invoiceForm.issue_date)}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, issue_date: e.target.value })}
                    />
                    <input
                      type="date"
                      value={toDateValue(invoiceForm.due_date)}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
                    />
                    <select
                      value={invoiceForm.currency}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, currency: e.target.value })}
                    >
                      <option value="USD">USD</option>
                      <option value="AUD">AUD</option>
                    </select>
                    <select
                      value={invoiceForm.status}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, status: e.target.value })}
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                      <option value="void">Void</option>
                    </select>
                  </div>
                  <textarea
                    placeholder="Internal notes or payment terms"
                    value={invoiceForm.notes}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                    rows={3}
                  />
                  <div className="invoice-compose-amounts">
                    <div className="invoice-compose-amount">
                      <span>Line subtotal</span>
                      <strong>{formatCurrency(draftInvoiceSubtotal, invoiceForm.currency || "USD")}</strong>
                    </div>
                    <label className="invoice-compose-amount invoice-compose-amount-editable">
                      <span>Agreed total</span>
                      <input
                        placeholder="Use subtotal"
                        value={invoiceForm.agreed_total}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, agreed_total: e.target.value })}
                      />
                    </label>
                    {Math.abs(draftInvoiceAdjustment) > 0.005 && (
                      <div className="invoice-compose-amount">
                        <span>Adjustment</span>
                        <strong>{formatSignedCurrency(draftInvoiceAdjustment, invoiceForm.currency || "USD")}</strong>
                      </div>
                    )}
                    <div className="invoice-compose-amount invoice-compose-amount-final">
                      <span>Total due</span>
                      <strong>{formatCurrency(draftInvoiceTotal, invoiceForm.currency || "USD")}</strong>
                    </div>
                  </div>
                  <p className="muted">Leave agreed total blank to bill the full line-item subtotal.</p>
                  <div className="invoice-line-items">
                    <div className="invoice-line-items-head">
                      <strong>Line items</strong>
                      <button className="button-ghost button-small" onClick={addLineItem} type="button">
                        Add line item
                      </button>
                    </div>
                    {lineItems.map((item, idx) => (
                      <div className="invoice-line-item-row" key={`line-${idx}`}>
                        <input
                          className="invoice-line-item-description"
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                        />
                        <input
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(idx, "quantity", e.target.value)}
                        />
                        <input
                          placeholder="Unit price"
                          value={item.unit_price}
                          onChange={(e) => updateLineItem(idx, "unit_price", e.target.value)}
                        />
                        <button className="button-ghost button-small" onClick={() => removeLineItem(idx)} type="button">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="row">
                    <button onClick={saveInvoice}>{editingInvoiceId ? "Save invoice" : "Create invoice"}</button>
                    {editingInvoiceId && (
                      <button
                        className="button-link"
                        onClick={() =>
                          openInvoicePreview(editingInvoiceRecord || { id: editingInvoiceId, number: invoiceForm.number })
                        }
                        type="button"
                      >
                        {invoicePreviewBusy ? "Opening PDF…" : "Preview saved PDF"}
                      </button>
                    )}
                    {editingInvoiceId && (
                      <button className="button-ghost" onClick={resetInvoiceForm}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                <InvoiceSheetPreview
                  companyLogoSrc={companyLogoSrc}
                  companyProfile={companyProfile}
                  client={selectedInvoiceClient}
                  invoiceNumber={draftPreviewNumber}
                  issueDate={invoiceForm.issue_date}
                  dueDate={invoiceForm.due_date}
                  currency={invoiceForm.currency || "USD"}
                  status={invoiceForm.status || "draft"}
                  notes={invoiceForm.notes}
                  lineItems={draftPreviewItems}
                  subtotal={draftInvoiceSubtotal}
                  total={draftInvoiceTotal}
                  heading={editingInvoiceId ? "Invoice preview" : "Draft preview"}
                  subtitle="This updates live and matches the cleaned export layout."
                />
              </div>
            </div>
          </CollapsibleSection>
          <CollapsibleSection
            title={editingClientId ? "Edit client" : "Client record"}
            summary={clientToolSummary}
            defaultOpen={Boolean(editingClientId)}
            autoOpenSignal={editingClientId || clientToolOpenToken}
          >
            <div ref={clientEditorRef} className={`business-tool-card${editingClientId ? " business-client-panel-editing" : ""}`}>
              {clientError && <p className="form-error">{clientError}</p>}
              {clientNotice && <p className="form-notice">{clientNotice}</p>}
              {editingClientId && (
                <p className="muted business-editor-state">
                  Editing client {clientForm.name.trim() || `#${editingClientId}`}. Save or cancel here when you are done.
                </p>
              )}
              <div className="row">
                <input
                  placeholder="Client name"
                  value={clientForm.name}
                  onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                />
                <input
                  placeholder="Email"
                  value={clientForm.email}
                  onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                />
                <input
                  placeholder="Phone"
                  value={clientForm.phone}
                  onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                />
              </div>
              <div className="row">
                <input
                  placeholder="Address"
                  value={clientForm.address}
                  onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                />
              </div>
              <textarea
                placeholder="Notes"
                value={clientForm.notes}
                onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                rows={3}
              />
              <div className="row">
                <button onClick={saveClient}>{editingClientId ? "Save client" : "Add client"}</button>
                {editingClientId && (
                  <button className="button-ghost" onClick={resetClientForm}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </CollapsibleSection>
          <CollapsibleSection
            title="Historical invoice intake"
            summary={archiveIntakeSummary}
            defaultOpen={false}
            autoOpenSignal={archiveIntakeOpenToken}
          >
            <div ref={archiveIntakeRef} className="business-tool-card">
              {archiveError && <p className="form-error">{archiveError}</p>}
              {archiveNotice && <p className="muted">{archiveNotice}</p>}
              <div className="row">
                <select
                  value={archiveForm.client_id}
                  onChange={(e) =>
                    setArchiveForm({
                      ...archiveForm,
                      client_id: e.target.value,
                      client_name: e.target.value ? "" : archiveForm.client_name
                    })
                  }
                >
                  <option value="">Use PDF or new client</option>
                  {activeClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Or new client name"
                  value={archiveForm.client_name}
                  onChange={(e) =>
                    setArchiveForm({
                      ...archiveForm,
                      client_name: e.target.value,
                      client_id: e.target.value ? "" : archiveForm.client_id
                    })
                  }
                />
                <input
                  key={archivePickerKey}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) =>
                    setArchiveForm({ ...archiveForm, file: e.target.files && e.target.files[0] ? e.target.files[0] : null })
                  }
                />
              </div>
              <div className="row">
                <input
                  placeholder="Invoice number"
                  value={archiveForm.number}
                  onChange={(e) => setArchiveForm({ ...archiveForm, number: e.target.value })}
                />
                <input
                  type="date"
                  value={archiveForm.issue_date}
                  onChange={(e) => setArchiveForm({ ...archiveForm, issue_date: e.target.value })}
                />
                <input
                  type="date"
                  value={archiveForm.due_date}
                  onChange={(e) => setArchiveForm({ ...archiveForm, due_date: e.target.value })}
                />
                <select
                  value={archiveForm.currency}
                  onChange={(e) => setArchiveForm({ ...archiveForm, currency: e.target.value })}
                >
                  <option value="USD">USD</option>
                  <option value="AUD">AUD</option>
                </select>
                <input
                  placeholder="Total"
                  value={archiveForm.total}
                  onChange={(e) => setArchiveForm({ ...archiveForm, total: e.target.value })}
                />
                <select
                  value={archiveForm.status}
                  onChange={(e) => setArchiveForm({ ...archiveForm, status: e.target.value })}
                >
                  <option value="archived">Archived</option>
                  <option value="paid">Paid</option>
                  <option value="sent">Sent</option>
                  <option value="partial">Partial</option>
                  <option value="draft">Draft</option>
                  <option value="void">Void</option>
                </select>
              </div>
              <textarea
                placeholder="Notes"
                value={archiveForm.notes}
                onChange={(e) => setArchiveForm({ ...archiveForm, notes: e.target.value })}
                rows={3}
              />
              <p className="muted">Leave client, number, dates, or total blank to auto-fill them from the PDF when possible.</p>
              <div className="row">
                <button onClick={uploadArchive}>Import historical invoice</button>
                <button className="button-ghost" onClick={resetArchiveForm}>
                  Clear
                </button>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </div>
      <div className="panel">
        <BoxTitle title="Client directory" />
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Activity</th>
              <th>Receivables</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {activeClients.length === 0 && (
              <tr>
                <td colSpan={4}>No active clients yet.</td>
              </tr>
            )}
            {activeClients.map((client) => {
              const isExpanded = expandedClientId === client.id;
              const liveCount = clientCurrentCounts[client.id] || 0;
              const archivedCount = clientArchivedCounts[client.id] || 0;
              const deleteLabel = canDeleteClientRecord(client.id) ? "Delete client" : "Archive client";
              const liveBalance = Number(clientLiveBalance[client.id] || 0);
              const archiveBalance = Number(clientHistoricalBalance[client.id] || 0);
              const totalBalance = liveBalance + archiveBalance;
              return (
                <Fragment key={client.id}>
                  <tr>
                    <td>
                      <div className="table-compact-title">{client.name}</div>
                      <div className="table-compact-meta">{client.email || client.phone || "No direct contact on file."}</div>
                    </td>
                    <td>
                      <div className="table-compact-title">
                        {formatCount(liveCount)} live · {formatCount(archivedCount)} archived
                      </div>
                      <div className="table-compact-meta">
                        {client.notes ? "Notes on file" : "No client notes"}
                      </div>
                    </td>
                    <td>
                      <div className="table-compact-title">{formatAmount(totalBalance)}</div>
                      <div className="table-compact-meta">
                        Live {formatAmount(liveBalance)} · Archive {formatAmount(archiveBalance)}
                      </div>
                    </td>
                    <td>
                      <RowDisclosureButton open={isExpanded} onClick={() => toggleClientDetails(client.id)} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="table-detail-row">
                      <td colSpan={4}>
                        <div className="table-detail-grid">
                          <div className="table-detail-card">
                            <div className="table-detail-title">Contact record</div>
                            <div className="table-detail-copy">
                              <div>
                                <strong>Email:</strong> {client.email || "—"}
                              </div>
                              <div>
                                <strong>Phone:</strong> {client.phone || "—"}
                              </div>
                              <div>
                                <strong>Address:</strong> {client.address || "—"}
                              </div>
                              <div>
                                <strong>Notes:</strong> {client.notes || "—"}
                              </div>
                            </div>
                          </div>
                          <div className="table-detail-card">
                            <div className="table-detail-title">Client actions</div>
                            <div className="row">
                              <button className="button-ghost button-small" onClick={() => startEditClient(client)}>
                                Edit
                              </button>
                              <button
                                className="button-ghost button-small"
                                onClick={() => openInvoiceComposer(client.id)}
                              >
                                New invoice
                              </button>
                              <button
                                className="button-ghost button-small"
                                onClick={() => openArchiveIntake(client.id)}
                              >
                                Import history
                              </button>
                              <button className="button-small" onClick={() => deleteClient(client.id)}>
                                {deleteLabel}
                              </button>
                            </div>
                            <div className="table-detail-copy">
                              <div>
                                <strong>Live receivables:</strong> {formatAmount(liveBalance)}
                              </div>
                              <div>
                                <strong>Historical balance:</strong> {formatAmount(archiveBalance)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {archivedClients.length > 0 && (
          <div className="archived-client-toggle">
            <button className="button-ghost" onClick={() => setShowArchivedClients(!showArchivedClients)}>
              {showArchivedClients ? "Hide archived clients" : `Show archived clients (${archivedClients.length})`}
            </button>
          </div>
        )}
        {showArchivedClients && archivedClients.length > 0 && (
          <div className="archived-client-list">
            <div className="table-detail-title">Archived clients</div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {archivedClients.map((client) => (
                  <tr key={`arch-${client.id}`}>
                    <td>{client.name}</td>
                    <td>{client.email || ""}</td>
                    <td>{client.phone || ""}</td>
                    <td>
                      <button className="button-ghost button-small" onClick={() => restoreClient(client)}>
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="panel">
        <div className="panel-title-row">
          <div>
            <BoxTitle title="Live invoices" />
            <p className="panel-help">Open invoices stay visible by default. Settled invoices remain available for review.</p>
          </div>
          {settledInvoices.length > 0 && (
            <button
              className="button-ghost button-small"
              onClick={() => setShowSettledInvoices((current) => !current)}
              type="button"
            >
              {showSettledInvoices ? "Hide settled" : `Show settled (${settledInvoices.length})`}
            </button>
          )}
        </div>
        {invoiceNotice && <p className="muted">{invoiceNotice}</p>}
        {invoiceSendError && <p className="form-error">{invoiceSendError}</p>}
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Timing</th>
              <th>Balance</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {displayedInvoices.length === 0 && (
              <tr>
                <td colSpan={4}>
                  {invoices.length === 0
                    ? "No live invoices yet."
                    : "No open invoices. Settled invoices are hidden."}
                </td>
              </tr>
            )}
            {displayedInvoices.map((invoice) => {
              const client = clients.find((c) => c.id === invoice.client_id);
              const amountValue = paymentAmounts[invoice.id] ?? String(invoice.total);
              const isExpanded = expandedInvoiceId === invoice.id;
              const balanceDue = Number(invoice.balance_due ?? invoice.total ?? 0);
              const invoiceStatusLabel = invoice.is_overdue ? "overdue" : (invoice.status || "draft");
              return (
                <Fragment key={invoice.id}>
                  <tr>
                    <td>
                      <div className="table-compact-title">{invoice.number || `INV-${invoice.id}`}</div>
                      <div className="table-compact-meta">{client ? client.name : "Client record missing"}</div>
                    </td>
                    <td>
                      <div className="table-compact-title">Issued {toDateValue(invoice.issue_date) || "—"}</div>
                      <div className="table-compact-meta">Due {toDateValue(invoice.due_date) || "No due date"}</div>
                    </td>
                    <td>
                      <div className="table-status-stack">
                        <span className={`status-pill status-${String(invoiceStatusLabel).toLowerCase()}`}>
                          {invoiceStatusLabel}
                        </span>
                        <div className="table-compact-meta">
                          {formatCurrency(balanceDue, invoice.currency)} due of {formatCurrency(invoice.total, invoice.currency)}
                          {invoice.is_overdue ? ` · ${formatCount(invoice.days_overdue || 0)}d overdue` : ""}
                        </div>
                      </div>
                    </td>
                    <td>
                      <RowDisclosureButton open={isExpanded} onClick={() => toggleInvoiceDetails(invoice.id)} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="table-detail-row">
                      <td colSpan={4}>
                        <div className="table-detail-grid">
                          <div className="table-detail-card">
                            <div className="table-detail-title">Invoice controls</div>
                            <div className="row invoice-send-row">
                              <input
                                className="invoice-send-input"
                                placeholder="Recipient email"
                                value={invoiceRecipientEmails[invoice.id] ?? String(client?.email || "")}
                                onChange={(e) =>
                                  setInvoiceRecipientEmails((prev) => ({ ...prev, [invoice.id]: e.target.value }))
                                }
                              />
                            </div>
                            <div className="row invoice-action-row">
                              <select
                                value={invoice.status}
                                onChange={(e) => updateInvoiceStatus(invoice.id, e.target.value)}
                              >
                                <option value="draft">Draft</option>
                                <option value="sent">Sent</option>
                                <option value="partial">Partial</option>
                                <option value="paid">Paid</option>
                                <option value="void">Void</option>
                              </select>
                              <button
                                className="button-link"
                                onClick={() => openInvoicePreview(invoice)}
                                type="button"
                              >
                                {invoicePreviewBusy ? "Opening PDF…" : "Preview PDF"}
                              </button>
                              <button
                                className="button-ghost button-small"
                                onClick={() => downloadInvoicePdf(invoice)}
                                type="button"
                              >
                                Download
                              </button>
                              {invoice.status === "draft" && (
                                <button className="button-ghost button-small" onClick={() => sendInvoice(invoice)} type="button">
                                  Send
                                </button>
                              )}
                              <button
                                className="button-ghost button-small"
                                onClick={() => startEditInvoice(invoice.id)}
                                type="button"
                              >
                                Edit
                              </button>
                              <button className="button-small" onClick={() => deleteInvoice(invoice.id)} type="button">
                                Delete
                              </button>
                            </div>
                            <div className="table-detail-copy">
                              <div>
                                <strong>Email target:</strong> {String(invoiceRecipientEmails[invoice.id] ?? client?.email ?? "").trim() || "—"}
                              </div>
                              <div>
                                <strong>Issue date:</strong> {toDateValue(invoice.issue_date) || "—"}
                              </div>
                              <div>
                                <strong>Due date:</strong> {toDateValue(invoice.due_date) || "—"}
                              </div>
                              <div>
                                <strong>Line subtotal:</strong> {formatCurrency(invoice.subtotal, invoice.currency)}
                              </div>
                              {Math.abs(Number(invoice.adjustment || 0)) > 0.005 && (
                                <div>
                                  <strong>Adjustment:</strong> {formatSignedCurrency(invoice.adjustment, invoice.currency)}
                                </div>
                              )}
                              <div>
                                <strong>Notes:</strong> {invoice.notes || "—"}
                              </div>
                            </div>
                          </div>
                          <div className="table-detail-card">
                            <div className="table-detail-title">Payment matching</div>
                            <div className="invoice-payment-row">
                              <input
                                className="invoice-payment-amount"
                                placeholder="Amount"
                                value={amountValue}
                                onChange={(e) =>
                                  setPaymentAmounts((prev) => ({ ...prev, [invoice.id]: e.target.value }))
                                }
                              />
                              <select
                                className="invoice-payment-select"
                                onChange={(e) => applyPayment(invoice.id, Number(e.target.value), Number(amountValue))}
                                value=""
                              >
                                <option value="">Apply payment</option>
                                {incomingTransactions.map((txn) => (
                                  <option key={txn.id} value={txn.id}>
                                    {txn.date} {txn.account_name ? `${txn.account_name} · ` : ""}
                                    {txn.description} {formatCurrency(txn.amount, txn.currency)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="table-detail-copy">
                              <div>
                                <strong>Total due:</strong> {formatCurrency(invoice.total, invoice.currency)}
                              </div>
                              <div>
                                <strong>Balance due:</strong> {formatCurrency(balanceDue, invoice.currency)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <BoxTitle title="Historical records" />
        <p className="panel-help">Keep older invoice PDFs and receipt reconciliation here so the main business view stays focused on current work.</p>
        <CollapsibleSection
          title="Historical invoice workspace"
          summary={`${formatCount(filteredArchivedInvoices.length)} records · ${formatAmount(filteredArchivedOutstanding)} open`}
          defaultOpen={false}
        >
          {archiveError && <p className="form-error">{archiveError}</p>}
          {archiveNotice && <p className="muted">{archiveNotice}</p>}
          <div className="archive-workspace">
            <div className="archive-queue">
              <div className="archive-queue-header">
                <strong>Historical invoices</strong>
                <div className="archive-queue-summary">
                  <span>{formatCount(filteredArchivedInvoices.length)} records</span>
                  <span>{formatAmount(filteredArchivedOutstanding)} open</span>
                </div>
                <input
                  placeholder="Filter invoices"
                  value={archiveFilter}
                  onChange={(e) => setArchiveFilter(e.target.value)}
                />
              </div>
              {filteredArchivedInvoices.length === 0 && (
                <div className="archive-empty">No historical invoices match the current filter.</div>
              )}
              {filteredArchivedInvoices.map((archive) => {
                const client = clientById.get(archive.client_id);
                const isActive = archive.id === selectedArchiveId;
                const archiveStatusLabel = archive.is_overdue ? "overdue" : (archive.status || "archived");
                return (
                  <button
                    key={archive.id}
                    type="button"
                    className={`archive-item${isActive ? " active" : ""}`}
                    onClick={() => setSelectedArchiveId(archive.id)}
                  >
                    <div className="archive-item-head">
                      <strong>{archive.number || archive.file_name}</strong>
                      <span className={`status-pill status-${String(archiveStatusLabel).toLowerCase()}`}>
                        {archiveStatusLabel}
                      </span>
                    </div>
                    <div className="archive-item-sub">{client?.name || `Client ${archive.client_id}`}</div>
                    <div className="archive-item-meta">
                      <span>{archive.issue_date || "No issue date"}</span>
                      <span>
                        Due {formatCurrency(archive.balance_due ?? archive.total, archive.currency)}
                        {archive.is_overdue ? ` · ${formatCount(archive.days_overdue || 0)}d overdue` : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="archive-detail">
              {archiveDetailLoading && <div className="archive-empty">Loading historical invoice…</div>}
              {!archiveDetailLoading && !archiveDetail && (
                <div className="archive-empty">Select a historical invoice to edit details and match receipts.</div>
              )}
              {!archiveDetailLoading && archiveDetail && (
                <Fragment>
                <div className="archive-detail-head">
                  <div>
                    <h3>{archiveDetail.invoice.number || archiveDetail.invoice.file_name}</h3>
                    <p className="muted">
                      {clientById.get(archiveDetail.invoice.client_id)?.name || `Client ${archiveDetail.invoice.client_id}`} ·{" "}
                      {archiveDetail.invoice.file_name}
                    </p>
                  </div>
                  <div className="archive-detail-actions">
                    <a
                      className="button-link"
                      href={`${API_BASE}/business/invoice-archives/${archiveDetail.invoice.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download PDF
                    </a>
                    <button className="button-small" onClick={() => deleteArchive(archiveDetail.invoice.id)}>
                      Delete
                    </button>
                  </div>
                </div>
                <CollapsibleSection
                  key={`archive-overview-${archiveDetail.invoice.id}`}
                  title="Overview"
                  summary={`${archiveDetailStatusLabel} · ${formatCurrency(
                    archiveDetail.balance_due,
                    archiveDetail.invoice.currency
                  )} open${archiveDetail.invoice.is_overdue ? ` · ${formatCount(archiveDetail.invoice.days_overdue || 0)}d overdue` : ""}`}
                  defaultOpen
                >
                  <div className="detail-grid">
                    <div className="card archive-summary-card">
                      <div className="metric-stack">
                        <div className="metric-row">
                          <strong>{formatCurrency(archiveDetail.invoice.total, archiveDetail.invoice.currency)}</strong>
                          <span>Total</span>
                        </div>
                        <div className="metric-row">
                          <strong>{formatCurrency(archiveDetail.paid_total, archiveDetail.invoice.currency)}</strong>
                          <span>Applied</span>
                        </div>
                        <div className="metric-row">
                          <strong>{formatCurrency(archiveDetail.balance_due, archiveDetail.invoice.currency)}</strong>
                          <span>Open balance</span>
                        </div>
                      </div>
                    </div>
                    <div className="card archive-summary-card">
                      <div className="table-detail-title">Reference</div>
                      <div className="table-detail-copy">
                        <div>
                          <strong>Client:</strong>{" "}
                          {clientById.get(archiveDetail.invoice.client_id)?.name || `Client ${archiveDetail.invoice.client_id}`}
                        </div>
                        <div>
                          <strong>Source:</strong> {archiveDetail.invoice.source_label}
                        </div>
                        <div>
                          <strong>Updated:</strong>{" "}
                          {formatTimestampLabel(archiveDetail.invoice.updated_at || archiveDetail.invoice.created_at)}
                        </div>
                        <div>
                          <strong>File:</strong> {archiveDetail.invoice.file_name}
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleSection>
                <CollapsibleSection
                  key={`archive-meta-${archiveDetail.invoice.id}`}
                  title="Invoice metadata"
                  summary={`${clientById.get(archiveDetail.invoice.client_id)?.name || "Client"} · ${
                    archiveDetail.invoice.number || archiveDetail.invoice.file_name
                  }`}
                  defaultOpen={false}
                >
                  <div className="card archive-edit-card">
                    <div className="archive-form-grid">
                      <select
                        value={archiveEditForm.client_id}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, client_id: e.target.value })}
                      >
                        <option value="">Select client</option>
                        {visibleClients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="Invoice number"
                        value={archiveEditForm.number}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, number: e.target.value })}
                      />
                      <input
                        type="date"
                        value={archiveEditForm.issue_date}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, issue_date: e.target.value })}
                      />
                      <input
                        type="date"
                        value={archiveEditForm.due_date}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, due_date: e.target.value })}
                      />
                      <select
                        value={archiveEditForm.currency}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, currency: e.target.value })}
                      >
                        <option value="USD">USD</option>
                        <option value="AUD">AUD</option>
                      </select>
                      <input
                        placeholder="Total"
                        value={archiveEditForm.total}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, total: e.target.value })}
                      />
                      <select
                        value={archiveEditForm.status}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, status: e.target.value })}
                      >
                        <option value="archived">Archived</option>
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="partial">Partial</option>
                        <option value="paid">Paid</option>
                        <option value="void">Void</option>
                      </select>
                    </div>
                    <textarea
                      placeholder="Notes"
                      value={archiveEditForm.notes}
                      onChange={(e) => setArchiveEditForm({ ...archiveEditForm, notes: e.target.value })}
                      rows={4}
                    />
                    <div className="row">
                      <button onClick={saveArchiveDetail}>Save historical invoice</button>
                      <button
                        className="button-ghost"
                        onClick={() => archiveDetail && setArchiveEditForm(syncArchiveDetail(archiveDetail))}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </CollapsibleSection>
                <CollapsibleSection
                  key={`archive-matched-${archiveDetail.invoice.id}`}
                  title="Matched receipts"
                  summary={`${formatCount(archiveDetail.payments.length)} linked · ${formatCurrency(
                    archiveDetail.paid_total,
                    archiveDetail.invoice.currency
                  )} applied`}
                  defaultOpen={archiveDetail.payments.length > 0}
                >
                  <div className="card">
                    {archiveDetail.payments.length === 0 && (
                      <div className="archive-empty">No receipts linked yet.</div>
                    )}
                    <div className="receipt-list">
                      {archiveDetail.payments.map((payment: any) => (
                        <div className="receipt-row" key={payment.id}>
                          <div className="receipt-copy">
                            <strong>{payment.transaction_date} · {formatCurrency(payment.amount, archiveDetail.invoice.currency)}</strong>
                            <div className="muted">
                              {payment.transaction_account_name ? `${payment.transaction_account_name} · ` : ""}
                              {payment.transaction_description}
                            </div>
                            <div className="receipt-meta-line">
                              Remaining on receipt: {formatCurrency(payment.transaction_available_amount, archiveDetail.invoice.currency)}
                            </div>
                          </div>
                          <button className="button-ghost button-small" onClick={() => removeArchivePayment(payment.id)}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CollapsibleSection>
                <CollapsibleSection
                  key={`archive-candidates-${archiveDetail.invoice.id}`}
                  title="Suggested receipts"
                  summary={
                    archiveDetail.candidate_transactions.length
                      ? `${formatCount(archiveDetail.candidate_transactions.length)} candidates ready to link`
                      : "No candidate receipts available"
                  }
                  defaultOpen={archiveDetail.payments.length === 0 && archiveDetail.candidate_transactions.length > 0}
                >
                  <div className="card">
                    {archiveDetail.candidate_transactions.length === 0 && (
                      <div className="archive-empty">No candidate receipts available.</div>
                    )}
                    <div className="receipt-list">
                      {archiveDetail.candidate_transactions.map((candidate: any) => (
                        <div className="receipt-row" key={candidate.id}>
                          <div className="receipt-copy">
                            <strong>
                              {candidate.date} · {formatCurrency(candidate.available_amount, candidate.currency)}
                            </strong>
                            <div className="muted">
                              {candidate.account_name ? `${candidate.account_name} · ` : ""}
                              {candidate.description}
                            </div>
                            <div className="receipt-meta-line">
                              {candidate.match_reason} · score {candidate.match_score}
                            </div>
                          </div>
                          <div className="receipt-actions">
                            <input
                              placeholder="Amount"
                              value={archivePaymentAmounts[candidate.id] ?? ""}
                              onChange={(e) =>
                                setArchivePaymentAmounts((prev) => ({ ...prev, [candidate.id]: e.target.value }))
                              }
                            />
                            <button className="button-small" onClick={() => applyArchivePayment(candidate.id)}>
                              Link receipt
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CollapsibleSection>
                </Fragment>
              )}
            </div>
          </div>
        </CollapsibleSection>
      </div>
      {invoicePreview && (
        <div className="modal-backdrop" onClick={closeInvoicePreview}>
          <div
            className="invoice-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${invoicePreview.title} PDF preview`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="invoice-preview-modal-head">
              <div>
                <strong>{invoicePreview.title}</strong>
                <p className="muted">Inline PDF review without downloading first.</p>
              </div>
              <div className="row">
                <a className="button-link" href={invoicePreview.url} download={invoicePreview.name}>
                  Download PDF
                </a>
                <button className="button-ghost button-small" onClick={closeInvoicePreview} type="button">
                  Close
                </button>
              </div>
            </div>
            <iframe className="invoice-preview-frame" src={invoicePreview.url} title={`${invoicePreview.title} PDF`} />
          </div>
        </div>
      )}
    </div>
  );
}

function Timesheets({ onInvoiceCreated }: { onInvoiceCreated?: () => void }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeEntry, setActiveEntry] = useState<any | null>(null);
  const [runningSeconds, setRunningSeconds] = useState(0);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [timeInvoiceError, setTimeInvoiceError] = useState<string | null>(null);
  const [timeInvoiceSuccess, setTimeInvoiceSuccess] = useState<string | null>(null);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [projectForm, setProjectForm] = useState({ name: "", client_id: "", hourly_rate: "", tags: "" });
  const [taskForm, setTaskForm] = useState({ project_id: "", name: "" });
  const [entryForm, setEntryForm] = useState({
    project_id: "",
    task_id: "",
    date: todayDate(),
    start_time: "",
    end_time: "",
    duration_minutes: "",
    notes: "",
    billable: true,
    hourly_rate: "",
    invoiced_invoice_id: ""
  });
  const [invoiceForm, setInvoiceForm] = useState({
    client_id: "",
    number: "",
    issue_date: todayDate(),
    due_date: "",
    currency: "AUD",
    group_by: "day"
  });
  const [selectedEntries, setSelectedEntries] = useState<Record<number, boolean>>({});

  const refresh = () =>
    Promise.all([
      apiGet<any[]>("/timesheets/entries"),
      apiGet<any[]>("/timesheets/projects"),
      apiGet<any[]>("/timesheets/tasks"),
      apiGet<any[]>("/business/clients")
    ])
      .then(([entriesData, projectsData, tasksData, clientsData]) => {
        setEntries(entriesData);
        setProjects(projectsData);
        setTasks(tasksData);
        setClients(clientsData);
        const running = entriesData.find((entry) => !entry.end_time);
        setActiveEntry(running || null);
        setActiveId(running ? running.id : null);
      })
      .catch(() => undefined);

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!activeEntry?.start_time) {
      setRunningSeconds(0);
      return;
    }
    const startAt = new Date(activeEntry.start_time).getTime();
    if (Number.isNaN(startAt)) {
      setRunningSeconds(0);
      return;
    }
    const tick = () => setRunningSeconds(Math.max(0, Math.floor((Date.now() - startAt) / 1000)));
    tick();
    const handle = window.setInterval(tick, 1000);
    return () => window.clearInterval(handle);
  }, [activeEntry?.start_time, activeEntry?.id]);

  const start = async () => {
    if (!projectId || activeEntry) return;
    const taskQuery = taskId ? `&task_id=${taskId}` : "";
    const data = await apiPost<any>(`/timesheets/timer/start?project_id=${projectId}${taskQuery}`);
    setActiveId(data.entry_id);
    refresh();
  };

  const stop = async () => {
    if (!activeId) return;
    await apiPost(`/timesheets/timer/stop?entry_id=${activeId}`);
    setActiveId(null);
    refresh();
  };

  const createProject = async () => {
    await apiPost("/timesheets/projects", {
      name: projectForm.name,
      client_id: projectForm.client_id ? Number(projectForm.client_id) : null,
      hourly_rate: projectForm.hourly_rate ? Number(projectForm.hourly_rate) : null,
      tags: projectForm.tags || null,
      is_active: true
    });
    setProjectForm({ name: "", client_id: "", hourly_rate: "", tags: "" });
    refresh();
  };

  const createTask = async () => {
    await apiPost("/timesheets/tasks", {
      project_id: Number(taskForm.project_id),
      name: taskForm.name,
      is_active: true
    });
    setTaskForm({ project_id: "", name: "" });
    refresh();
  };

  const createEntry = async () => {
    setEntryError(null);
    if (!entryForm.project_id) {
      setEntryError("Select a project before saving.");
      return;
    }
    const dateValue =
      entryForm.date || (entryForm.start_time ? entryForm.start_time.split("T")[0] : todayDate());
    const startValue = entryForm.start_time || "";
    const endValue = entryForm.end_time || "";
    if (endValue && !startValue) {
      setEntryError("Start time is required when an end time is set.");
      return;
    }
    if (startValue && endValue) {
      const startAt = new Date(startValue);
      const endAt = new Date(endValue);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        setEntryError("Start and end time must be valid.");
        return;
      }
      if (endAt <= startAt) {
        setEntryError("End time must be after start time.");
        return;
      }
    } else if (!startValue && !endValue) {
      const minutes = Number(entryForm.duration_minutes || 0);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        setEntryError("Provide a duration or a start/end time.");
        return;
      }
    }
    try {
      await apiPost("/timesheets/entries", {
        project_id: Number(entryForm.project_id),
        task_id: entryForm.task_id ? Number(entryForm.task_id) : null,
        date: dateValue,
        start_time: startValue || null,
        end_time: endValue || null,
        duration_minutes: Number(entryForm.duration_minutes || 0),
        notes: entryForm.notes || null,
        billable: entryForm.billable,
        hourly_rate: entryForm.hourly_rate ? Number(entryForm.hourly_rate) : null,
        invoiced_invoice_id: entryForm.invoiced_invoice_id ? Number(entryForm.invoiced_invoice_id) : null
      });
      setEntryForm({
        project_id: "",
        task_id: "",
        date: todayDate(),
        start_time: "",
        end_time: "",
        duration_minutes: "",
        notes: "",
        billable: true,
        hourly_rate: "",
        invoiced_invoice_id: ""
      });
      setEditingEntryId(null);
      refresh();
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : "Unable to save entry.");
    }
  };

  const activeClients = clients.filter((client) => client.is_active !== 0);
  const startEditEntry = (entry: any) => {
    setEntryError(null);
    setEditingEntryId(entry.id);
    setEntryForm({
      project_id: String(entry.project_id),
      task_id: entry.task_id ? String(entry.task_id) : "",
      date: entry.date,
      start_time: toDatetimeLocal(entry.start_time || ""),
      end_time: toDatetimeLocal(entry.end_time || ""),
      duration_minutes: String(entry.duration_minutes || ""),
      notes: entry.notes || "",
      billable: Boolean(entry.billable),
      hourly_rate: entry.hourly_rate ? String(entry.hourly_rate) : "",
      invoiced_invoice_id: entry.invoiced_invoice_id ? String(entry.invoiced_invoice_id) : ""
    });
  };

  const saveEntryEdit = async () => {
    if (!editingEntryId) return;
    setEntryError(null);
    if (!entryForm.project_id) {
      setEntryError("Select a project before saving.");
      return;
    }
    const dateValue =
      entryForm.date || (entryForm.start_time ? entryForm.start_time.split("T")[0] : todayDate());
    const startValue = entryForm.start_time || "";
    const endValue = entryForm.end_time || "";
    if (endValue && !startValue) {
      setEntryError("Start time is required when an end time is set.");
      return;
    }
    if (startValue && endValue) {
      const startAt = new Date(startValue);
      const endAt = new Date(endValue);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        setEntryError("Start and end time must be valid.");
        return;
      }
      if (endAt <= startAt) {
        setEntryError("End time must be after start time.");
        return;
      }
    } else if (!startValue && !endValue) {
      const minutes = Number(entryForm.duration_minutes || 0);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        setEntryError("Provide a duration or a start/end time.");
        return;
      }
    }
    try {
      await apiPost(`/timesheets/entries/${editingEntryId}`, {
        project_id: Number(entryForm.project_id),
        task_id: entryForm.task_id ? Number(entryForm.task_id) : null,
        date: dateValue,
        start_time: startValue || null,
        end_time: endValue || null,
        duration_minutes: Number(entryForm.duration_minutes || 0),
        notes: entryForm.notes || null,
        billable: entryForm.billable,
        hourly_rate: entryForm.hourly_rate ? Number(entryForm.hourly_rate) : null,
        invoiced_invoice_id: entryForm.invoiced_invoice_id ? Number(entryForm.invoiced_invoice_id) : null
      });
      setEditingEntryId(null);
      setEntryForm({
        project_id: "",
        task_id: "",
        date: todayDate(),
        start_time: "",
        end_time: "",
        duration_minutes: "",
        notes: "",
        billable: true,
        hourly_rate: "",
        invoiced_invoice_id: ""
      });
      refresh();
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : "Unable to save entry.");
    }
  };

  const deleteEntry = async (entryId: number) => {
    await apiDelete(`/timesheets/entries/${entryId}`);
    refresh();
  };

  const deleteProject = async (projectIdToDelete: number) => {
    await apiDelete(`/timesheets/projects/${projectIdToDelete}`);
    refresh();
  };

  const deleteTask = async (taskIdToDelete: number) => {
    await apiDelete(`/timesheets/tasks/${taskIdToDelete}`);
    refresh();
  };

  const exportTimesheets = () => {
    window.open(`${API_BASE}/reports/timesheets/export`, "_blank");
  };

  const toggleEntry = (entryId: number) => {
    setSelectedEntries((prev) => ({ ...prev, [entryId]: !prev[entryId] }));
  };

  const createInvoiceFromTime = async () => {
    setTimeInvoiceError(null);
    setTimeInvoiceSuccess(null);
    setCreatedInvoiceId(null);
    const entryIds = Object.entries(selectedEntries)
      .filter(([_, selected]) => selected)
      .map(([id]) => Number(id));
    if (!entryIds.length) {
      setTimeInvoiceError("Select at least one time entry.");
      return;
    }
    if (!invoiceForm.client_id) {
      setTimeInvoiceError("Select a client for the invoice.");
      return;
    }
    const issueDate = invoiceForm.issue_date || todayDate();
    setInvoiceForm((prev) => ({ ...prev, issue_date: issueDate }));
    try {
      const created = await apiPost<any>("/timesheets/invoice", {
        client_id: Number(invoiceForm.client_id),
        number: invoiceForm.number,
        status: "draft",
        issue_date: issueDate,
        due_date: invoiceForm.due_date || undefined,
        currency: invoiceForm.currency,
        time_entry_ids: entryIds,
        group_by: invoiceForm.group_by
      });
      setTimeInvoiceSuccess(
        `Created invoice ${created?.number ? `#${created.number}` : ""}`.trim() || "Invoice created."
      );
      setCreatedInvoiceId(created?.id ?? null);
      setSelectedEntries({});
      refresh();
      onInvoiceCreated?.();
    } catch (err) {
      setTimeInvoiceError(err instanceof Error ? err.message : "Unable to create invoice from time entries.");
    }
  };

  const totalMinutes = entries.reduce((sum, entry) => sum + Number(entry.duration_minutes || 0), 0);
  const billableMinutes = entries.reduce(
    (sum, entry) => sum + (entry.billable ? Number(entry.duration_minutes || 0) : 0),
    0
  );
  const projectSummary = projects
    .map((project) => {
      const projectEntries = entries.filter((entry) => entry.project_id === project.id);
      const minutes = projectEntries.reduce((sum, entry) => sum + Number(entry.duration_minutes || 0), 0);
      const billable = projectEntries.reduce(
        (sum, entry) => sum + (entry.billable ? Number(entry.duration_minutes || 0) : 0),
        0
      );
      const client = clients.find((c) => c.id === project.client_id);
      return {
        id: project.id,
        name: project.name,
        client: client ? client.name : project.client_id || "",
        hourly_rate: project.hourly_rate || "",
        minutes,
        billable
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  const weeklyBuckets: Record<
    string,
    { entries: any[]; totalMinutes: number; billableMinutes: number }
  > = {};
  entries.forEach((entry) => {
    const dateKey = entry.date || (entry.start_time ? String(entry.start_time).slice(0, 10) : "");
    const weekKey = weekStartLabel(dateKey);
    if (!weekKey) return;
    if (!weeklyBuckets[weekKey]) {
      weeklyBuckets[weekKey] = { entries: [], totalMinutes: 0, billableMinutes: 0 };
    }
    const minutes = Number(entry.duration_minutes || 0);
    weeklyBuckets[weekKey].entries.push(entry);
    weeklyBuckets[weekKey].totalMinutes += minutes;
    if (entry.billable) {
      weeklyBuckets[weekKey].billableMinutes += minutes;
    }
  });
  const weeklyRows = Object.entries(weeklyBuckets)
    .map(([week, data]) => ({ week, ...data }))
    .sort((a, b) => b.week.localeCompare(a.week));
  const selectedEntryCount = Object.values(selectedEntries).filter(Boolean).length;
  const projectSetupSummary =
    projects.length > 0 || tasks.length > 0
      ? `${formatCount(projects.length)} projects · ${formatCount(tasks.length)} tasks`
      : "Create projects and tasks once, then keep this tucked away.";
  const weeklySummary =
    weeklyRows.length > 0
      ? `${formatCount(weeklyRows.length)} weekly rollups · latest ${weeklyRows[0]?.week || ""}`
      : "Weekly rollups appear after entries are logged.";

  return (
    <div className="page">
      <SectionHeader title="Projects + Time" subtitle="Track projects, weekly timesheets, and billable hours." />
      <div className="panel">
        <BoxTitle title="Projects tracker" />
        <div className="row">
          <span className="pill">Total hours {formatHours(totalMinutes)}</span>
          <span className="pill">Billable hours {formatHours(billableMinutes)}</span>
          <span className="pill">Active timer {activeEntry ? "Running" : "Idle"}</span>
          <span className="pill">Selected for invoice {formatCount(selectedEntryCount)}</span>
        </div>
        {projectSummary.length === 0 ? (
          <p className="muted">Create a project to track progress.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Rate</th>
                <th>Total hours</th>
                <th>Billable hours</th>
              </tr>
            </thead>
            <tbody>
              {projectSummary.map((project) => (
                <tr key={`summary-${project.id}`}>
                  <td>{project.name}</td>
                  <td>{project.client}</td>
                  <td>{project.hourly_rate}</td>
                  <td>{formatHours(project.minutes)}</td>
                  <td>{formatHours(project.billable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <CollapsibleSection
        title="Project setup"
        summary={projectSetupSummary}
        defaultOpen={projects.length === 0}
      >
        <div className="panel">
          <BoxTitle title="Create project" />
          <div className="row">
            <input
              placeholder="Project name"
              value={projectForm.name}
              onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
            />
            <select
              value={projectForm.client_id}
              onChange={(e) => setProjectForm({ ...projectForm, client_id: e.target.value })}
            >
              <option value="">Client (optional)</option>
              {activeClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Hourly rate"
              value={projectForm.hourly_rate}
              onChange={(e) => setProjectForm({ ...projectForm, hourly_rate: e.target.value })}
            />
            <input
              placeholder="Tags"
              value={projectForm.tags}
              onChange={(e) => setProjectForm({ ...projectForm, tags: e.target.value })}
            />
            <button onClick={createProject}>Add project</button>
          </div>
        </div>
        <div className="panel">
          <BoxTitle title="Projects" />
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Client</th>
                <th>Rate</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const client = clients.find((c) => c.id === project.client_id);
                return (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{client ? client.name : project.client_id || ""}</td>
                    <td>{project.hourly_rate || ""}</td>
                    <td>
                      <button onClick={() => deleteProject(project.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <BoxTitle title="Create task" />
          <div className="row">
            <select
              value={taskForm.project_id}
              onChange={(e) => setTaskForm({ ...taskForm, project_id: e.target.value })}
            >
              <option value="">Select project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Task name"
              value={taskForm.name}
              onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
            />
            <button onClick={createTask}>Add task</button>
          </div>
        </div>
        <div className="panel">
          <BoxTitle title="Tasks" />
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Task</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const project = projects.find((p) => p.id === task.project_id);
                return (
                  <tr key={task.id}>
                    <td>{project ? project.name : task.project_id}</td>
                    <td>{task.name}</td>
                    <td>
                      <button onClick={() => deleteTask(task.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
      <div className="panel">
        <div className="row">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">Task (optional)</option>
            {tasks
              .filter((task) => !projectId || String(task.project_id) === projectId)
              .map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
          </select>
          <button onClick={start}>Start timer</button>
          <button onClick={stop}>Stop timer</button>
          {activeEntry ? (
            <span className="muted">
              Running entry #{activeEntry.id} · {formatDuration(runningSeconds)}
            </span>
          ) : (
            <span className="muted">No active timer</span>
          )}
        </div>
      </div>
      <div className="panel">
        <BoxTitle title={editingEntryId ? "Edit time entry" : "Add time entry"} />
        {entryError && <p className="form-error">{entryError}</p>}
        <div className="row">
          <select
            value={entryForm.project_id}
            onChange={(e) => setEntryForm({ ...entryForm, project_id: e.target.value })}
          >
            <option value="">Project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            value={entryForm.task_id}
            onChange={(e) => setEntryForm({ ...entryForm, task_id: e.target.value })}
          >
            <option value="">Task</option>
            {tasks
              .filter((task) => !entryForm.project_id || String(task.project_id) === entryForm.project_id)
              .map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
          </select>
          <input
            type="date"
            value={toDateValue(entryForm.date)}
            onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })}
          />
          <input
            type="datetime-local"
            value={toDatetimeLocal(entryForm.start_time)}
            onChange={(e) => setEntryForm({ ...entryForm, start_time: e.target.value })}
          />
          <input
            type="datetime-local"
            value={toDatetimeLocal(entryForm.end_time)}
            onChange={(e) => setEntryForm({ ...entryForm, end_time: e.target.value })}
          />
          <input
            placeholder="Duration minutes"
            value={entryForm.duration_minutes}
            onChange={(e) => setEntryForm({ ...entryForm, duration_minutes: e.target.value })}
          />
          <input placeholder="Notes" value={entryForm.notes} onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })} />
          <label className="row">
            <input
              type="checkbox"
              checked={entryForm.billable}
              onChange={(e) => setEntryForm({ ...entryForm, billable: e.target.checked })}
            />
            <span>Billable</span>
          </label>
          <input
            placeholder="Hourly rate"
            value={entryForm.hourly_rate}
            onChange={(e) => setEntryForm({ ...entryForm, hourly_rate: e.target.value })}
          />
          {editingEntryId ? (
            <>
              <button onClick={saveEntryEdit}>Save entry</button>
              <button
                onClick={() => {
                  setEditingEntryId(null);
                  setEntryForm({
                    project_id: "",
                    task_id: "",
                    date: todayDate(),
                    start_time: "",
                    end_time: "",
                    duration_minutes: "",
                    notes: "",
                    billable: true,
                    hourly_rate: "",
                    invoiced_invoice_id: ""
                  });
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button onClick={createEntry}>Add entry</button>
          )}
        </div>
      </div>
      <div className="panel">
        <BoxTitle title="Recent entries" />
        <table>
          <thead>
            <tr>
              <th>Select</th>
              <th>Date</th>
              <th>Project</th>
              <th>Task</th>
              <th>Duration</th>
              <th>Notes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedEntries[entry.id])}
                    onChange={() => toggleEntry(entry.id)}
                  />
                </td>
                <td>{entry.date}</td>
                <td>{projects.find((p) => p.id === entry.project_id)?.name || entry.project_id}</td>
                <td>{tasks.find((t) => t.id === entry.task_id)?.name || ""}</td>
                <td>
                  {entry.id === activeEntry?.id
                    ? `${formatDuration(runningSeconds)} (running)`
                    : `${entry.duration_minutes} min`}
                </td>
                <td>{entry.notes || ""}</td>
                <td>
                  <button onClick={() => startEditEntry(entry)}>Edit</button>
                  <button onClick={() => deleteEntry(entry.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={exportTimesheets}>Export CSV</button>
      </div>
      <CollapsibleSection
        title="Weekly rollup"
        summary={weeklySummary}
        defaultOpen={false}
      >
        <div className="panel">
          <BoxTitle title="Weekly timesheet" />
          {weeklyRows.length === 0 ? (
            <p className="muted">Log time entries to generate weekly timesheets.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Week of</th>
                  <th>Entries</th>
                  <th>Total hours</th>
                  <th>Billable hours</th>
                </tr>
              </thead>
              <tbody>
                {weeklyRows.map((row) => (
                  <tr key={`week-${row.week}`}>
                    <td>{row.week}</td>
                    <td>{formatCount(row.entries.length)}</td>
                    <td>{formatHours(row.totalMinutes)}</td>
                    <td>{formatHours(row.billableMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CollapsibleSection>
      <div className="panel">
        <BoxTitle title="Invoice from time entries" />
        {timeInvoiceError && <p className="form-error">{timeInvoiceError}</p>}
        {timeInvoiceSuccess && (
          <div className="callout">
            <strong>{timeInvoiceSuccess}</strong>
            {createdInvoiceId && (
              <div>
                <a
                  href={`${API_BASE}/business/invoices/${createdInvoiceId}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open invoice PDF
                </a>
              </div>
            )}
          </div>
        )}
        <div className="row">
          <select
            value={invoiceForm.client_id}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, client_id: e.target.value })}
          >
            <option value="">Select client</option>
            {activeClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Invoice number (optional)"
            value={invoiceForm.number}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, number: e.target.value })}
          />
          <input
            type="date"
            value={toDateValue(invoiceForm.issue_date)}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, issue_date: e.target.value })}
          />
          <input
            type="date"
            value={toDateValue(invoiceForm.due_date)}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
          />
          <select
            value={invoiceForm.currency}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, currency: e.target.value })}
          >
            <option value="AUD">AUD</option>
            <option value="USD">USD</option>
          </select>
          <select
            value={invoiceForm.group_by}
            onChange={(e) => setInvoiceForm({ ...invoiceForm, group_by: e.target.value })}
          >
            <option value="day">Group by day</option>
            <option value="task">Group by task</option>
          </select>
          <button onClick={createInvoiceFromTime}>Create invoice</button>
        </div>
      </div>
    </div>
  );
}

function Imports() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    date: "",
    description: "",
    amount: "",
    currency: "",
    payee: "",
    notes: ""
  });
  const [preview, setPreview] = useState<any[]>([]);
  const [accountId, setAccountId] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("AUD");
  const [source, setSource] = useState("bank_csv");
  const [autoClassify, setAutoClassify] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [importAttempted, setImportAttempted] = useState(false);
  const [expandedBatchId, setExpandedBatchId] = useState<number | null>(null);

  useEffect(() => {
    apiGet<any[]>("/accounts").then(setAccounts).catch(() => undefined);
    apiGet<any[]>("/imports/batches").then(setBatches).catch(() => undefined);
  }, []);

  const handleFile = (selected: File | null) => {
    setFile(selected);
    setPreview([]);
    if (!selected) {
      setHeaders([]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const [head] = text.split(/\r?\n/);
      const cols = head.split(",").map((c) => c.replace(/^\"|\"$/g, "").trim());
      setHeaders(cols);
    };
    reader.readAsText(selected);
  };

  const requestPreview = async () => {
    setImportAttempted(true);
    setImportError(null);
    if (!file) {
      setImportError("Choose a CSV file first.");
      return;
    }
    if (!mapping.date || !mapping.description || !mapping.amount) {
      setImportError("Map at least date, description, and amount.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mapping_json", JSON.stringify(mapping));
    try {
      const res = await fetch(`${API_BASE}/imports/preview`, { method: "POST", body: formData });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Preview failed.");
      }
      const data = await res.json();
      setPreview(data.rows || []);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Unable to preview import.");
    }
  };

  const commitImport = async () => {
    setImportAttempted(true);
    setImportError(null);
    if (!file) {
      setImportError("Choose a CSV file first.");
      return;
    }
    if (!accountId) {
      setImportError("Select an account.");
      return;
    }
    if (!mapping.date || !mapping.description || !mapping.amount) {
      setImportError("Map at least date, description, and amount.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("account_id", accountId);
    formData.append("default_currency", defaultCurrency);
    formData.append("source", source);
    formData.append("auto_classify", autoClassify ? "true" : "false");
    formData.append("mapping_json", JSON.stringify(mapping));
    try {
      const res = await fetch(`${API_BASE}/imports/commit`, { method: "POST", body: formData });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || "Import failed.");
      }
      apiGet<any[]>("/imports/batches").then(setBatches).catch(() => undefined);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Unable to commit import.");
    }
  };

  const rollback = async (batchId: number) => {
    await apiPost(`/imports/batches/${batchId}/rollback`);
    apiGet<any[]>("/imports/batches").then(setBatches).catch(() => undefined);
  };

  const selectedAccount = accounts.find((account) => String(account.id) === accountId);
  const requiredMappings = ["date", "description", "amount"];
  const requiredMappedCount = requiredMappings.filter((field) => Boolean(mapping[field])).length;
  const previewRows = preview.slice(0, 8);
  const toggleBatchDetails = (batchId: number) => {
    setExpandedBatchId((current) => (current === batchId ? null : batchId));
  };

  return (
    <div className="page">
      <SectionHeader title="Data Hub" subtitle="CSV mapping, validation, and reconciliation." />
      <div className="panel">
        <BoxTitle title="CSV import wizard" />
        {importError && <p className="form-error">{importError}</p>}
        <CollapsibleSection
          title="Import setup"
          summary={
            file
              ? `${file.name} · ${selectedAccount?.name || "No account selected"} · ${requiredMappedCount}/3 required fields mapped`
              : "Choose a CSV file, account, and import defaults"
          }
          defaultOpen
        >
          <div className="import-summary-grid">
            <div className="card">
              <div className="table-detail-title">File + destination</div>
              <div className="row">
                <input
                  type="file"
                  accept=".csv"
                  className={importAttempted && !file ? "field-error" : ""}
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                />
                <select
                  value={accountId}
                  className={importAttempted && !accountId ? "field-error" : ""}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.currency})
                    </option>
                  ))}
                </select>
              </div>
              <div className="table-detail-copy">
                <div>
                  <strong>File:</strong> {file?.name || "No file selected"}
                </div>
                <div>
                  <strong>Account:</strong> {selectedAccount ? `${selectedAccount.name} (${selectedAccount.currency})` : "Not selected"}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="table-detail-title">Defaults</div>
              <div className="row">
                <select value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)}>
                  <option value="AUD">AUD</option>
                  <option value="USD">USD</option>
                </select>
                <input value={source} onChange={(e) => setSource(e.target.value)} />
                <label className="row">
                  <input type="checkbox" checked={autoClassify} onChange={(e) => setAutoClassify(e.target.checked)} />
                  <span>Auto-classify</span>
                </label>
              </div>
              <div className="table-detail-copy">
                <div>
                  <strong>Default currency:</strong> {defaultCurrency}
                </div>
                <div>
                  <strong>Source tag:</strong> {source}
                </div>
              </div>
            </div>
          </div>
        </CollapsibleSection>
        {headers.length > 0 && (
          <CollapsibleSection
            title="Column mapping"
            summary={`${requiredMappedCount}/3 required fields mapped · ${formatCount(headers.length)} source columns detected`}
            defaultOpen
          >
            <div className="mapping-grid">
              {Object.keys(mapping).map((field) => (
                <div className="mapping-row" key={field}>
                  <span className="mapping-label">{field}</span>
                  <select
                    value={mapping[field]}
                    className={
                      importAttempted && ["date", "description", "amount"].includes(field) && !mapping[field]
                        ? "field-error"
                        : ""
                    }
                    onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                  >
                    <option value="">Select column</option>
                    {headers.map((header) => (
                      <option key={`${field}-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="row">
              <button onClick={requestPreview}>Preview</button>
              <button onClick={commitImport}>Import</button>
            </div>
          </CollapsibleSection>
        )}
        {preview.length > 0 && (
          <CollapsibleSection
            title="Preview rows"
            summary={`Showing ${formatCount(previewRows.length)} of ${formatCount(preview.length)} preview rows`}
            defaultOpen
          >
            <div className="preview-table-wrap">
              <table>
                <thead>
                  <tr>
                    {Object.keys(preview[0] || {}).map((key) => (
                      <th key={`prev-${key}`}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => (
                    <tr key={`row-${idx}`}>
                      {Object.keys(row).map((key) => (
                        <td key={`${idx}-${key}`}>{row[key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > previewRows.length && (
              <p className="muted">Showing the first {formatCount(previewRows.length)} rows to keep review focused.</p>
            )}
          </CollapsibleSection>
        )}
        <p className="muted">Bank-linking connectors are optional and behind feature flags.</p>
      </div>
      <div className="panel">
        <BoxTitle title="Import batches" />
        {batches.length === 0 ? (
          <div className="archive-empty">No import batches yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>File</th>
                <th>Progress</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const isExpanded = expandedBatchId === batch.id;
                const progress = Number(batch.total_rows || 0) > 0
                  ? Math.round((Number(batch.imported_rows || 0) / Number(batch.total_rows || 0)) * 100)
                  : 0;
                return (
                  <Fragment key={batch.id}>
                    <tr>
                      <td>
                        <div className="table-compact-title">Batch #{batch.id}</div>
                        <div className="table-compact-meta">{batch.source || "manual import"}</div>
                      </td>
                      <td>
                        <div className="table-compact-title">{batch.file_name || "Unnamed file"}</div>
                      </td>
                      <td>
                        <div className="table-compact-title">
                          {formatCount(batch.imported_rows)}/{formatCount(batch.total_rows)}
                        </div>
                        <div className="table-compact-meta">{formatCount(progress)}% imported</div>
                      </td>
                      <td>
                        <RowDisclosureButton open={isExpanded} onClick={() => toggleBatchDetails(batch.id)} />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="table-detail-row">
                        <td colSpan={4}>
                          <div className="table-detail-grid">
                            <div className="table-detail-card">
                              <div className="table-detail-title">Batch details</div>
                              <div className="table-detail-copy">
                                <div>
                                  <strong>Source:</strong> {batch.source || "manual import"}
                                </div>
                                <div>
                                  <strong>File:</strong> {batch.file_name || "Unnamed file"}
                                </div>
                                <div>
                                  <strong>Rows imported:</strong> {formatCount(batch.imported_rows)} of {formatCount(batch.total_rows)}
                                </div>
                              </div>
                            </div>
                            <div className="table-detail-card">
                              <div className="table-detail-title">Batch action</div>
                              <div className="row">
                                <button onClick={() => rollback(batch.id)}>Rollback</button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Reports() {
  const [netWorth, setNetWorth] = useState<any | null>(null);
  const [cashflow, setCashflow] = useState<any[]>([]);
  const [categorySpend, setCategorySpend] = useState<any[]>([]);
  const [businessPnl, setBusinessPnl] = useState<any[]>([]);
  const [timesheetSummary, setTimesheetSummary] = useState<any | null>(null);
  const [forecast, setForecast] = useState<any | null>(null);
  const [expenseAnalysis, setExpenseAnalysis] = useState<any | null>(null);
  const [budgetYear, setBudgetYear] = useState(String(new Date().getFullYear()));
  const [budgetMatrix, setBudgetMatrix] = useState<any | null>(null);
  const [expandedCheckingId, setExpandedCheckingId] = useState<string | null>(null);
  const [expandedCashflowMonth, setExpandedCashflowMonth] = useState<string | null>(null);
  const [expandedBudgetMonth, setExpandedBudgetMonth] = useState<string | null>(null);
  const [expandedPnlMonth, setExpandedPnlMonth] = useState<string | null>(null);

  useEffect(() => {
    apiGet<any>("/reports/net-worth").then(setNetWorth).catch(() => undefined);
    apiGet<any[]>("/reports/cashflow").then(setCashflow).catch(() => undefined);
    apiGet<any[]>("/reports/category-spend").then(setCategorySpend).catch(() => undefined);
    apiGet<any[]>("/reports/business-pnl").then(setBusinessPnl).catch(() => undefined);
    apiGet<any>("/reports/timesheets/summary").then(setTimesheetSummary).catch(() => undefined);
    apiGet<any>("/reports/forecast").then(setForecast).catch(() => undefined);
    apiGet<any>("/reports/expense-analysis").then(setExpenseAnalysis).catch(() => undefined);
  }, []);

  useEffect(() => {
    apiGet<any>(`/reports/budget-matrix?year=${budgetYear}`)
      .then(setBudgetMatrix)
      .catch(() => undefined);
  }, [budgetYear]);

  const budgetMonths = budgetMatrix?.months || [];
  const budgetIncome: Record<string, number> = {};
  const budgetExpense: Record<string, number> = {};
  const checkingAccounts = (netWorth?.accounts || []).filter(
    (row: any) => row.included_in_cash_total ?? row.included_in_total
  );
  const personalCheckingAccounts = checkingAccounts.filter((row: any) => row.cash_role !== "business");
  const businessCheckingAccounts = checkingAccounts.filter((row: any) => row.cash_role === "business");
  const checkingAsOfLabel = formatTimestampLabel(netWorth?.personal_checking_as_of ?? netWorth?.checking_as_of);
  const businessCheckingAsOfLabel = formatTimestampLabel(netWorth?.business_checking_as_of);
  const personalCheckingTotal = netWorth?.personal_checking_total ?? netWorth?.checking_total;
  const businessCheckingTotal = netWorth?.business_checking_total ?? 0;
  const allCheckingTotal = netWorth?.all_checking_total ?? netWorth?.checking_total;
  const personalCheckingCount = netWorth?.personal_checking_account_count ?? netWorth?.checking_account_count ?? 0;
  const businessCheckingCount = netWorth?.business_checking_account_count ?? 0;
  budgetMonths.forEach((month: string) => {
    budgetIncome[month] = Number(budgetMatrix?.totals?.effective_income?.[month] || 0);
    budgetExpense[month] = Number(budgetMatrix?.totals?.effective_expense?.[month] || 0);
  });
  const reportCurrency = netWorth?.base_currency || budgetMatrix?.base_currency || forecast?.base_currency || expenseAnalysis?.base_currency || "USD";
  const toggleCheckingDetails = (accountId: string) => {
    setExpandedCheckingId((current) => (current === accountId ? null : accountId));
  };
  const toggleCashflowDetails = (month: string) => {
    setExpandedCashflowMonth((current) => (current === month ? null : month));
  };
  const toggleBudgetDetails = (month: string) => {
    setExpandedBudgetMonth((current) => (current === month ? null : month));
  };
  const togglePnlDetails = (month: string) => {
    setExpandedPnlMonth((current) => (current === month ? null : month));
  };
  const formatDateRange = (start?: string, end?: string) => {
    if (!start && !end) return "—";
    if (start && end && start !== end) return `${formatCalendarDate(start)} to ${formatCalendarDate(end)}`;
    return formatCalendarDate(start || end);
  };
  const renderCheckingAccountsTable = (rows: any[], emptyText: string) => {
    if (rows.length === 0) {
      return <p className="muted">{emptyText}</p>;
    }
    return (
      <table>
        <thead>
          <tr>
            <th>Account</th>
            <th>Balance</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any) => {
            const accountKey = String(row.account_id);
            const isExpanded = expandedCheckingId === accountKey;
            return (
              <Fragment key={row.account_id}>
                <tr>
                  <td>
                    <div className="table-compact-title">{row.account_name}</div>
                    <div className="table-compact-meta">
                      {row.currency} {row.cash_role === "business" ? "business" : "personal"} checking
                    </div>
                  </td>
                  <td>
                    <div className="table-compact-title">
                      {formatCurrency(row.display_balance_base, netWorth?.base_currency)}
                    </div>
                    <div className="table-compact-meta">
                      {formatCurrency(row.display_balance, row.currency)} native
                    </div>
                  </td>
                  <td>
                    <RowDisclosureButton open={isExpanded} onClick={() => toggleCheckingDetails(accountKey)} />
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="table-detail-row">
                    <td colSpan={3}>
                      <div className="table-detail-grid">
                        <div className="table-detail-card">
                          <div className="table-detail-title">Balance source</div>
                          <div className="table-detail-copy">
                            <div>
                              <strong>Source:</strong> {row.balance_source === "ledger" ? "Ledger fallback" : row.balance_source}
                            </div>
                            <div>
                              <strong>As of:</strong> {formatTimestampLabel(row.balance_as_of) || "—"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="page">
      <SectionHeader title="Insights" subtitle="Personal cash, business cash, cashflow, category spend, and P&L." />
      <div className="panel">
        <BoxTitle title="Personal checking cash" />
        <p className="metric">{formatCurrency(personalCheckingTotal, netWorth?.base_currency)}</p>
        <p className="muted">
          {formatCount(personalCheckingCount)} personal accounts
          {checkingAsOfLabel ? ` · As of ${checkingAsOfLabel}` : ""}
          {(netWorth?.checking_ledger_fallback_count || 0) > 0
            ? ` · ${formatCount(netWorth?.checking_ledger_fallback_count || 0)} ledger fallback`
            : ""}
        </p>
        <div className="metric-stack">
          <div className="metric-row">
            <span>Business checking</span>
            <strong>{formatCurrency(businessCheckingTotal, netWorth?.base_currency)}</strong>
          </div>
          <div className="metric-row">
            <span>All checking</span>
            <strong>{formatCurrency(allCheckingTotal, netWorth?.base_currency)}</strong>
          </div>
        </div>
        <div className="table-detail-title">Personal checking accounts</div>
        {renderCheckingAccountsTable(personalCheckingAccounts, "No personal checking accounts are linked.")}
        {(businessCheckingAccounts.length > 0 || businessCheckingCount > 0) && (
          <>
            <div className="table-detail-title">Business checking accounts</div>
            <p className="muted">
              {formatCount(businessCheckingCount)} business accounts
              {businessCheckingAsOfLabel ? ` · As of ${businessCheckingAsOfLabel}` : ""}
              {(netWorth?.business_checking_ledger_fallback_count || 0) > 0
                ? ` · ${formatCount(netWorth?.business_checking_ledger_fallback_count || 0)} ledger fallback`
                : ""}
            </p>
            {renderCheckingAccountsTable(businessCheckingAccounts, "No business checking accounts are linked.")}
          </>
        )}
      </div>
      <div className="panel">
        <BoxTitle title="Personal cashflow" />
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Net</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {cashflow.map((row) => {
              const monthKey = String(row.month);
              const isExpanded = expandedCashflowMonth === monthKey;
              return (
                <Fragment key={`${row.month}-${row.currency || reportCurrency}`}>
                  <tr>
                    <td>
                      <div className="table-compact-title">{formatMonthYearLabel(row.month)}</div>
                      <div className="table-compact-meta">{row.currency || reportCurrency}</div>
                    </td>
                    <td>{formatCurrency(row.net, row.currency)}</td>
                    <td>
                      <RowDisclosureButton open={isExpanded} onClick={() => toggleCashflowDetails(monthKey)} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="table-detail-row">
                      <td colSpan={3}>
                        <div className="table-detail-grid">
                          <div className="table-detail-card">
                            <div className="table-detail-title">Month breakdown</div>
                            <div className="table-detail-copy">
                              <div>
                                <strong>Personal inflow:</strong> {formatCurrency(row.inflow, row.currency)}
                              </div>
                              <div>
                                <strong>Personal outflow:</strong> {formatCurrency(row.outflow, row.currency)}
                              </div>
                              <div>
                                <strong>Personal net:</strong> {formatCurrency(row.net, row.currency)}
                              </div>
                              {(Number(row.business_inflow || 0) !== 0 || Number(row.business_outflow || 0) !== 0) && (
                                <>
                                  <div>
                                    <strong>Business inflow:</strong> {formatCurrency(row.business_inflow, row.currency)}
                                  </div>
                                  <div>
                                    <strong>Business outflow:</strong> {formatCurrency(row.business_outflow, row.currency)}
                                  </div>
                                  <div>
                                    <strong>Business net:</strong> {formatCurrency(row.business_net, row.currency)}
                                  </div>
                                  <div>
                                    <strong>All checking net:</strong> {formatCurrency(row.total_net, row.currency)}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <BoxTitle title="Budget vs actual" />
        <div className="row">
          <input
            type="number"
            min="2000"
            max="2100"
            value={budgetYear}
            onChange={(e) => setBudgetYear(e.target.value)}
          />
          <span className="muted">Compare planned budget to actual totals.</span>
        </div>
        {budgetMatrix ? (
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Net position</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {budgetMonths.map((month: string) => {
                const actualIncome = Number(budgetMatrix.totals?.income?.[month] || 0);
                const actualExpense = Number(budgetMatrix.totals?.expense?.[month] || 0);
                const budgetIncomeValue = Number(budgetIncome[month] || 0);
                const budgetExpenseValue = Number(budgetExpense[month] || 0);
                const budgetNet = budgetIncomeValue - budgetExpenseValue;
                const actualNet = actualIncome - actualExpense;
                const variance = budgetNet - actualNet;
                const isExpanded = expandedBudgetMonth === month;
                return (
                  <Fragment key={`bva-${month}`}>
                    <tr>
                      <td>
                        <div className="table-compact-title">{formatMonthYearLabel(month)}</div>
                        <div className="table-compact-meta">{budgetMatrix?.base_currency || reportCurrency}</div>
                      </td>
                      <td>
                        <div className="table-compact-title">
                          Variance {formatCurrency(variance, budgetMatrix?.base_currency)}
                        </div>
                        <div className="table-compact-meta">
                          Budget {formatCurrency(budgetNet, budgetMatrix?.base_currency)} · Actual{" "}
                          {formatCurrency(actualNet, budgetMatrix?.base_currency)}
                        </div>
                      </td>
                      <td>
                        <RowDisclosureButton open={isExpanded} onClick={() => toggleBudgetDetails(month)} />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="table-detail-row">
                        <td colSpan={3}>
                          <div className="table-detail-grid">
                            <div className="table-detail-card">
                              <div className="table-detail-title">Income</div>
                              <div className="table-detail-copy">
                                <div>
                                  <strong>Budget income:</strong> {formatCurrency(budgetIncomeValue, budgetMatrix?.base_currency)}
                                </div>
                                <div>
                                  <strong>Actual income:</strong> {formatCurrency(actualIncome, budgetMatrix?.base_currency)}
                                </div>
                              </div>
                            </div>
                            <div className="table-detail-card">
                              <div className="table-detail-title">Expenses</div>
                              <div className="table-detail-copy">
                                <div>
                                  <strong>Budget expense:</strong> {formatCurrency(budgetExpenseValue, budgetMatrix?.base_currency)}
                                </div>
                                <div>
                                  <strong>Actual expense:</strong> {formatCurrency(actualExpense, budgetMatrix?.base_currency)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">No budget data yet for {budgetYear}.</p>
        )}
      </div>
      <div className="panel">
        <BoxTitle title="Cashflow forecast" />
        {forecast && (
          <>
            <p className="muted">
              Avg inflow: {formatCurrency(forecast.avg_inflow, forecast.base_currency)} · Avg outflow:{" "}
              {formatCurrency(forecast.avg_outflow, forecast.base_currency)}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Inflow</th>
                  <th>Outflow</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {(forecast.forecast || []).map((row: any) => (
                  <tr key={`${row.month}-${row.currency || reportCurrency}`}>
                    <td>{row.month}</td>
                    <td>{formatCurrency(row.inflow, row.currency)}</td>
                    <td>{formatCurrency(row.outflow, row.currency)}</td>
                    <td>{formatCurrency(row.net, row.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      <div className="panel">
        <BoxTitle title="Category spend" />
        <p className="muted">Personal spend totals show the supporting transaction date range for each category.</p>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Dates</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {categorySpend.map((row) => (
              <tr key={row.category}>
                <td>
                  <div className="table-compact-title">{row.category}</div>
                  <div className="table-compact-meta">{formatCount(row.transaction_count || 0)} transactions</div>
                </td>
                <td>{formatDateRange(row.start_date, row.end_date)}</td>
                <td>{formatCurrency(row.total, row.currency || reportCurrency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <BoxTitle title="Expense analysis" />
        {expenseAnalysis && (
          <>
            <p className="muted">
              Average monthly spend: {formatCurrency(expenseAnalysis.avg_spend, expenseAnalysis.base_currency)}
            </p>
            <div className="grid">
              <div className="card">
                <h4>Top categories</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(expenseAnalysis.categories || []).map((row: any) => (
                      <tr key={row.category}>
                        <td>{row.category}</td>
                        <td>{formatCurrency(row.spend, row.currency || expenseAnalysis.base_currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card">
                <h4>Top merchants</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Merchant</th>
                      <th>Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(expenseAnalysis.merchants || []).map((row: any) => (
                      <tr key={row.merchant}>
                        <td>{row.merchant}</td>
                        <td>{formatCurrency(row.spend, row.currency || expenseAnalysis.base_currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="panel">
        <BoxTitle title="Business P&L" />
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Net</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {businessPnl.map((row) => {
              const monthKey = String(row.month);
              const isExpanded = expandedPnlMonth === monthKey;
              return (
                <Fragment key={row.month}>
                  <tr>
                    <td>
                      <div className="table-compact-title">{formatMonthYearLabel(row.month)}</div>
                      <div className="table-compact-meta">{row.currency || reportCurrency}</div>
                    </td>
                    <td>{formatCurrency(row.net, row.currency || reportCurrency)}</td>
                    <td>
                      <RowDisclosureButton open={isExpanded} onClick={() => togglePnlDetails(monthKey)} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="table-detail-row">
                      <td colSpan={3}>
                        <div className="table-detail-grid">
                          <div className="table-detail-card">
                            <div className="table-detail-title">P&amp;L breakdown</div>
                            <div className="table-detail-copy">
                              <div>
                                <strong>Income:</strong> {formatCurrency(row.income, row.currency || reportCurrency)}
                              </div>
                              <div>
                                <strong>Expenses:</strong> {formatCurrency(row.expenses, row.currency || reportCurrency)}
                              </div>
                              <div>
                                <strong>Net:</strong> {formatCurrency(row.net, row.currency || reportCurrency)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <BoxTitle title="Timesheets summary" />
        {timesheetSummary && (
          <>
            <p>Total hours: {timesheetSummary.total_hours || 0}</p>
            <p>Billable hours: {timesheetSummary.billable_hours || 0}</p>
            <p>Non-billable hours: {timesheetSummary.non_billable_hours || 0}</p>
            <p>Effective hourly rate: {formatAmount(timesheetSummary.effective_hourly_rate)}</p>
          </>
        )}
      </div>
    </div>
  );
}

function FXOptimizer() {
  const [form, setForm] = useState({
    aud_cash: "2000",
    usd_cash: "500",
    aud_debt: "5000",
    usd_debt: "3000",
    aud_debt_apr: "0.06",
    usd_debt_apr: "0.08",
    risk_profile: "neutral"
  });
  const [result, setResult] = useState<any | null>(null);
  const [settings, setSettings] = useState({
    target_account_id: "",
    provider: "manual",
    risk_profile: "neutral"
  });
  const [rates, setRates] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  useEffect(() => {
    apiGet<any>("/fx/settings")
      .then((data) =>
        setSettings({
          target_account_id: data.target_account_id ? String(data.target_account_id) : "",
          provider: data.provider || "manual",
          risk_profile: data.risk_profile || "neutral"
        })
      )
      .catch(() => undefined);
    apiGet<any[]>("/fx/rates").then((data) => setRates(data.slice(-10))).catch(() => undefined);
    apiGet<any[]>("/fx/recommendations").then(setRecommendations).catch(() => undefined);
  }, []);

  const ingest = async () => {
    await apiPost("/fx/rates/ingest");
    apiGet<any[]>("/fx/rates").then((data) => setRates(data.slice(-10))).catch(() => undefined);
  };

  const run = async () => {
    const data = await apiPost("/fx/recommendations", {
      ...form,
      aud_cash: Number(form.aud_cash),
      usd_cash: Number(form.usd_cash),
      aud_debt: Number(form.aud_debt),
      usd_debt: Number(form.usd_debt),
      aud_debt_apr: Number(form.aud_debt_apr),
      usd_debt_apr: Number(form.usd_debt_apr)
    });
    setResult(data);
    apiGet<any[]>("/fx/recommendations").then(setRecommendations).catch(() => undefined);
  };

  const saveSettings = async () => {
    await apiPost("/fx/settings", {
      target_account_id: settings.target_account_id ? Number(settings.target_account_id) : null,
      provider: settings.provider,
      risk_profile: settings.risk_profile
    });
  };

  return (
    <div className="page">
      <SectionHeader title="FX Command" subtitle="AUD/USD timing tied to debt paydown." />
      <div className="panel">
        <BoxTitle title="FX controls" />
        <div className="row">
          <button onClick={ingest}>Ingest RBA rates</button>
          <button onClick={run}>Generate recommendation</button>
          <button onClick={saveSettings}>Save FX settings</button>
        </div>
        <div className="row">
          <input
            placeholder="Target debt account ID"
            value={settings.target_account_id}
            onChange={(e) => setSettings({ ...settings, target_account_id: e.target.value })}
          />
          <select value={settings.provider} onChange={(e) => setSettings({ ...settings, provider: e.target.value })}>
            <option value="manual">Manual</option>
            <option value="api_stub">API key (stub)</option>
          </select>
          <select
            value={settings.risk_profile}
            onChange={(e) => setSettings({ ...settings, risk_profile: e.target.value })}
          >
            <option value="conservative">Conservative</option>
            <option value="neutral">Neutral</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>
        <div className="row">
          <input value={form.aud_cash} onChange={(e) => setForm({ ...form, aud_cash: e.target.value })} />
          <input value={form.usd_cash} onChange={(e) => setForm({ ...form, usd_cash: e.target.value })} />
          <input value={form.aud_debt} onChange={(e) => setForm({ ...form, aud_debt: e.target.value })} />
          <input value={form.usd_debt} onChange={(e) => setForm({ ...form, usd_debt: e.target.value })} />
          <select value={form.risk_profile} onChange={(e) => setForm({ ...form, risk_profile: e.target.value })}>
            <option value="conservative">Conservative</option>
            <option value="neutral">Neutral</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>
        {result && (
          <div className="result">
            <p>Convert AUD now: {formatAmount(result.alloc_aud_to_usd)}</p>
            <p>Repay USD: {formatAmount(result.repay_usd)}</p>
            <p>Repay AUD: {formatAmount(result.repay_aud)}</p>
          </div>
        )}
      </div>
      <div className="callout">Informational only. No financial advice.</div>
      <div className="panel">
        <BoxTitle title="Recent FX rates" />
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>AUD per USD</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => (
              <tr key={rate.id || rate.date}>
                <td>{rate.date}</td>
                <td>{formatAmount(rate.aud_per_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <BoxTitle title="Recommendations" />
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Risk</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {recommendations.map((rec) => (
              <tr key={rec.id}>
                <td>{rec.created_at}</td>
                <td>{rec.risk_profile}</td>
                <td>{rec.note || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Settings({ onLogoChange }: { onLogoChange?: (logoPath: string) => void }) {
  const [lockEnabled, setLockEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryForm, setCategoryForm] = useState({ name: "", personal_allowed: true, business_allowed: true, tax_code: "" });
  const [dbPath, setDbPath] = useState("");
  const [backups, setBackups] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<any[]>([]);
  const [plaidStatus, setPlaidStatus] = useState<any | null>(null);
  const [plaidItems, setPlaidItems] = useState<any[]>([]);
  const [plaidAccounts, setPlaidAccounts] = useState<any[]>([]);
  const [plaidError, setPlaidError] = useState<string | null>(null);
  const [plaidSync, setPlaidSync] = useState<any | null>(null);
  const [plaidBusy, setPlaidBusy] = useState(false);
  const [plaidLinkBusy, setPlaidLinkBusy] = useState(false);
  const [upStatus, setUpStatus] = useState<any | null>(null);
  const [upAccounts, setUpAccounts] = useState<any[]>([]);
  const [upError, setUpError] = useState<string | null>(null);
  const [upSync, setUpSync] = useState<any | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [llmSettings, setLlmSettings] = useState<LlmSettings>(() => normalizeLlmSettings());
  const [companyProfile, setCompanyProfile] = useState({
    company_name: "",
    company_legal_name: "",
    company_dba: "",
    company_entity_type: "Sole Proprietor",
    company_tax_id: "",
    company_email: "",
    company_phone: "",
    company_address: "",
    company_city_state: "",
    company_logo_path: ""
  });
  const [emailSettings, setEmailSettings] = useState({
    smtp_host: "smtp.gmail.com",
    smtp_port: "587",
    smtp_username: "",
    smtp_password: "",
    smtp_from_name: "",
    smtp_from_email: "",
    smtp_use_tls: true,
    smtp_use_ssl: false
  });
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [budgetSkipMerchants, setBudgetSkipMerchants] = useState("");
  const [emailTestStatus, setEmailTestStatus] = useState<string | null>(null);
  const [emailTestError, setEmailTestError] = useState<string | null>(null);
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);
  const [logoPickError, setLogoPickError] = useState<string | null>(null);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [merchantForm, setMerchantForm] = useState({
    name: "",
    currency: "",
    default_category_id: "",
    default_classification: "Personal",
    notes: ""
  });
  const [merchantEditingId, setMerchantEditingId] = useState<number | null>(null);
  const [merchantEditForm, setMerchantEditForm] = useState({
    name: "",
    currency: "",
    default_category_id: "",
    default_classification: "Personal",
    notes: ""
  });
  const [merchantApplyExisting, setMerchantApplyExisting] = useState(false);
  const [merchantStatus, setMerchantStatus] = useState<string | null>(null);
  const [merchantError, setMerchantError] = useState<string | null>(null);
  const [merchantPage, setMerchantPage] = useState(1);
  const [merchantPageSize, setMerchantPageSize] = useState(25);
  const [rules, setRules] = useState<any[]>([]);
  const [ruleForm, setRuleForm] = useState({
    name: "",
    field: "description",
    operator: "contains",
    value: "",
    category_id: "",
    is_active: true
  });
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [knowledgeForm, setKnowledgeForm] = useState({
    title: "",
    content: "",
    tags: "",
    is_active: true
  });
  const refreshPlaid = () => {
    apiGet<any>("/plaid/status")
      .then(setPlaidStatus)
      .catch(() => setPlaidStatus({ configured: false, items: 0 }));
    apiGet<any[]>("/plaid/items").then(setPlaidItems).catch(() => setPlaidItems([]));
    apiGet<any[]>("/plaid/accounts").then(setPlaidAccounts).catch(() => setPlaidAccounts([]));
  };

  const refreshUp = () => {
    apiGet<any>("/up/status")
      .then(setUpStatus)
      .catch(() => setUpStatus({ configured: false, accounts: 0 }));
    apiGet<any[]>("/up/accounts").then(setUpAccounts).catch(() => setUpAccounts([]));
  };

  const connectPlaid = async () => {
    setPlaidError(null);
    setPlaidLinkBusy(true);
    try {
      await loadPlaidScript();
      const tokenResponse = await apiPost<any>("/plaid/link-token");
      savePendingPlaidLinkSession({ token: tokenResponse.link_token, mode: "connect" });
      const handler = window.Plaid.create({
        token: tokenResponse.link_token,
        onSuccess: async (publicToken: string, metadata: any) => {
          try {
            await apiPost("/plaid/exchange", { public_token: publicToken, metadata });
            clearPendingPlaidLinkSession();
            notifyPlaidRefresh();
            refreshPlaid();
          } catch (err) {
            setPlaidError(err instanceof Error ? err.message : "Unable to exchange Plaid token.");
          } finally {
            setPlaidLinkBusy(false);
          }
        },
        onExit: (err: any) => {
          if (err) {
            setPlaidError(formatPlaidLinkExitError(err));
          } else {
            clearPendingPlaidLinkSession();
          }
          setPlaidLinkBusy(false);
        }
      });
      handler.open();
    } catch (err) {
      setPlaidError(err instanceof Error ? err.message : "Unable to start Plaid Link.");
      setPlaidLinkBusy(false);
    }
  };

  const updatePlaidItem = async (itemId: string) => {
    setPlaidError(null);
    setPlaidLinkBusy(true);
    try {
      await loadPlaidScript();
      const tokenResponse = await apiPost<any>("/plaid/link-token/update", { item_id: itemId });
      savePendingPlaidLinkSession({ token: tokenResponse.link_token, mode: "update", itemId });
      const handler = window.Plaid.create({
        token: tokenResponse.link_token,
        onSuccess: async () => {
          try {
            const result = await apiPost<any>("/plaid/sync");
            clearPendingPlaidLinkSession();
            notifyPlaidRefresh();
            setPlaidSync(result);
            refreshPlaid();
          } catch (err) {
            setPlaidError(err instanceof Error ? err.message : "Unable to sync Plaid accounts after update.");
          } finally {
            setPlaidLinkBusy(false);
          }
        },
        onExit: (err: any) => {
          if (err) {
            setPlaidError(formatPlaidLinkExitError(err));
          } else {
            clearPendingPlaidLinkSession();
          }
          setPlaidLinkBusy(false);
        }
      });
      handler.open();
    } catch (err) {
      setPlaidError(err instanceof Error ? err.message : "Unable to start Plaid update mode.");
      setPlaidLinkBusy(false);
    }
  };

  const syncPlaid = async () => {
    setPlaidError(null);
    setPlaidBusy(true);
    try {
      const result = await apiPost<any>("/plaid/sync");
      setPlaidSync(result);
      refreshPlaid();
    } catch (err) {
      setPlaidError(err instanceof Error ? err.message : "Plaid sync failed.");
    } finally {
      setPlaidBusy(false);
    }
  };

  const syncUp = async () => {
    setUpError(null);
    setUpBusy(true);
    try {
      const result = await apiPost<any>("/up/sync");
      setUpSync(result);
      refreshUp();
    } catch (err) {
      setUpError(err instanceof Error ? err.message : "Up Bank sync failed.");
    } finally {
      setUpBusy(false);
    }
  };

  const plaidItemNeedsLogin = (item: any) =>
    item?.status === "login_required" ||
    (Array.isArray(plaidSync?.errors) &&
      plaidSync.errors.some(
        (error: any) => error?.item_id === item?.item_id && error?.error_code === "ITEM_LOGIN_REQUIRED"
      ));

  useEffect(() => {
    const handlePlaidRefresh = (event: StorageEvent) => {
      if (event.key === PLAID_REFRESH_EVENT_KEY) {
        refreshPlaid();
      }
    };
    window.addEventListener("storage", handlePlaidRefresh);
    return () => window.removeEventListener("storage", handlePlaidRefresh);
  }, []);

  useEffect(() => {
    apiGet<any>("/settings")
      .then((data) => {
        setLockEnabled(Boolean(data.lock_enabled));
        setLlmSettings(normalizeLlmSettings(data));
        setCompanyProfile({
          company_name: data.company_name || "",
          company_legal_name: data.company_legal_name || "",
          company_dba: data.company_dba || "",
          company_entity_type: data.company_entity_type || "Sole Proprietor",
          company_tax_id: data.company_tax_id || "",
          company_email: data.company_email || "",
          company_phone: data.company_phone || "",
          company_address: data.company_address || "",
          company_city_state: data.company_city_state || "",
          company_logo_path: data.company_logo_path || ""
        });
        setEmailSettings({
          smtp_host: data.smtp_host || "smtp.gmail.com",
          smtp_port: data.smtp_port || "587",
          smtp_username: data.smtp_username || "",
          smtp_password: data.smtp_password || "",
          smtp_from_name: data.smtp_from_name || "",
          smtp_from_email: data.smtp_from_email || "",
          smtp_use_tls: data.smtp_use_tls !== false,
          smtp_use_ssl: Boolean(data.smtp_use_ssl)
        });
        setBaseCurrency(data.base_currency || "USD");
        setBudgetSkipMerchants(data.budget_skip_merchants || "");
      })
      .catch(() => undefined);
    apiGet<any[]>("/categories").then(setCategories).catch(() => undefined);
    apiGet<any[]>("/classify/merchants").then(setMerchants).catch(() => undefined);
    apiGet<any[]>("/rules").then(setRules).catch(() => undefined);
    apiGet<any[]>("/knowledge").then(setKnowledge).catch(() => undefined);
    apiGet<any[]>("/connectors").then(setConnectors).catch(() => undefined);
    apiGet<any>("/diagnostics/status")
      .then((data) => setDbPath(data.db_path || ""))
      .catch(() => undefined);
    apiGet<any[]>("/diagnostics/backups").then(setBackups).catch(() => undefined);
    refreshPlaid();
    refreshUp();
  }, []);

  useEffect(() => {
    setLogoPreviewFailed(false);
  }, [companyProfile.company_logo_path]);

  const save = async () => {
    await apiPost("/settings", {
      lock_enabled: lockEnabled,
      password: password || undefined,
      base_currency: baseCurrency,
      local_ai_enabled: llmSettings.local_ai_enabled,
      local_ai_base_url: llmSettings.local_ai_base_url,
      local_ai_model: llmSettings.local_ai_model,
      local_ai_timeout_seconds: Number(llmSettings.local_ai_timeout_seconds) || DEFAULT_LOCAL_AI_TIMEOUT_SECONDS,
      embedding_model: llmSettings.embedding_model,
      personal_context: llmSettings.personal_context,
      company_name: companyProfile.company_name,
      company_legal_name: companyProfile.company_legal_name,
      company_dba: companyProfile.company_dba,
      company_entity_type: companyProfile.company_entity_type,
      company_tax_id: companyProfile.company_tax_id,
      company_email: companyProfile.company_email,
      company_phone: companyProfile.company_phone,
      company_address: companyProfile.company_address,
      company_city_state: companyProfile.company_city_state,
      company_logo_path: companyProfile.company_logo_path,
      smtp_host: emailSettings.smtp_host,
      smtp_port: emailSettings.smtp_port,
      smtp_username: emailSettings.smtp_username,
      smtp_password: emailSettings.smtp_password,
      smtp_from_name: emailSettings.smtp_from_name,
      smtp_from_email: emailSettings.smtp_from_email,
      smtp_use_tls: emailSettings.smtp_use_tls,
      smtp_use_ssl: emailSettings.smtp_use_ssl,
      budget_skip_merchants: budgetSkipMerchants
    });
    onLogoChange?.(companyProfile.company_logo_path);
    setPassword("");
    setStatus("Saved");
  };

  const sendEmailTest = async () => {
    setEmailTestStatus(null);
    setEmailTestError(null);
    try {
      const toEmail = emailSettings.smtp_from_email || emailSettings.smtp_username;
      await apiPost("/settings/email-test", { to_email: toEmail });
      setEmailTestStatus(`Sent test email to ${toEmail}.`);
    } catch (err) {
      setEmailTestError(err instanceof Error ? err.message : "Unable to send test email.");
    }
  };

  const pickLogo = async () => {
    setLogoPickError(null);
    try {
      if (!(window as any).__TAURI__) {
        setLogoPickError("File picker works in the desktop app only. Paste a local file path instead.");
        return;
      }
      const dialog = await import("@tauri-apps/plugin-dialog");
      const selected = await dialog.open({
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp"]
          }
        ]
      });
      if (typeof selected === "string") {
        setCompanyProfile({ ...companyProfile, company_logo_path: selected });
      }
    } catch (err) {
      setLogoPickError("Unable to open file picker. Paste a local file path instead.");
    }
  };

  const seed = async () => {
    await apiPost("/demo/seed");
    setStatus("Demo data created");
  };

  const reset = async () => {
    await apiPost("/demo/reset");
    setStatus("Demo data reset");
  };

  const createCategory = async () => {
    await apiPost("/categories", {
      name: categoryForm.name,
      personal_allowed: categoryForm.personal_allowed,
      business_allowed: categoryForm.business_allowed,
      tax_code: categoryForm.tax_code || undefined,
      is_active: true
    });
    setCategoryForm({ name: "", personal_allowed: true, business_allowed: true, tax_code: "" });
    apiGet<any[]>("/categories").then(setCategories).catch(() => undefined);
  };

  const resetMerchantForm = () => {
    setMerchantForm({ name: "", currency: "", default_category_id: "", default_classification: "Personal", notes: "" });
  };

  const resetMerchantEdit = () => {
    setMerchantEditingId(null);
    setMerchantEditForm({
      name: "",
      currency: "",
      default_category_id: "",
      default_classification: "Personal",
      notes: ""
    });
    setMerchantApplyExisting(false);
  };

  const createMerchant = async () => {
    setMerchantError(null);
    setMerchantStatus(null);
    if (!merchantForm.name.trim()) {
      setMerchantError("Merchant name is required.");
      return;
    }
    if (!merchantForm.currency.trim()) {
      setMerchantError("Currency is required.");
      return;
    }
    const payload = {
      name: merchantForm.name,
      currency: merchantForm.currency || undefined,
      default_category_id: merchantForm.default_category_id ? Number(merchantForm.default_category_id) : null,
      default_classification: merchantForm.default_classification,
      notes: merchantForm.notes || undefined
    };
    try {
      await apiPost("/classify/merchants", payload);
      setMerchantStatus("Merchant profile created.");
      resetMerchantForm();
      apiGet<any[]>("/classify/merchants").then(setMerchants).catch(() => undefined);
    } catch (err) {
      setMerchantError(err instanceof Error ? err.message : "Unable to create merchant profile.");
    }
  };

  const saveMerchantEdit = async () => {
    if (!merchantEditingId) return;
    setMerchantError(null);
    setMerchantStatus(null);
    if (!merchantEditForm.name.trim()) {
      setMerchantError("Merchant name is required.");
      return;
    }
    if (!merchantEditForm.currency.trim()) {
      setMerchantError("Currency is required.");
      return;
    }
    const payload = {
      name: merchantEditForm.name,
      currency: merchantEditForm.currency || undefined,
      default_category_id: merchantEditForm.default_category_id
        ? Number(merchantEditForm.default_category_id)
        : null,
      default_classification: merchantEditForm.default_classification,
      notes: merchantEditForm.notes || undefined
    };
    try {
      const result = await apiPost<any>(`/classify/merchants/${merchantEditingId}`, {
        ...payload,
        apply_to_transactions: merchantApplyExisting
      });
      if (Number(result?.updated || 0) > 0) {
        setMerchantStatus(`Updated ${formatCount(result.updated)} matching transactions.`);
      } else {
        setMerchantStatus("Merchant profile updated.");
      }
      resetMerchantEdit();
      apiGet<any[]>("/classify/merchants").then(setMerchants).catch(() => undefined);
    } catch (err) {
      setMerchantError(err instanceof Error ? err.message : "Unable to update merchant profile.");
    }
  };

  const startMerchantEdit = (merchant: any) => {
    if (merchantEditingId === merchant.id) {
      cancelMerchantEdit();
      return;
    }
    setMerchantEditingId(merchant.id);
    setMerchantEditForm({
      name: merchant.name || "",
      currency: merchant.currency || "",
      default_category_id: merchant.default_category_id ? String(merchant.default_category_id) : "",
      default_classification: merchant.default_classification || "Personal",
      notes: merchant.notes || ""
    });
    setMerchantApplyExisting(false);
    setMerchantError(null);
    setMerchantStatus(null);
  };

  const cancelMerchantEdit = () => {
    resetMerchantEdit();
    setMerchantError(null);
    setMerchantStatus(null);
  };

  const deleteMerchant = async (merchantId: number) => {
    const confirmed = window.confirm("Delete this merchant profile?");
    if (!confirmed) return;
    await apiDelete(`/classify/merchants/${merchantId}`);
    if (merchantEditingId === merchantId) {
      resetMerchantEdit();
    }
    setMerchantStatus("Merchant profile deleted.");
    apiGet<any[]>("/classify/merchants").then(setMerchants).catch(() => undefined);
  };

  useEffect(() => {
    setMerchantPage(1);
  }, [merchantPageSize, merchants.length]);

  const sortedMerchants = [...merchants].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
  );
  const merchantTotalPages = Math.max(1, Math.ceil(sortedMerchants.length / merchantPageSize));
  useEffect(() => {
    if (merchantPage > merchantTotalPages) {
      setMerchantPage(merchantTotalPages);
    }
  }, [merchantPage, merchantTotalPages]);
  const merchantStartIndex =
    sortedMerchants.length === 0 ? 0 : (merchantPage - 1) * merchantPageSize + 1;
  const merchantEndIndex = Math.min(merchantPage * merchantPageSize, sortedMerchants.length);
  const pagedMerchants = sortedMerchants.slice(
    (merchantPage - 1) * merchantPageSize,
    merchantPage * merchantPageSize
  );

  const createBackup = async () => {
    await apiPost("/diagnostics/backup");
    setStatus("Backup created");
    apiGet<any[]>("/diagnostics/backups").then(setBackups).catch(() => undefined);
  };

  const restoreBackup = async (backupName: string) => {
    await apiPost(`/diagnostics/restore?backup_name=${encodeURIComponent(backupName)}`);
    setStatus(`Restored ${backupName}. Restart the app to reload data.`);
  };

  const createRule = async () => {
    await apiPost("/rules", {
      name: ruleForm.name,
      field: ruleForm.field,
      operator: ruleForm.operator,
      value: ruleForm.value,
      category_id: ruleForm.category_id ? Number(ruleForm.category_id) : null,
      is_active: ruleForm.is_active
    });
    setRuleForm({ name: "", field: "description", operator: "contains", value: "", category_id: "", is_active: true });
    apiGet<any[]>("/rules").then(setRules).catch(() => undefined);
  };

  const toggleRule = async (rule: any) => {
    await apiPost(`/rules/${rule.id}`, {
      name: rule.name,
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      category_id: rule.category_id,
      payee: rule.payee,
      memo_contains: rule.memo_contains,
      is_active: !rule.is_active
    });
    apiGet<any[]>("/rules").then(setRules).catch(() => undefined);
  };

  const deleteRule = async (ruleId: number) => {
    await apiDelete(`/rules/${ruleId}`);
    apiGet<any[]>("/rules").then(setRules).catch(() => undefined);
  };

  const createKnowledge = async () => {
    await apiPost("/knowledge", {
      title: knowledgeForm.title,
      content: knowledgeForm.content,
      tags: knowledgeForm.tags || undefined,
      is_active: knowledgeForm.is_active
    });
    setKnowledgeForm({ title: "", content: "", tags: "", is_active: true });
    apiGet<any[]>("/knowledge").then(setKnowledge).catch(() => undefined);
  };

  const toggleKnowledge = async (entry: any) => {
    await apiPost(`/knowledge/${entry.id}`, {
      title: entry.title,
      content: entry.content,
      tags: entry.tags,
      is_active: !entry.is_active
    });
    apiGet<any[]>("/knowledge").then(setKnowledge).catch(() => undefined);
  };

  const deleteKnowledge = async (entryId: number) => {
    await apiDelete(`/knowledge/${entryId}`);
    apiGet<any[]>("/knowledge").then(setKnowledge).catch(() => undefined);
  };

  const customPreviewSrc = companyProfile.company_logo_path ? toLogoSrc(companyProfile.company_logo_path) : "";
  const usingDefaultLogo = !customPreviewSrc || logoPreviewFailed;
  const logoPreviewSrc = usingDefaultLogo ? defaultLogo : customPreviewSrc;
  const enabledConnectorCount = connectors.filter((connector) => connector.enabled).length;
  const configuredFeedCount = [Boolean(plaidStatus?.configured), Boolean(upStatus?.configured)].filter(Boolean).length;
  const activeRuleCount = rules.filter((rule) => rule.is_active).length;
  const activeKnowledgeCount = knowledge.filter((entry) => entry.is_active).length;
  const backupSummary = backups[0]
    ? `${formatCount(backups.length)} backups · latest ${formatFileSize(backups[0].size)}`
    : "No backups created yet";
  const bankFeedSummary = `${formatCount(configuredFeedCount)} configured feeds · ${formatCount(
    enabledConnectorCount
  )} enabled connectors`;
  const automationSummary = `${
    llmSettings.local_ai_enabled ? "Local AI on" : "Local AI off"
  } · ${formatCount(activeRuleCount)} active rules · ${formatCount(activeKnowledgeCount)} knowledge notes · ${formatCount(
    merchants.length
  )} merchants`;
  const adminSummary = `${formatCount(categories.length)} categories · lock and demo tools`;

  return (
    <div className="page">
      <SectionHeader title="Control Room" subtitle="Security, categories, data location, and backups." />
      {status && (
        <div className="callout compact-callout">
          <strong>{status}</strong>
        </div>
      )}
      <div className="panel">
        <BoxTitle title="Base currency + Budget filters" />
        <div className="row">
          <select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
            <option value="USD">USD</option>
            <option value="AUD">AUD</option>
          </select>
          <textarea
            placeholder="Skip merchants (comma or new line separated)"
            value={budgetSkipMerchants}
            onChange={(e) => setBudgetSkipMerchants(e.target.value)}
            rows={2}
          />
        </div>
        <p className="muted">
          Reports and budget actuals rebalance to this base using the latest trailing fortnight
          AUD/USD average.
        </p>
        <p className="muted">Transactions classified as Transfers or Friends & Family are excluded from budget actuals.</p>
        <div className="row">
          <button onClick={save}>Save base currency</button>
        </div>
      </div>
      <div className="panel">
        <BoxTitle title="Data location + backups" />
        <p className="muted">{dbPath || "Database not available"}</p>
        <div className="row">
          <button onClick={createBackup}>Create backup</button>
        </div>
        <p className="muted">{backupSummary}</p>
        {backups.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Backup</th>
                <th>Size</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr key={backup.name}>
                  <td>{backup.name}</td>
                  <td>{formatFileSize(backup.size)}</td>
                  <td>
                    <button onClick={() => restoreBackup(backup.name)}>Restore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="panel">
        <BoxTitle title="Company profile (invoices)" />
        <div className="row">
          <input
            placeholder="Company name"
            value={companyProfile.company_name}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_name: e.target.value })}
          />
          <input
            placeholder="Legal name"
            value={companyProfile.company_legal_name}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_legal_name: e.target.value })}
          />
          <input
            placeholder="DBA / Trade name"
            value={companyProfile.company_dba}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_dba: e.target.value })}
          />
          <input
            placeholder="Email"
            value={companyProfile.company_email}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_email: e.target.value })}
          />
          <input
            placeholder="Phone"
            value={companyProfile.company_phone}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_phone: e.target.value })}
          />
        </div>
        <div className="row">
          <input
            placeholder="Business type (e.g., Sole Proprietor)"
            value={companyProfile.company_entity_type}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_entity_type: e.target.value })}
          />
          <input
            placeholder="Tax ID (EIN or Sales Tax #)"
            value={companyProfile.company_tax_id}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_tax_id: e.target.value })}
          />
          <input
            placeholder="City/State"
            value={companyProfile.company_city_state}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_city_state: e.target.value })}
          />
        </div>
        <textarea
          placeholder="Address"
          value={companyProfile.company_address}
          onChange={(e) => setCompanyProfile({ ...companyProfile, company_address: e.target.value })}
          rows={2}
        />
        <input
          placeholder="Logo file path (PNG/JPG)"
          value={companyProfile.company_logo_path}
          onChange={(e) => setCompanyProfile({ ...companyProfile, company_logo_path: e.target.value })}
        />
        <div className="row">
          <button className="button-ghost" onClick={pickLogo}>
            Choose logo image
          </button>
          <button onClick={save}>Save company profile</button>
        </div>
        {logoPickError && <p className="form-error">{logoPickError}</p>}
        <div className="logo-preview">
          <img
            src={logoPreviewSrc}
            alt="Logo preview"
            onError={() => {
              if (customPreviewSrc) setLogoPreviewFailed(true);
            }}
          />
          <div>
            <div className="logo-preview-title">
              {usingDefaultLogo ? "Default logo preview" : "Custom logo preview"}
            </div>
            <div className="muted">
              {usingDefaultLogo
                ? "Using the bundled logo until a custom path is saved."
                : "Loaded from your local file path."}
            </div>
          </div>
        </div>
        <p className="muted">Use a local file path, e.g. /Users/you/Downloads/logo.png</p>
      </div>
      <CollapsibleSection
        title="Invoice delivery"
        summary="SMTP configuration for invoice sending and test emails."
        defaultOpen={Boolean(emailSettings.smtp_username || emailTestError || emailTestStatus)}
      >
        <div className="panel">
          <BoxTitle title="Invoice email (SMTP)" />
          {emailTestStatus && <p className="muted">{emailTestStatus}</p>}
          {emailTestError && <p className="form-error">{emailTestError}</p>}
          <div className="row">
            <input
              placeholder="SMTP host"
              value={emailSettings.smtp_host}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_host: e.target.value })}
            />
            <input
              placeholder="Port"
              value={emailSettings.smtp_port}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_port: e.target.value })}
            />
            <input
              placeholder="Username"
              value={emailSettings.smtp_username}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_username: e.target.value })}
            />
          </div>
          <div className="row">
            <input
              type="password"
              placeholder="Password (App Password)"
              value={emailSettings.smtp_password}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_password: e.target.value })}
            />
            <input
              placeholder="From name"
              value={emailSettings.smtp_from_name}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_from_name: e.target.value })}
            />
            <input
              placeholder="From email"
              value={emailSettings.smtp_from_email}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_from_email: e.target.value })}
            />
          </div>
          <div className="row">
            <label className="row">
              <input
                type="checkbox"
                checked={emailSettings.smtp_use_tls}
                onChange={(e) =>
                  setEmailSettings({
                    ...emailSettings,
                    smtp_use_tls: e.target.checked,
                    smtp_use_ssl: e.target.checked ? false : emailSettings.smtp_use_ssl
                  })
                }
              />
              <span>Use STARTTLS</span>
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={emailSettings.smtp_use_ssl}
                onChange={(e) =>
                  setEmailSettings({
                    ...emailSettings,
                    smtp_use_ssl: e.target.checked,
                    smtp_use_tls: e.target.checked ? false : emailSettings.smtp_use_tls
                  })
                }
              />
              <span>Use SSL (port 465)</span>
            </label>
            <button onClick={save}>Save email settings</button>
            <button className="button-ghost" onClick={sendEmailTest}>
              Send test email
            </button>
          </div>
          <p className="muted">For Gmail: smtp.gmail.com · port 587 · STARTTLS · App Password required.</p>
        </div>
      </CollapsibleSection>
      <CollapsibleSection
        title="Bank feeds"
        summary={bankFeedSummary}
        defaultOpen={Boolean(plaidStatus?.configured || upStatus?.configured || plaidError || upError)}
      >
        {(!plaidStatus?.configured || !upStatus?.configured) && (
          <div className="form-notice">
            Public builds do not include bank connector credentials. Add private Plaid or Up Bank env files in the
            Finances app data folder, or export the matching environment variables before launching the app.
          </div>
        )}
        <div className="panel">
          <BoxTitle title="Bank feed (Plaid)" />
          {plaidError && <p className="form-error">{plaidError}</p>}
          {plaidStatus?.env && (
            <p className="muted">
              Environment: <strong>{String(plaidStatus.env)}</strong>
            </p>
          )}
          {!plaidStatus?.configured && (
            <p className="muted">
              Plaid is not configured. Add a plaid.env file to the app data folder with PLAID_CLIENT_ID, PLAID_SECRET,
              PLAID_ENV, and PLAID_REDIRECT_URI.
            </p>
          )}
          {plaidStatus?.configured && !plaidStatus?.redirect_uri_configured && (
            <p className="form-error">
              Plaid OAuth redirect is not configured. Set PLAID_REDIRECT_URI to reconnect OAuth institutions in the
              desktop app.
            </p>
          )}
          <div className="row">
            <button onClick={connectPlaid} disabled={!plaidStatus?.configured || plaidLinkBusy} type="button">
              {plaidLinkBusy ? "Connecting…" : plaidItems.length > 0 ? "Connect new institution" : "Connect checking account"}
            </button>
            <button
              className="button-ghost"
              onClick={syncPlaid}
              disabled={!plaidStatus?.configured || plaidBusy || plaidItems.length === 0}
              type="button"
            >
              {plaidBusy ? "Syncing…" : "Sync now"}
            </button>
            {plaidSync && (
              <span className="muted">
                Synced {plaidSync.added} added · {plaidSync.modified} updated · {plaidSync.removed} removed
                {plaidSync.accounts_created ? ` · ${formatCount(plaidSync.accounts_created)} account mapped` : ""}
              </span>
            )}
          </div>
          {Array.isArray(plaidSync?.errors) && plaidSync.errors.length > 0 && (
            <div className="form-notice">
              {plaidSync.errors.map((error: any, index: number) => (
                <div key={`${error.item_id || "plaid"}-${error.endpoint || index}`}>
                  {error.institution_name || "Plaid item"} {error.endpoint || "sync"}:{" "}
                  {error.message || "Plaid returned an error."}
                  {error.request_id ? ` (${error.request_id})` : ""}
                  {error.error_code === "ITEM_LOGIN_REQUIRED" && error.item_id ? (
                    <>
                      {" "}
                      <button
                        className="button-ghost button-small"
                        onClick={() => updatePlaidItem(error.item_id)}
                        disabled={!plaidStatus?.configured || plaidLinkBusy}
                        type="button"
                      >
                        Reconnect
                      </button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {plaidItems.length > 0 && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h4>Connected items</h4>
              <table>
                <thead>
                  <tr>
                    <th>Institution</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {plaidItems.map((item) => (
                    <tr key={item.item_id}>
                      <td>{item.institution_name || item.item_id}</td>
                      <td>{item.status === "login_required" ? "login required" : item.status}</td>
                      <td>{item.updated_at || ""}</td>
                      <td>
                        {item.status === "duplicate" ? (
                          <span className="muted">Inactive duplicate</span>
                        ) : (
                          <button
                            className="button-ghost button-small"
                            onClick={() => updatePlaidItem(item.item_id)}
                            disabled={!plaidStatus?.configured || plaidLinkBusy}
                            type="button"
                          >
                            {plaidItemNeedsLogin(item) ? "Reconnect" : "Add accounts"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {plaidAccounts.length > 0 && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h4>Checking accounts</h4>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Mask</th>
                    <th>Type</th>
                    <th>Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {plaidAccounts.map((account) => (
                    <tr key={account.plaid_account_id}>
                      <td>{account.name}</td>
                      <td>{account.mask}</td>
                      <td>{account.subtype || account.type}</td>
                      <td>{account.currency || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="panel">
          <BoxTitle title="Bank feed (Up Bank)" />
          {upError && <p className="form-error">{upError}</p>}
          {!upStatus?.configured && (
            <p className="muted">Up Bank is not configured. Add an up.env file to the app data folder with UP_API_KEY.</p>
          )}
          <div className="row">
            <button onClick={syncUp} disabled={!upStatus?.configured || upBusy}>
              {upBusy ? "Syncing…" : "Sync Up Bank"}
            </button>
            {upSync && (
              <span className="muted">
                Accounts {upSync.accounts?.accounts ?? 0} · Transactions +{upSync.transactions?.added ?? 0}
              </span>
            )}
          </div>
          {upAccounts.length > 0 && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h4>Connected accounts</h4>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Currency</th>
                    <th>Last sync</th>
                  </tr>
                </thead>
                <tbody>
                  {upAccounts.map((account) => (
                    <tr key={account.up_account_id}>
                      <td>{account.name || account.up_account_id}</td>
                      <td>{account.account_type || ""}</td>
                      <td>{account.currency || ""}</td>
                      <td>{account.last_synced_at || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted">Up Bank API is AUD-only. Transactions will import into your chart of accounts.</p>
        </div>
        <div className="panel">
          <BoxTitle title="Connectors" />
          <p className="muted">Optional bank-linking connectors are disabled by default.</p>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((connector) => (
                <tr key={connector.name}>
                  <td>{connector.name}</td>
                  <td>{connector.enabled ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
      <CollapsibleSection
        title="Automation + rules"
        summary={automationSummary}
        defaultOpen={llmSettings.local_ai_enabled}
      >
        <div className="panel">
          <BoxTitle title="Local AI assistant" />
          <label className="row">
            <input
              type="checkbox"
              checked={llmSettings.local_ai_enabled}
              onChange={(e) => setLlmSettings({ ...llmSettings, local_ai_enabled: e.target.checked })}
            />
            <span>Enable local assistant commentary and categorization support</span>
          </label>
          <div className="row">
            <input
              placeholder="Local AI base URL"
              value={llmSettings.local_ai_base_url}
              onChange={(e) => setLlmSettings({ ...llmSettings, local_ai_base_url: e.target.value })}
            />
            <input
              placeholder="Local AI model"
              value={llmSettings.local_ai_model}
              onChange={(e) => setLlmSettings({ ...llmSettings, local_ai_model: e.target.value })}
            />
          </div>
          <div className="row">
            <input
              type="number"
              min={1}
              placeholder="Timeout seconds"
              value={String(llmSettings.local_ai_timeout_seconds)}
              onChange={(e) =>
                setLlmSettings({
                  ...llmSettings,
                  local_ai_timeout_seconds: Math.max(1, Number(e.target.value) || DEFAULT_LOCAL_AI_TIMEOUT_SECONDS)
                })
              }
            />
            <input
              placeholder="Retrieval backend"
              value={llmSettings.embedding_model}
              onChange={(e) => setLlmSettings({ ...llmSettings, embedding_model: e.target.value })}
            />
          </div>
          <p className="muted">
            Local AI must point to a loopback service such as Ollama or LM Studio running on this machine.
            It never becomes the source of truth for balances, budgets, debt math, or invoice totals.
          </p>
          <textarea
            placeholder="Private context for merchant aliases, category preferences, and budgeting guidance"
            value={llmSettings.personal_context}
            onChange={(e) => setLlmSettings({ ...llmSettings, personal_context: e.target.value })}
            rows={4}
          />
        </div>
        <div className="panel">
          <BoxTitle title="Classification rules" />
          <div className="row">
            <input
              placeholder="Rule name"
              value={ruleForm.name}
              onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
            />
            <select value={ruleForm.field} onChange={(e) => setRuleForm({ ...ruleForm, field: e.target.value })}>
              <option value="description">Description</option>
              <option value="payee">Payee</option>
              <option value="notes">Notes</option>
            </select>
            <select
              value={ruleForm.operator}
              onChange={(e) => setRuleForm({ ...ruleForm, operator: e.target.value })}
            >
              <option value="contains">Contains</option>
              <option value="equals">Equals</option>
              <option value="starts_with">Starts with</option>
              <option value="ends_with">Ends with</option>
            </select>
            <input
              placeholder="Match value"
              value={ruleForm.value}
              onChange={(e) => setRuleForm({ ...ruleForm, value: e.target.value })}
            />
            <select
              value={ruleForm.category_id}
              onChange={(e) => setRuleForm({ ...ruleForm, category_id: e.target.value })}
            >
              <option value="">Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <label className="row">
              <input
                type="checkbox"
                checked={ruleForm.is_active}
                onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })}
              />
              <span>Active</span>
            </label>
            <button onClick={createRule}>Add rule</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Field</th>
                <th>Op</th>
                <th>Value</th>
                <th>Category</th>
                <th>Active</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const category = categories.find((cat) => cat.id === rule.category_id);
                return (
                  <tr key={rule.id}>
                    <td>{rule.name}</td>
                    <td>{rule.field}</td>
                    <td>{rule.operator}</td>
                    <td>{rule.value}</td>
                    <td>{category ? category.name : ""}</td>
                    <td>{rule.is_active ? "Yes" : "No"}</td>
                    <td>
                      <button onClick={() => toggleRule(rule)}>{rule.is_active ? "Disable" : "Enable"}</button>
                      <button onClick={() => deleteRule(rule.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <BoxTitle title="Knowledge base (RAG)" />
          <div className="row">
            <input
              placeholder="Title"
              value={knowledgeForm.title}
              onChange={(e) => setKnowledgeForm({ ...knowledgeForm, title: e.target.value })}
            />
            <input
              placeholder="Tags"
              value={knowledgeForm.tags}
              onChange={(e) => setKnowledgeForm({ ...knowledgeForm, tags: e.target.value })}
            />
            <label className="row">
              <input
                type="checkbox"
                checked={knowledgeForm.is_active}
                onChange={(e) => setKnowledgeForm({ ...knowledgeForm, is_active: e.target.checked })}
              />
              <span>Active</span>
            </label>
            <button onClick={createKnowledge}>Add entry</button>
          </div>
          <textarea
            placeholder="Notes to guide classification and reporting"
            value={knowledgeForm.content}
            onChange={(e) => setKnowledgeForm({ ...knowledgeForm, content: e.target.value })}
            rows={3}
          />
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Tags</th>
                <th>Active</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {knowledge.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.title}</td>
                  <td>{entry.tags || ""}</td>
                  <td>{entry.is_active ? "Yes" : "No"}</td>
                  <td>
                    <button onClick={() => toggleKnowledge(entry)}>{entry.is_active ? "Disable" : "Enable"}</button>
                    <button onClick={() => deleteKnowledge(entry.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <BoxTitle title="Merchant profiles" />
        <div className="row">
          <input
            placeholder="Merchant name"
            value={merchantForm.name}
            onChange={(e) => setMerchantForm({ ...merchantForm, name: e.target.value })}
          />
          <input
            placeholder="Currency (USD)"
            value={merchantForm.currency}
            onChange={(e) => setMerchantForm({ ...merchantForm, currency: e.target.value.toUpperCase() })}
          />
          <select
            value={merchantForm.default_category_id}
            onChange={(e) => setMerchantForm({ ...merchantForm, default_category_id: e.target.value })}
          >
            <option value="">Category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <select
            value={merchantForm.default_classification}
            onChange={(e) => setMerchantForm({ ...merchantForm, default_classification: e.target.value })}
          >
            <option value="Personal">Personal</option>
            <option value="Business">Business</option>
          </select>
          <input
            placeholder="Notes"
            value={merchantForm.notes}
            onChange={(e) => setMerchantForm({ ...merchantForm, notes: e.target.value })}
          />
          <button onClick={createMerchant}>Add merchant</button>
        </div>
        {merchantError && <p className="form-error">{merchantError}</p>}
        {merchantStatus && <p className="muted">{merchantStatus}</p>}
        <div className="row">
          <span className="muted">
            Showing {formatCount(merchantStartIndex)}-{formatCount(merchantEndIndex)} of {formatCount(sortedMerchants.length)}
          </span>
          <div className="row">
            <span className="muted">Rows</span>
            <select value={merchantPageSize} onChange={(e) => setMerchantPageSize(Number(e.target.value))}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="row">
            <button
              className="button-ghost button-small"
              onClick={() => setMerchantPage((page) => Math.max(1, page - 1))}
              disabled={merchantPage <= 1}
            >
              Prev
            </button>
            <span className="muted">
              Page {formatCount(merchantPage)} of {formatCount(merchantTotalPages)}
            </span>
            <button
              className="button-ghost button-small"
              onClick={() => setMerchantPage((page) => Math.min(merchantTotalPages, page + 1))}
              disabled={merchantPage >= merchantTotalPages}
            >
              Next
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Merchant</th>
              <th>Currency</th>
              <th>Category</th>
              <th>Classification</th>
              <th>Notes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pagedMerchants.map((merchant) => (
              <React.Fragment key={`merchant-${merchant.id}`}>
                <tr>
                  <td>{merchant.name}</td>
                  <td>{merchant.currency || ""}</td>
                  <td>{categories.find((cat) => cat.id === merchant.default_category_id)?.name || ""}</td>
                  <td>{merchant.default_classification}</td>
                  <td>{merchant.notes || ""}</td>
                  <td>
                    <button className="button-ghost button-small" onClick={() => startMerchantEdit(merchant)}>
                      {merchantEditingId === merchant.id ? "Close" : "Edit"}
                    </button>
                    <button className="button-ghost button-small" onClick={() => deleteMerchant(merchant.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
                {merchantEditingId === merchant.id && (
                  <tr className="table-inline">
                    <td colSpan={6}>
                      <div className="row">
                        <input
                          placeholder="Merchant name"
                          value={merchantEditForm.name}
                          onChange={(e) => setMerchantEditForm({ ...merchantEditForm, name: e.target.value })}
                        />
                        <input
                          placeholder="Currency (USD)"
                          value={merchantEditForm.currency}
                          onChange={(e) =>
                            setMerchantEditForm({ ...merchantEditForm, currency: e.target.value.toUpperCase() })
                          }
                        />
                        <select
                          value={merchantEditForm.default_category_id}
                          onChange={(e) =>
                            setMerchantEditForm({ ...merchantEditForm, default_category_id: e.target.value })
                          }
                        >
                          <option value="">Category</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={merchantEditForm.default_classification}
                          onChange={(e) =>
                            setMerchantEditForm({ ...merchantEditForm, default_classification: e.target.value })
                          }
                        >
                          <option value="Personal">Personal</option>
                          <option value="Business">Business</option>
                        </select>
                        <input
                          placeholder="Notes"
                          value={merchantEditForm.notes}
                          onChange={(e) => setMerchantEditForm({ ...merchantEditForm, notes: e.target.value })}
                        />
                        <label className="row">
                          <input
                            type="checkbox"
                            checked={merchantApplyExisting}
                            onChange={(e) => setMerchantApplyExisting(e.target.checked)}
                          />
                          <span>Apply changes to existing transactions</span>
                        </label>
                        <button onClick={saveMerchantEdit}>Save</button>
                        <button className="button-ghost button-small" onClick={cancelMerchantEdit}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      </CollapsibleSection>
      <CollapsibleSection
        title="Admin tools"
        summary={adminSummary}
        defaultOpen={false}
      >
        <div className="panel">
          <BoxTitle title="Security & demo data" />
          <label className="row">
            <input type="checkbox" checked={lockEnabled} onChange={(e) => setLockEnabled(e.target.checked)} />
            <span>Enable app lock</span>
          </label>
          <input
            type="password"
            placeholder="Set/replace password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="row">
            <button onClick={save}>Save settings</button>
            <button onClick={seed}>Seed demo data</button>
            <button onClick={reset}>Reset demo data</button>
          </div>
        </div>
        <div className="panel">
          <BoxTitle title="Categories" />
          <div className="row">
            <input
              placeholder="Category name"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
            />
            <label className="row">
              <input
                type="checkbox"
                checked={categoryForm.personal_allowed}
                onChange={(e) => setCategoryForm({ ...categoryForm, personal_allowed: e.target.checked })}
              />
              <span>Personal</span>
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={categoryForm.business_allowed}
                onChange={(e) => setCategoryForm({ ...categoryForm, business_allowed: e.target.checked })}
              />
              <span>Business</span>
            </label>
            <input
              placeholder="Tax code"
              value={categoryForm.tax_code}
              onChange={(e) => setCategoryForm({ ...categoryForm, tax_code: e.target.value })}
            />
            <button onClick={createCategory}>Add category</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Personal</th>
                <th>Business</th>
                <th>Tax code</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td>{cat.name}</td>
                  <td>{cat.personal_allowed ? "Yes" : "No"}</td>
                  <td>{cat.business_allowed ? "Yes" : "No"}</td>
                  <td>{cat.tax_code || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    </div>
  );
}

function Diagnostics() {
  const [status, setStatus] = useState<string | null>(null);
  const [info, setInfo] = useState<any | null>(null);

  useEffect(() => {
    apiGet<any>("/diagnostics/status").then(setInfo).catch(() => undefined);
  }, []);

  const exportLogs = async () => {
    await downloadDiagnostics();
    setStatus("Diagnostics exported");
  };

  return (
    <div className="page">
      <SectionHeader title="System Health" subtitle="Export logs and check database health." />
      <div className="panel">
        <BoxTitle title="Export diagnostics" />
        <button onClick={exportLogs}>Export logs + database</button>
        {status && <p className="muted">{status}</p>}
      </div>
      {info && (
        <div className="panel">
          <BoxTitle title="Database" />
          <p className="muted">{info.db_path}</p>
          <table>
            <thead>
              <tr>
                <th>Table</th>
                <th>Rows</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(info.counts || {}).map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{value as any}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;

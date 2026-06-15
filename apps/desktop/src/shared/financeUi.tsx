import React, { useEffect, useState } from "react";
import { apiGet, apiPost, apiUrl } from "./api/client";

const amountFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currencyFormatters: Record<string, Intl.NumberFormat> = {};
export const DEFAULT_LOCAL_AI_BASE_URL = "http://127.0.0.1:11434/v1";
export const DEFAULT_LOCAL_AI_MODEL = "qwen2.5:7b-instruct";
export const DEFAULT_EMBEDDING_MODEL = "fts5-local";
export const DEFAULT_LOCAL_AI_TIMEOUT_SECONDS = 30;
export const PLAID_LINK_SCRIPT_SRC = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
export const PLAID_LINK_SCRIPT_TIMEOUT_MS = 15000;
export const PLAID_OAUTH_REDIRECT_PATH = "/plaid-oauth";
export const PLAID_OAUTH_PENDING_KEY = "finances.plaid.oauthPending";
export const PLAID_REFRESH_EVENT_KEY = "finances.plaid.updatedAt";
export const MATRIX_BREAKDOWN_COLORS = ["#264653", "#e9c46a", "#f4a261", "#a8dadc", "#6d597a", "#90be6d", "#b56576", "#457b9d"];

export type PlaidLinkMode = "connect" | "update";

export type PendingPlaidLinkSession = {
  token: string;
  mode: PlaidLinkMode;
  itemId?: string;
};

export type LlmSettings = {
  local_ai_enabled: boolean;
  local_ai_base_url: string;
  local_ai_model: string;
  local_ai_timeout_seconds: number;
  embedding_model: string;
  personal_context: string;
};

export function normalizeLlmSettings(data?: any): LlmSettings {
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

export function toNumber(value: any): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function formatAmount(value: any): string {
  const num = toNumber(value);
  if (num === null) return "—";
  return amountFormatter.format(num);
}

export function formatCurrency(value: any, currency?: string): string {
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

export function formatSignedCurrency(value: any, currency?: string): string {
  const num = toNumber(value);
  if (num === null) return "—";
  if (Math.abs(num) < 0.005) return formatCurrency(0, currency);
  const prefix = num < 0 ? "-" : "+";
  return `${prefix}${formatCurrency(Math.abs(num), currency)}`;
}

export function formatCount(value: any): string {
  const num = toNumber(value);
  if (num === null) return "0";
  return integerFormatter.format(num);
}

export function isClosedReceivableStatus(status: any): boolean {
  return ["paid", "void"].includes(String(status || "").toLowerCase());
}

export function formatDuration(seconds: number): string {
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

export function formatFileSize(bytes: any): string {
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

export function formatMonthLabel(value?: string): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  if (Number.isNaN(dt.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(dt);
}

export function formatMonthYearLabel(value?: string): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  if (Number.isNaN(dt.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(dt);
}

export function formatTimestampLabel(value?: string): string {
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

export function formatRemainingSummary(value: any, currency?: string): string {
  const num = toNumber(value);
  if (num === null) return "—";
  if (Math.abs(num) < 0.005) return "On track";
  const formatted = formatCurrency(Math.abs(num), currency);
  return num > 0 ? `${formatted} left` : `${formatted} over`;
}

export function formatCompactCurrency(value: any, currency?: string): string {
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

export function renderMatrixMoney(value: any, currency?: string) {
  return (
    <span title={formatCurrency(value, currency)}>
      {formatCompactCurrency(value, currency)}
    </span>
  );
}

export function buildConicGradient(segments: Array<{ value: number; color: string }>, fallback = "rgba(226, 232, 240, 0.9)") {
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

export function formatHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0.0";
  return (minutes / 60).toFixed(1);
}

export function toDateValue(value?: string): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function todayDate(): string {
  const dt = new Date();
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function currentMonthLabel(): string {
  return todayDate().slice(0, 7);
}

export function monthStateLabel(value?: string, referenceMonth?: string): "past" | "current" | "future" {
  const month = value || "";
  const current = referenceMonth || currentMonthLabel();
  if (month < current) return "past";
  if (month > current) return "future";
  return "current";
}

export function toDatetimeLocal(value?: string): string {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function weekStartLabel(value?: string): string {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value.slice(0, 10);
  const day = dt.getDay();
  const diff = (day + 6) % 7;
  dt.setDate(dt.getDate() - diff);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function toLogoSrc(path?: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("file://")) return path;
  if (path.startsWith("/")) return `file://${encodeURI(path)}`;
  return path;
}

export function isPlaidOAuthRedirectLocation(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname === PLAID_OAUTH_REDIRECT_PATH && window.location.search.includes("oauth_state_id=");
}

export function formatPlaidLinkExitError(err: any, fallback = "Plaid Link exited."): string {
  if (!err) return fallback;
  const message = err.display_message || err.error_message || fallback;
  const code = err.error_code ? ` (${err.error_code})` : "";
  return `${message}${code}`;
}

export function savePendingPlaidLinkSession(session: PendingPlaidLinkSession) {
  window.localStorage.setItem(PLAID_OAUTH_PENDING_KEY, JSON.stringify(session));
}

export function readPendingPlaidLinkSession(): PendingPlaidLinkSession | null {
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

export function clearPendingPlaidLinkSession() {
  window.localStorage.removeItem(PLAID_OAUTH_PENDING_KEY);
}

export function notifyPlaidRefresh() {
  window.localStorage.setItem(PLAID_REFRESH_EVENT_KEY, String(Date.now()));
}

export const loadPlaidScript = () =>
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

export function PlaidOAuthRedirectHandler() {
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

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}

export function WorkspaceShell({
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

export function CollapsibleSection({
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

export function RowDisclosureButton({
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

export function WorkspaceInsightCard({
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

export function MoneyWorkspaceOverview({
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

export function BusinessWorkspaceOverview({
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

export function ControlWorkspaceOverview({
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

export function BoxTitle({ title, variant = "panel" }: { title: string; variant?: "panel" | "card" }) {
  const help = BOX_HELP[title] || "Details for this section.";
  const className = variant === "card" ? "card-help" : "panel-help";
  return (
    <>
      <h3>{title}</h3>
      <p className={className}>{help}</p>
    </>
  );
}

export type InvoicePreviewProfile = {
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

export type InvoicePreviewLineItem = {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  isPlaceholder?: boolean;
};

export const EMPTY_INVOICE_PREVIEW_PROFILE: InvoicePreviewProfile = {
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

export function formatCalendarDate(value?: string): string {
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

export function buildInvoicePreviewCompanyLines(profile: InvoicePreviewProfile): string[] {
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

export function buildInvoicePreviewClientLines(client: any): string[] {
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

export function titleCaseStatus(value?: string): string {
  const raw = String(value || "draft").replace(/[-_]+/g, " ").trim();
  if (!raw) return "Draft";
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildInvoicePreviewFacts(issueDate?: string, dueDate?: string, total?: number, currency?: string) {
  return [
    { label: "Issue", value: formatCalendarDate(issueDate) },
    { label: "Due", value: dueDate ? formatCalendarDate(dueDate) : "On receipt" },
    { label: "Total due", value: formatCurrency(total ?? 0, currency) },
  ];
}

export function InvoiceSheetPreview({
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

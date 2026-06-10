import React, { useEffect, useState } from "react";
import { API_BASE, apiGet } from "../shared/api/client";
import defaultLogo from "../assets/logo.png";
import { PAGE_FOCUS_COPY, defaultWorkspaceView, navBuckets, pages, renderFeaturePage } from "./featureRegistry";
import {
  BusinessWorkspaceOverview,
  ControlWorkspaceOverview,
  MoneyWorkspaceOverview,
  PlaidOAuthRedirectHandler,
  PlanningWorkspaceOverview,
  WorkspaceShell,
  isPlaidOAuthRedirectLocation,
  toLogoSrc
} from "../shared/financeUi";

export default function AppShell() {
  if (isPlaidOAuthRedirectLocation()) {
    return <PlaidOAuthRedirectHandler />;
  }

  const [activeWorkspace, setActiveWorkspace] = useState("home");
  const [workspaceView, setWorkspaceView] = useState<Record<string, string>>(defaultWorkspaceView);
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

  const renderPage = (pageId: string) =>
    renderFeaturePage(pageId, {
      accountFocus,
      companyLogoSrc: logoSrc,
      onConsumeAccountFocus: () => setAccountFocus(""),
      onInvoiceCreated: () => navigateToPage("business"),
      onLogoChange: setCompanyLogoPath,
      onOpenRegister: openAccountRegister,
      onOpenReport: openAccountReport,
      usingCustomLogo
    });

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

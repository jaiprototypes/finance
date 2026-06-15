import type { ReactNode } from "react";
import { Accounts } from "../features/accounts/AccountsPage";
import { Budgets } from "../features/budgets/BudgetsPage";
import { Business } from "../features/business/BusinessPage";
import { Dashboard } from "../features/dashboard/DashboardPage";
import { Debts } from "../features/debts/DebtsPage";
import { Diagnostics } from "../features/diagnostics/DiagnosticsPage";
import { FXOptimizer } from "../features/fx/FXOptimizerPage";
import { Imports } from "../features/imports/ImportsPage";
import { Reports } from "../features/reports/ReportsPage";
import { Settings } from "../features/settings/SettingsPage";
import { Timesheets } from "../features/timesheets/TimesheetsPage";
import { Transactions } from "../features/transactions/TransactionsPage";
import { PlanningWorkspaceOverview } from "../features/planning/components/PlanningWorkspaceOverview";
import {
  BusinessWorkspaceOverview,
  ControlWorkspaceOverview,
  MoneyWorkspaceOverview
} from "../shared/financeUi";

export type PageDefinition = { id: string; label: string; meta: string };
export type NavBucket = { id: string; label: string; summary: string; pages: string[]; defaultPage: string };

type WorkspaceDefinition = NavBucket & { defaultPage: string };

export type FeatureRenderContext = {
  accountFocus: string;
  companyLogoSrc: string;
  onConsumeAccountFocus: () => void;
  onInvoiceCreated: () => void;
  onLogoChange: (path: string) => void;
  onOpenRegister: (accountId: number) => void;
  onOpenReport: () => void;
  usingCustomLogo: boolean;
};

type FrontendFeatureManifest = PageDefinition & {
  focusCopy: string;
  render: (context: FeatureRenderContext) => ReactNode;
  workspace: string;
};

const workspaces: WorkspaceDefinition[] = [
  {
    id: "home",
    label: "Home",
    summary: "Daily view",
    pages: [],
    defaultPage: "dashboard"
  },
  {
    id: "money",
    label: "Money",
    summary: "Accounts, transactions, imports, reports",
    pages: [],
    defaultPage: "transactions"
  },
  {
    id: "planning",
    label: "Planning",
    summary: "Budgets, debts, FX",
    pages: [],
    defaultPage: "budgets"
  },
  {
    id: "business",
    label: "Business",
    summary: "Clients, invoices, time",
    pages: [],
    defaultPage: "business"
  },
  {
    id: "control",
    label: "Control",
    summary: "Settings, diagnostics",
    pages: [],
    defaultPage: "settings"
  }
];

export const featureManifests: FrontendFeatureManifest[] = [
  {
    id: "dashboard",
    label: "Overview",
    meta: "Today",
    workspace: "home",
    focusCopy: "Start from the daily picture, then move into the workspace that needs attention.",
    render: () => <Dashboard />
  },
  {
    id: "accounts",
    label: "Accounts",
    meta: "Ledger",
    workspace: "money",
    focusCopy: "Keep the account structure clean so balances, reports, and imports all land in the right place.",
    render: (context) => (
      <Accounts onOpenRegister={context.onOpenRegister} onOpenReport={context.onOpenReport} />
    )
  },
  {
    id: "transactions",
    label: "Transactions",
    meta: "Inbox",
    workspace: "money",
    focusCopy: "Clear the review queue, attach evidence, and keep the register audit-ready.",
    render: (context) => (
      <Transactions
        accountFocus={context.accountFocus}
        onConsumeAccountFocus={context.onConsumeAccountFocus}
      />
    )
  },
  {
    id: "budgets",
    label: "Budgets",
    meta: "Plan",
    workspace: "planning",
    focusCopy: "Work the plan at the month level first, then drill into variance and category pressure.",
    render: () => <Budgets />
  },
  {
    id: "debts",
    label: "Debts",
    meta: "Payoff",
    workspace: "planning",
    focusCopy: "Maintain debt balances and payment links before trusting any payoff scenario.",
    render: () => <Debts />
  },
  {
    id: "business",
    label: "Clients + Invoices",
    meta: "Business",
    workspace: "business",
    focusCopy: "Run clients, invoices, receipts, and archived documents from one business ledger.",
    render: (context) => (
      <Business companyLogoSrc={context.companyLogoSrc} usingCustomLogo={context.usingCustomLogo} />
    )
  },
  {
    id: "timesheets",
    label: "Projects + Time",
    meta: "Hours",
    workspace: "business",
    focusCopy: "Capture hours cleanly so project costing and invoice creation stay reliable.",
    render: (context) => <Timesheets onInvoiceCreated={context.onInvoiceCreated} />
  },
  {
    id: "imports",
    label: "Imports",
    meta: "CSV",
    workspace: "money",
    focusCopy: "Map and preview statement files before new activity hits the ledger.",
    render: () => <Imports />
  },
  {
    id: "reports",
    label: "Reports",
    meta: "Insights",
    workspace: "money",
    focusCopy: "Read liquidity, cashflow, and variance without leaving the money workspace.",
    render: () => <Reports />
  },
  {
    id: "fx",
    label: "FX",
    meta: "AUD/USD",
    workspace: "planning",
    focusCopy: "Use FX guidance as planning input only. It never changes accounting truth.",
    render: () => <FXOptimizer />
  },
  {
    id: "settings",
    label: "Settings",
    meta: "Profile",
    workspace: "control",
    focusCopy: "Set the local profile, connectors, and AI guardrails without adding cloud dependencies.",
    render: (context) => <Settings onLogoChange={context.onLogoChange} />
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    meta: "System",
    workspace: "control",
    focusCopy: "Check local system health, data location, and export support files when needed.",
    render: () => <Diagnostics />
  }
];

export const pages: PageDefinition[] = featureManifests.map(({ id, label, meta }) => ({ id, label, meta }));
export const navBuckets: NavBucket[] = workspaces.map((workspace) => ({
  id: workspace.id,
  label: workspace.label,
  summary: workspace.summary,
  defaultPage: workspace.defaultPage,
  pages: featureManifests.filter((feature) => feature.workspace === workspace.id).map((feature) => feature.id)
}));
export const defaultWorkspaceView = Object.fromEntries(
  workspaces.map((workspace) => [workspace.id, workspace.defaultPage])
) as Record<string, string>;
export const PAGE_FOCUS_COPY = Object.fromEntries(
  featureManifests.map((feature) => [feature.id, feature.focusCopy])
) as Record<string, string>;

const featureById = new Map(featureManifests.map((feature) => [feature.id, feature]));

export function renderFeaturePage(pageId: string, context: FeatureRenderContext): ReactNode {
  const feature = featureById.get(pageId) || featureManifests[0];
  return feature.render(context);
}

export function renderWorkspaceOverview(
  workspaceId: string,
  activePageId: string,
  onSelect: (pageId: string) => void
): ReactNode {
  if (workspaceId === "money") {
    return <MoneyWorkspaceOverview activePageId={activePageId} onSelect={onSelect} />;
  }
  if (workspaceId === "planning") {
    return <PlanningWorkspaceOverview activePageId={activePageId} onSelect={onSelect} />;
  }
  if (workspaceId === "business") {
    return <BusinessWorkspaceOverview activePageId={activePageId} onSelect={onSelect} />;
  }
  if (workspaceId === "control") {
    return <ControlWorkspaceOverview activePageId={activePageId} onSelect={onSelect} />;
  }
  return null;
}

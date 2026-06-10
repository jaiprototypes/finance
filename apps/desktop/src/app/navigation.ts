export type PageDefinition = { id: string; label: string; meta: string };
export type NavBucket = { id: string; label: string; summary: string; pages: string[] };

export const pages: PageDefinition[] = [
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

export const navBuckets: NavBucket[] = [
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

export const PAGE_FOCUS_COPY: Record<string, string> = {
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

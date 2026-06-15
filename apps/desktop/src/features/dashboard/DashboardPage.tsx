import React, { Fragment, useEffect, useRef, useState } from "react";
import { getFeatureData, featureUrl } from "./api";
import {
  BoxTitle,
  CollapsibleSection,
  DEFAULT_LOCAL_AI_BASE_URL,
  DEFAULT_LOCAL_AI_MODEL,
  DEFAULT_LOCAL_AI_TIMEOUT_SECONDS,
  EMPTY_INVOICE_PREVIEW_PROFILE,
  InvoiceSheetPreview,
  MATRIX_BREAKDOWN_COLORS,
  PLAID_REFRESH_EVENT_KEY,
  RowDisclosureButton,
  SectionHeader,
  WorkspaceInsightCard,
  buildConicGradient,
  clearPendingPlaidLinkSession,
  currentMonthLabel,
  formatAmount,
  formatCompactCurrency,
  formatCount,
  formatCurrency,
  formatDuration,
  formatFileSize,
  formatHours,
  formatMonthLabel,
  formatMonthYearLabel,
  formatPlaidLinkExitError,
  formatRemainingSummary,
  formatSignedCurrency,
  formatTimestampLabel,
  isClosedReceivableStatus,
  loadPlaidScript,
  monthStateLabel,
  normalizeLlmSettings,
  notifyPlaidRefresh,
  renderMatrixMoney,
  savePendingPlaidLinkSession,
  toDateValue,
  toDatetimeLocal,
  toLogoSrc,
  todayDate,
  weekStartLabel
} from "../../shared/financeUi";
import type { InvoicePreviewProfile, LlmSettings } from "../../shared/financeUi";

export function Dashboard() {
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
      getFeatureData<any>("/reports/net-worth"),
      getFeatureData<any[]>("/accounts"),
      getFeatureData<any[]>("/reports/cashflow"),
      getFeatureData<any>(`/reports/budget-matrix?year=${currentYear}`),
      getFeatureData<any[]>("/business/invoices"),
      getFeatureData<any[]>("/debts/profiles"),
      getFeatureData<any[]>("/timesheets/entries")
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
                    <a href={featureUrl(`/business/invoices/${invoice.id}/pdf`)} target="_blank" rel="noreferrer">
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

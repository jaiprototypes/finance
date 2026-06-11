import React, { Fragment, useEffect, useRef, useState } from "react";
import { getFeatureData } from "../api";
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
} from "../../../shared/financeUi";
import type { InvoicePreviewProfile, LlmSettings } from "../../../shared/financeUi";

export function useReportsWorkspace() {
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
    getFeatureData<any>("/reports/net-worth").then(setNetWorth).catch(() => undefined);
    getFeatureData<any[]>("/reports/cashflow").then(setCashflow).catch(() => undefined);
    getFeatureData<any[]>("/reports/category-spend").then(setCategorySpend).catch(() => undefined);
    getFeatureData<any[]>("/reports/business-pnl").then(setBusinessPnl).catch(() => undefined);
    getFeatureData<any>("/reports/timesheets/summary").then(setTimesheetSummary).catch(() => undefined);
    getFeatureData<any>("/reports/forecast").then(setForecast).catch(() => undefined);
    getFeatureData<any>("/reports/expense-analysis").then(setExpenseAnalysis).catch(() => undefined);
  }, []);

  useEffect(() => {
    getFeatureData<any>(`/reports/budget-matrix?year=${budgetYear}`)
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

  const viewModel = {
    Fragment,
    BoxTitle,
    RowDisclosureButton,
    SectionHeader,
    formatAmount,
    formatCount,
    formatCurrency,
    formatMonthYearLabel,
    netWorth,
    cashflow,
    categorySpend,
    businessPnl,
    timesheetSummary,
    forecast,
    expenseAnalysis,
    budgetYear,
    setBudgetYear,
    budgetMatrix,
    budgetExpense,
    budgetIncome,
    expandedCashflowMonth,
    expandedBudgetMonth,
    expandedPnlMonth,
    budgetMonths,
    personalCheckingAccounts,
    businessCheckingAccounts,
    checkingAsOfLabel,
    businessCheckingAsOfLabel,
    personalCheckingTotal,
    businessCheckingTotal,
    allCheckingTotal,
    personalCheckingCount,
    businessCheckingCount,
    reportCurrency,
    toggleCashflowDetails,
    toggleBudgetDetails,
    togglePnlDetails,
    formatDateRange,
    renderCheckingAccountsTable
  };

  return viewModel;
}

import React, { Fragment, useEffect, useRef, useState } from "react";
import { API_BASE, apiDelete, apiGet, apiGetBlob, apiPost, apiPostForm, apiUrl, downloadDiagnostics, saveBlob } from "./api";
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

export function Reports() {
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

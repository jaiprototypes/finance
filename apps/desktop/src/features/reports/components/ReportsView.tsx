export function ReportsView({ model }: { model: any }) {
  const {
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
  } = model;

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

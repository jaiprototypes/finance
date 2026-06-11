export function BudgetActualReportSection({ model }: { model: any }) {
  const {
    BoxTitle,
    Fragment,
    RowDisclosureButton,
    budgetExpense,
    budgetIncome,
    budgetMatrix,
    budgetMonths,
    budgetYear,
    expandedBudgetMonth,
    formatCurrency,
    formatMonthYearLabel,
    reportCurrency,
    setBudgetYear,
    toggleBudgetDetails
  } = model;

  return (
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
  );
}

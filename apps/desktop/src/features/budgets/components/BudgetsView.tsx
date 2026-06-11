export function BudgetsView({ model }: { model: any }) {
  const {
    Fragment,
    BoxTitle,
    SectionHeader,
    formatCompactCurrency,
    formatCurrency,
    formatMonthLabel,
    formatMonthYearLabel,
    renderMatrixMoney,
    months,
    matrixYear,
    setMatrixYear,
    budgetMatrix,
    matrixError,
    matrixBusy,
    matrixBaseCurrency,
    setMatrixBaseCurrency,
    matrixBaseCurrencyStatus,
    setMatrixBaseCurrencyStatus,
    matrixDrilldown,
    setMatrixDrilldown,
    matrixDrilldownAssignments,
    setMatrixDrilldownAssignments,
    matrixDrilldownBusySplitId,
    updateMatrixCell,
    currentBudgetMonth,
    isMonthEditable,
    getCellInputValue,
    getEffectiveCellAmount,
    getMatrixCategoryForRow,
    hasSubcategoryRows,
    isMatrixRowExpanded,
    toggleMatrixRowExpanded,
    startAddingMatrixSubcategory,
    openMatrixDrilldown,
    applyMatrixDrilldownSubcategory,
    saveMatrixRow,
    saveMatrixAll,
    autofillMatrixFromActuals,
    incomeRows,
    expenseRows,
    matrixColSpan,
    budgetCurrency,
    plannedClosingBalance,
    invalidMonths,
    saveBlocked,
    incomeSummary,
    expenseSummary,
    balanceSummary,
    liveCashflowSummary,
    plannedIncomeExpansion,
    remainingActualIncome,
    currentMonthOverrun,
    currentMonthRemaining,
    currentMonthExpenseBreakdown,
    currentMonthChartGradient,
    matrixDrilldownSubcategories,
    renderSubcategoryRows,
    renderInlineSubcategoryEditor,
    saveMatrixBaseCurrency,
    refreshBudgetTransactions
  } = model;

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

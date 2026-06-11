export function BudgetMatrixTableSection({ model }: { model: any }) {
  const {
    Fragment,
    balanceSummary,
    budgetCurrency,
    budgetMatrix,
    expenseRows,
    expenseSummary,
    formatCompactCurrency,
    formatCurrency,
    formatMonthLabel,
    getCellInputValue,
    getEffectiveCellAmount,
    getMatrixCategoryForRow,
    hasSubcategoryRows,
    incomeRows,
    incomeSummary,
    invalidMonths,
    isMatrixRowExpanded,
    isMonthEditable,
    liveCashflowSummary,
    matrixBusy,
    matrixColSpan,
    matrixMonths,
    openMatrixDrilldown,
    renderInlineSubcategoryEditor,
    renderMatrixMoney,
    renderSubcategoryRows,
    saveMatrixRow,
    startAddingMatrixSubcategory,
    toggleMatrixRowExpanded,
    updateMatrixCell
  } = model;

  return (
    <>
      {invalidMonths.length > 0 && (
        <p className="form-error">
          {invalidMonths.map((row: any) => `${formatMonthLabel(row.month)} ${formatCurrency(row.plannedClosingBalance, budgetCurrency)}`).join(" · ")}
        </p>
      )}
      {budgetMatrix ? (
        <div className="matrix-scroll">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Bucket</th>
                {matrixMonths.map((month: string) => (
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
                {liveCashflowSummary.byMonth.map(({ month, actual }: any) => (
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
                {balanceSummary.byMonth.map(({ month, actual }: any) => (
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
                {incomeSummary.byMonth.map(({ month, planned }: any) => (
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
                {expenseSummary.byMonth.map(({ month, planned }: any) => (
                  <td key={`expense-summary-top-${month}`} className="matrix-cell">
                    {renderMatrixMoney(planned, budgetCurrency)}
                  </td>
                ))}
                <td className="matrix-total-cell">{renderMatrixMoney(expenseSummary.plannedTotal, budgetCurrency)}</td>
                <td className="matrix-total-cell">{renderMatrixMoney(expenseSummary.actualTotal, budgetCurrency)}</td>
                <td className="matrix-total-cell">{renderMatrixMoney(expenseSummary.variance, budgetCurrency)}</td>
                <td className="matrix-action-cell">—</td>
              </tr>
              <BudgetMatrixBucketRows
                model={model}
                rows={incomeRows}
                rowType="income"
                sectionTitle="Operating income"
              />
              <BudgetMatrixBucketRows
                model={model}
                rows={expenseRows}
                rowType="expense"
                sectionTitle="Operating expense"
              />
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Loading matrix...</p>
      )}
    </>
  );
}

function BudgetMatrixBucketRows({
  model,
  rows,
  rowType,
  sectionTitle
}: {
  model: any;
  rows: any[];
  rowType: "income" | "expense";
  sectionTitle: string;
}) {
  const {
    Fragment,
    budgetCurrency,
    formatCompactCurrency,
    getCellInputValue,
    getEffectiveCellAmount,
    getMatrixCategoryForRow,
    hasSubcategoryRows,
    isMatrixRowExpanded,
    isMonthEditable,
    matrixBusy,
    matrixColSpan,
    matrixMonths,
    openMatrixDrilldown,
    renderInlineSubcategoryEditor,
    renderMatrixMoney,
    renderSubcategoryRows,
    saveMatrixRow,
    startAddingMatrixSubcategory,
    toggleMatrixRowExpanded,
    updateMatrixCell
  } = model;

  if (rows.length === 0) {
    return null;
  }

  return (
    <>
      <tr className="matrix-section-row">
        <td colSpan={matrixColSpan}>
          <strong>{sectionTitle}</strong>
        </td>
      </tr>
      {rows.map((row: any) => {
        const actualField = rowType === "income" ? "income" : "expense";
        const budgetTotal = matrixMonths.reduce(
          (sum: number, month: string) => sum + getEffectiveCellAmount(row, month),
          0
        );
        const actualTotal = matrixMonths.reduce(
          (sum: number, month: string) => sum + Number(row[actualField]?.[month] || 0),
          0
        );
        const variance = budgetTotal - actualTotal;
        return (
          <Fragment key={`${rowType}-${row.id}`}>
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
              {matrixMonths.map((month: string) => {
                const actual = Number(row[actualField]?.[month] || 0);
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
    </>
  );
}

/** Distinguish saving allocations from purchases, refunds and family transfers. */
function transactionFlowLabel(txn: any, bucket: string): string {
  const negative = Number(txn.effect_on_actual || 0) < 0;
  if (txn.is_savings_transfer || txn.cash_neutral) return negative ? "Withdrawn from savings" : "Saved";
  if (bucket === "friends_family") return negative ? "Received" : "Sent";
  return negative ? "Credit/refund" : "Expense/income";
}

export function BudgetMatrixDrilldownSection({ model }: { model: any }) {
  const {
    applyMatrixDrilldownSubcategory,
    budgetCurrency,
    formatCurrency,
    formatMonthYearLabel,
    matrixBusy,
    matrixDrilldown,
    matrixDrilldownAssignments,
    matrixDrilldownBusySplitId,
    matrixDrilldownSubcategories,
    setMatrixDrilldown,
    setMatrixDrilldownAssignments
  } = model;

  if (!matrixDrilldown) {
    return null;
  }

  return (
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
          <p className="muted">Loading transactions...</p>
        ) : matrixDrilldown.error ? (
          <p className="form-error">{matrixDrilldown.error}</p>
        ) : (matrixDrilldown.transactions || []).length === 0 ? (
          <p className="muted">No synced transactions contributed to this actual value.</p>
        ) : (
          <div className="matrix-drilldown-list">
            {(matrixDrilldown.transactions || []).map((txn: any) => (
              <div key={`drilldown-${txn.entry_id || txn.split_id || txn.transaction_id}`} className="matrix-drilldown-item">
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
                  {" · "}{transactionFlowLabel(txn, matrixDrilldown.budget_bucket)}
                </div>
                {Number(txn.native_cashback || 0) > 0 && (
                  <div className="muted">
                    Purchase {formatCurrency(txn.native_gross_amount, txn.native_currency)}
                    {" · Cashback "}{formatCurrency(txn.native_cashback, txn.native_currency)}
                  </div>
                )}
                {!matrixDrilldown.read_only && !txn.read_only && matrixDrilldownSubcategories.length > 0 && txn.split_id && (
                  <div className="matrix-drilldown-subcategory-row">
                    <select
                      value={
                        matrixDrilldownAssignments[String(txn.split_id)] ??
                        (txn.subcategory_id ? String(txn.subcategory_id) : "")
                      }
                      onChange={(event) =>
                        setMatrixDrilldownAssignments((prev: Record<string, string>) => ({
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
  );
}

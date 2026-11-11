import { BudgetCashAccounts, formatCashSnapshot } from "../BudgetCashAccounts";

/** Present reconciled cash, remaining plans and optional spending details. */
export function BudgetCurrentMonthChartSection({ model }: { model: any }) {
  const {
    budgetCurrency,
    currentBudgetMonth,
    summaryMonth,
    summaryChartGradient,
    cashSummary: cash,
    cashFlow,
    periodExpenseBreakdown,
    formatCompactCurrency,
    formatCurrency,
    formatMonthYearLabel,
    matrixMonths
  } = model;

  if (!cash) return null;
  const historical = summaryMonth < currentBudgetMonth;
  const amount = (value: number | null) => value == null ? "—" : formatCurrency(value, budgetCurrency);
  const firstSnapshot = formatCashSnapshot(cash.asOf);
  const lastSnapshot = formatCashSnapshot(cash.latestAsOf);
  const snapshotLabel = firstSnapshot === lastSnapshot ? firstSnapshot : `${firstSnapshot} – ${lastSnapshot}`;
  const cashLeft = historical ? cash.closing : cash.projectedClosing;
  const hasProjection = cash.projectedClosing !== null && (Math.abs(cash.planChange || 0) >= 0.005 || cash.reservedSavings > 0);

  return (
    <div className="matrix-chart-card">
      <div
        className="matrix-chart-visual"
        style={{ backgroundImage: summaryChartGradient }}
        aria-label={`Cash and categorized spending through ${formatMonthYearLabel(summaryMonth)}`}
      >
        <div className="matrix-chart-center">
          <span className="matrix-chart-caption">{formatMonthYearLabel(summaryMonth)}</span>
          <strong>{cashLeft == null ? "—" : Math.abs(cashLeft) < 1000
            ? formatCurrency(cashLeft, budgetCurrency) : formatCompactCurrency(cashLeft, budgetCurrency)}</strong>
          <span className="matrix-chart-caption">{cashLeft == null ? "Cash unavailable" : historical ? "Recorded cash" : "Cash after plans"}</span>
        </div>
      </div>
      <div className="matrix-chart-copy">
        <strong>{historical ? "Historical cash reconstruction" : "Cash left after plans"}</strong>
        <p className="muted">
          {formatMonthYearLabel(matrixMonths[0])} through {formatMonthYearLabel(summaryMonth)}.
          {" "}Includes borrowing and all activity in these personal cash accounts, regardless of budget category.
        </p>
        <div className="matrix-chart-legend">
          <div className="matrix-chart-legend-item">
            <span className="matrix-chart-swatch matrix-chart-swatch-total" />
            <span>Opening cash (reconstructed)</span>
            <strong>{amount(cash.opening)}</strong>
          </div>
          <div className="matrix-chart-legend-item">
            <span className="matrix-chart-swatch matrix-chart-swatch-actual" />
            <span>Money received</span>
            <strong>{amount(cash.received)}</strong>
          </div>
          <div className="matrix-chart-legend-item">
            <span className="matrix-chart-swatch matrix-chart-swatch-used" />
            <span>Paid or reserved</span>
            <strong>{amount(cash.paid)}</strong>
          </div>
          {Math.abs(cash.transferAdjustment || 0) >= 0.005 && (
            <div className="matrix-chart-legend-item">
              <span className="matrix-chart-swatch matrix-chart-swatch-planned" />
              <span>Transfer timing and currency difference</span>
              <strong>{amount(cash.transferAdjustment)}</strong>
            </div>
          )}
          <div className="matrix-chart-legend-item">
            <span className="matrix-chart-swatch matrix-chart-swatch-actual" />
            <span>Available cash</span>
            <strong>{amount(cash.closing)}</strong>
          </div>
          {cash.reservedSavings > 0 && <div className="matrix-chart-legend-item">
            <span className="matrix-chart-swatch matrix-chart-swatch-planned" />
            <span>Planned Savings protected from spending</span>
            <strong>{amount(cash.reservedSavings)}</strong>
          </div>}
          {hasProjection && (
            <div className="matrix-chart-legend-item">
              <span className="matrix-chart-swatch matrix-chart-swatch-planned" />
              <span>Estimated cash after remaining plans</span>
              <strong>{amount(cash.projectedClosing)}</strong>
            </div>
          )}
        </div>
        {cash.pending !== 0 && (
          <p className="muted">
            {amount(Math.abs(cash.pending))} in pending {cash.pending < 0 ? "reservations" : "receipts"} is already included in cash.
          </p>
        )}
        {cash.opening == null && (
          <p className="muted">Opening cash is unavailable where linked account history does not cover the start of this period.</p>
        )}
        {hasProjection && <p className="muted">Plans add only amounts not already recorded or reserved. Planned Savings reduce spendable cash without changing your combined bank balance.</p>}
        {Math.abs(cash.transferAdjustment || 0) >= 0.005 && <p className="muted">
          Transfers between these accounts are excluded from money received and paid. Differences in bank posting dates or currencies appear separately above.
        </p>}
        <p className="muted">
          {historical ? "Reconstructed using bank snapshots: " : "Bank snapshots: "}{snapshotLabel}.
        </p>
        <BudgetCashAccounts accounts={cashFlow?.accounts || []} formatCurrency={formatCurrency} />
        <details className="budget-cash-details">
          <summary>Spending by budget category</summary>
          {periodExpenseBreakdown.length > 0 ? (
            <div className="matrix-chart-breakdown-list">
              {periodExpenseBreakdown.map((row: any) => (
                <div key={`breakdown-${row.id}`} className="matrix-chart-breakdown-item">
                  <span className="matrix-chart-swatch" style={{ background: row.color }} />
                  <span>{row.name}</span>
                  <span className="muted">{Math.round(row.share * 100)}%</span>
                  <strong>{formatCurrency(row.actual, budgetCurrency)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No spending recorded in the selected period.</p>
          )}
        </details>
      </div>
    </div>
  );
}

export function BudgetCurrentMonthChartSection({ model }: { model: any }) {
  const {
    budgetCurrency,
    currentBudgetMonth,
    currentMonthChartGradient,
    currentMonthExpenseBreakdown,
    currentMonthOverrun,
    currentMonthRemaining,
    formatCompactCurrency,
    formatCurrency,
    formatMonthYearLabel,
    matrixMonths,
    plannedIncomeExpansion,
    remainingActualIncome
  } = model;

  if (!matrixMonths.includes(currentBudgetMonth)) {
    return null;
  }

  return (
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
  );
}

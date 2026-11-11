type BudgetTotalsChartProps = {
  readonly values: readonly number[];
  readonly currency: string;
  readonly formatCurrency: (value: number, currency: string) => string;
};

/** Keep refunds, zero months and positive amounts on one signed trend scale. */
class BudgetTrendScale {
  private readonly lower: number;
  private readonly span: number;

  constructor(values: readonly number[]) {
    this.lower = Math.min(0, ...values);
    this.span = Math.max(0, ...values) - this.lower || 1;
  }

  /** SVG coordinates run downward, so larger amounts sit nearer the top. */
  y(value: number): number {
    return 38 - (value - this.lower) / this.span * 32;
  }
}

/** Show the visible monthly trend and mean, including months with zero activity. */
export function BudgetTotalsChart({ values, currency, formatCurrency }: BudgetTotalsChartProps) {
  if (!values.length || !values.every(Number.isFinite)) {
    return <div className="budget-totals-chart">Monthly average unavailable</div>;
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const scale = new BudgetTrendScale(values);
  const points = values.map((value, index) => ({
    x: values.length === 1 ? 85 : 6 + index / (values.length - 1) * 158,
    y: scale.y(value)
  }));
  const label = formatCurrency(average, currency);
  const description = `Monthly average ${label} across ${values.length} visible months. Recorded amounts for past months; plans or recorded amounts for open months. In month order: ${values.map(value => formatCurrency(value, currency)).join(", ")}. Dashed line marks the average.`;
  return (
    <div className="budget-totals-chart" role="img" aria-label={description} title={description}>
      <svg viewBox="0 0 170 44" aria-hidden="true" focusable="false">
        <path className="budget-totals-chart__average" d={`M6 ${scale.y(average)}H164`} />
        <polyline className="budget-totals-chart__line" points={points.map(point => `${point.x},${point.y}`).join(" ")} />
        {points.map((point, index) => <circle key={index} className="budget-totals-chart__point" cx={point.x} cy={point.y} r="2.5" />)}
      </svg>
      <span aria-hidden="true"><strong>{label}</strong> / month</span>
    </div>
  );
}

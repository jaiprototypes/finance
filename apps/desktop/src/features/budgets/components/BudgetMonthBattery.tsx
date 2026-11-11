type BudgetMonthBatteryProps = {
  readonly balance: number | null;
  readonly scale: number;
  readonly amountLabel: string;
  readonly description: string;
  readonly projected: boolean;
};

/** Show cash left without turning unavailable history into a zero balance. */
export function BudgetMonthBattery({
  balance,
  scale,
  amountLabel,
  description,
  projected
}: BudgetMonthBatteryProps) {
  const known = balance !== null && Number.isFinite(balance);
  const visibleBalance = known && Math.abs(balance) >= 0.005 ? balance : 0;
  const positiveCash = Math.max(visibleBalance, 0);
  const capacity = Math.max(Number.isFinite(scale) ? scale : 0, positiveCash);
  const percentage = capacity > 0 ? positiveCash / capacity * 100 : 0;
  const state = !known ? "unavailable" : visibleBalance < 0 ? "deficit" : percentage > 0 ? "available" : "empty";
  const label = !known ? "No data" : projected ? "Est. cash" : "Cash left";

  return (
    <div
      className={`budget-month-battery budget-month-battery--${state}`}
      role={known ? "meter" : "img"}
      aria-label={description}
      aria-valuemin={known ? 0 : undefined}
      aria-valuemax={known ? 100 : undefined}
      aria-valuenow={known ? percentage : undefined}
      aria-valuetext={known ? `${label}: ${amountLabel}` : undefined}
      title={description}
    >
      <span className="budget-month-battery__estimate">{label}</span>
      <span className="budget-month-battery__amount">
        <span>{amountLabel}</span>
      </span>
      <span className="budget-month-battery__case" aria-hidden="true">
        <span className="budget-month-battery__fill" style={{ width: `${percentage}%` }} />
      </span>
    </div>
  );
}

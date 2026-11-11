import type { BudgetTargetPace as TargetPace } from "../domain/BudgetTargetPace";

/** Show how this category participates in the shared cash forecast, without allocating cash twice. */
export function BudgetTargetPace({ rowId, plan, currency, formatCurrency, formatMonth }: {
  rowId: string; plan: TargetPace; currency: string;
  formatCurrency: (value: number, currency: string) => string; formatMonth: (month: string) => string;
}) {
  const costs = plan.costs.filter(cost => cost.rowId === rowId && cost.marked);
  if (!costs.length) return null;
  return <details className="budget-target-pace">
    <summary>{costs.length} future cost{costs.length === 1 ? "" : "s"}</summary>
    {costs.map(cost => <span key={cost.month}>{formatMonth(cost.month)}: {formatCurrency(cost.amount, currency)}</span>)}
    <span>{plan.unknown ? "Cash forecast incomplete"
      : plan.gap > 0 ? "Plan needs an adjustment — see forecast above" : "Covered by forecast cash"}</span>
  </details>;
}

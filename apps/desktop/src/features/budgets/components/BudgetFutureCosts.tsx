import type { BudgetTargetPace } from "../domain/BudgetTargetPace";

/** Make each deadline visible as the cash available, cost due and resulting gap. */
export function BudgetFutureCosts({ plan, invalid, loading, currency, formatCurrency, formatMonth }: {
  plan: BudgetTargetPace; invalid: boolean; loading?: boolean; currency: string;
  formatCurrency: (value: number, currency: string) => string; formatMonth: (month: string) => string;
}) {
  if (!plan.costs.length && plan.gap === 0 && !invalid && !plan.unknown && !loading) return null;
  const money = (value: number) => formatCurrency(value, currency);
  const incomplete = invalid || loading || plan.unknown;
  const dataIncomplete = invalid || loading || plan.checkpoints.some(point => point.cash === null);
  const needsIncomeDates = plan.checkpoints.some(point => point.timingUnknown);
  const dateLabel = (date: string) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
  const finite = Number.isFinite(plan.weekly) && Number.isFinite(plan.monthly);
  const firstGap = plan.checkpoints.find(point => (point.gap || 0) > 0);
  const title = invalid ? "Check your plan amounts" : loading ? "Updating your forecast…"
    : needsIncomeDates ? "Set income dates to check bills before payday"
    : plan.unknown ? "Cannot assess yet — cash data is missing"
    : plan.gap > 0 ? "Not achievable with the current plan" : "Your future costs fit the plan";
  return <aside className="budget-future-costs" aria-label="Future cost planning">
    <strong role="status">{title}</strong>
    {!incomplete && plan.gap > 0 && <>
      <p>Cash first falls short in {formatMonth(firstGap!.month)}. The largest gap is <strong>{money(plan.gap)}</strong>.</p>
      {finite ? <div className="budget-plan-adjustment">
        <span>To close the gap from tomorrow</span>
        <strong>{money(plan.weekly)} / week</strong><span>or</span><strong>{money(plan.monthly)} / month</strong>
        <span>less spending or extra income</span>
      </div> : <p>No saving days remain before a deadline. Change the amount, payment timing or available income.</p>}
    </>}
    {!incomplete && plan.gap === 0 && <p>Your forecast cash covers these costs. No additional saving adjustment is needed.</p>}
    <p className="muted">Uses spendable cash after planned Savings, plus any payment and income dates you set. Undated cells keep their monthly forecast.</p>
    {plan.costs.length > 0 && <div className="budget-coverage-scroll"><table className="budget-coverage-table">
      <caption>Future costs within your monthly cash forecast</caption>
      <thead><tr><th>Month</th><th>Costs still to pay</th><th>Cash left after all plans</th></tr></thead>
      <tbody>{plan.checkpoints.filter(point => point.label === "month-end" && point.costs > 0).map(point => <tr key={point.month}>
        <th scope="row">{formatMonth(point.month)}<span>{plan.costs.filter(cost => cost.month === point.month).map(cost => cost.name).join(", ")}</span></th>
        <td>{money(point.costs)}</td>
        <td>{dataIncomplete || point.cash === null ? "—" : point.gap! > 0
          ? <strong className="budget-coverage-short">Short {money(point.gap!)}</strong>
          : `${money(point.cash)} left`}</td>
      </tr>)}</tbody>
    </table></div>}
    {plan.checkpoints.some(point => point.label === "due-date") && <div className="budget-coverage-scroll">
      <table className="budget-coverage-table"><caption>Payment dates you set</caption>
        <thead><tr><th>Due date</th><th>Payments due</th><th>Cash after payment</th></tr></thead>
        <tbody>{plan.checkpoints.filter(point => point.label === "due-date").map(point => <tr key={point.deadline}>
          <th scope="row">{dateLabel(point.deadline)}</th><td>{money(point.costs)}</td>
          <td>{dataIncomplete || point.cash === null ? "—" : point.timingUnknown ? "Set expected income date"
            : point.gap! > 0 ? <strong className="budget-coverage-short">Short {money(point.gap!)}</strong> : `${money(point.cash)} left`}</td>
        </tr>)}</tbody>
      </table>
      <p className="muted">Undated expenses are reserved before dated bills. Undated income counts at month end.
        Set its expected date if it arrives sooner. Same-day receipts and payments are combined; bank processing order can differ.</p>
    </div>}
    <details><summary>Month-end balances and calculation</summary>
      <div className="budget-coverage-scroll"><table className="budget-coverage-table">
        <thead><tr><th>Month</th><th>Cash left after all plans</th></tr></thead>
        <tbody>{plan.checkpoints.filter(point => point.label === "month-end").map(point => <tr key={point.month}>
          <th scope="row">{formatMonth(point.month)}</th><td>{dataIncomplete || point.cash === null ? "—" : money(point.cash)}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="muted">Cash is shared across categories. The adjustment covers every deadline without adding overlapping gaps.
        Changing a draft updates the forecast; use Save all cells to keep it.
        Weekly and monthly rates are alternatives, with partial periods prorated and today excluded.
        Without dates, monthly cash cannot establish payment timing within a month.
        Planned Savings are reserved from spending, not counted as an external expense. Blank cells add no assumed income or expenses. Add your fixed costs for a useful forecast.</p>
    </details>
  </aside>;
}

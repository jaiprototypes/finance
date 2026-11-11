import { formatCurrency } from "../../../shared/financeUi";

type SuggestionBasis = "future-plan" | "history" | "recorded-commitments";

type SpendingSuggestionProps = {
  amount: number;
  historicalAverage: number;
  basis: SuggestionBasis;
  bucketName: string;
  monthLabel: string;
  currency: string;
  onAccept: () => void;
  disabled?: boolean;
};

export type MonthSuggestionPlan = {
  enabled: boolean;
  income: number;
  committed: number;
  available: number;
  availableLeft: number;
  overcommitted: number;
  cashLimited?: boolean;
  cashKnown?: boolean;
  historyMonths: string[];
  suggestions: Record<string, { amount: number; historicalAverage: number; basis: SuggestionBasis }>;
};

/** Offer a monthly target without entering or saving it until the user chooses it. */
export function BudgetSpendingSuggestion({ amount, historicalAverage, basis, bucketName, monthLabel,
  currency, onAccept, disabled = false }: SpendingSuggestionProps) {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const money = formatCurrency(amount, currency);
  const history = Number.isFinite(historicalAverage) ? formatCurrency(historicalAverage, currency) : "—";
  const description = basis === "future-plan"
    ? "Maximum suggested monthly total after income, existing expenses and cash needed for later targets. Safe headroom is shared between blank categories using recent spending proportions, or equally when history is unavailable. Accepting a plan recalculates the remaining allowances."
    : basis === "recorded-commitments"
    ? "Covers recorded spending and pending reservations."
    : `Based on recent completed months averaging ${history}, adjusted to fit planned income and cash needed for later costs.`;
  const label = `Use suggested total ${money} for ${bucketName} in ${monthLabel}`;
  return (
    <button type="button" className="budget-spending-suggestion" onClick={onAccept} disabled={disabled}
      aria-label={label} title={`${label}. ${description} This is a total monthly plan, not additional spending.`}>
      <span className="budget-spending-suggestion__caption">{basis === "future-plan" ? "Fits future plan" : basis === "history" ? "Based on past spending" : "Recorded costs"}</span>
      <strong>{basis === "future-plan" ? "Up to " : "Use "}{money}</strong>
      <span className="budget-spending-suggestion__basis">{basis === "future-plan" ? "monthly total" : basis === "history" ? "monthly estimate" : "paid / pending"}</span>
    </button>
  );
}

/** Accept all blank spending targets for one month while keeping review close to the column. */
export function BudgetMonthSuggestionControl({ monthLabel, currency, plan, onAcceptAll, disabled = false }: {
  monthLabel: string;
  currency: string;
  plan?: MonthSuggestionPlan;
  onAcceptAll: () => void;
  disabled?: boolean;
}) {
  if (!plan) return null;
  if (!plan.enabled) return <span className="budget-month-suggestion-status">{plan.income > 0 ? "Check expense amounts" : "Set income first"}</span>;
  if (Number.isFinite(plan.overcommitted) && plan.overcommitted > 0) {
    const description = `Existing spending commitments exceed planned income for ${monthLabel} by ${formatCurrency(plan.overcommitted, currency)}. No additional spending is recommended.`;
    return <span className="budget-month-suggestion-status" title={description} aria-label={description}>Income overbooked</span>;
  }
  const count = Object.values(plan.suggestions).filter((suggestion) => Number.isFinite(suggestion.amount) && suggestion.amount >= 0).length;
  if (!count) return <span className="budget-month-suggestion-status">{plan.cashKnown === false
    ? "Cash forecast incomplete" : plan.cashLimited ? "Keep cash for future costs" : "No blank plans to suggest"}</span>;
  const history = plan.historyMonths.length
    ? `Uses ${plan.historyMonths.length} completed month${plan.historyMonths.length === 1 ? "" : "s"} of spending history.`
    : "Uses recorded spending and pending reservations.";
  const label = `Use ${count} suggested spending amount${count === 1 ? "" : "s"} for ${monthLabel}`;
  const description = `${label}. Planned income ${formatCurrency(plan.income, currency)}. ${history} Leaves ${formatCurrency(plan.availableLeft, currency)} of safe spending headroom. Review the entered plans, then use Save all cells.`;
  return (
    <button type="button" className="budget-month-suggestion-control" disabled={disabled}
      onClick={onAcceptAll} aria-label={label} title={description}>Fill blank plans</button>
  );
}

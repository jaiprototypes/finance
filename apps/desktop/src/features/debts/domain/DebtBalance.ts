type BalanceReport = {
  balance?: number | null;
  display_balance?: number | null;
  balance_known?: boolean;
};

/** Missing loan observations remain unknown, even when cash movements can estimate them. */
export class DebtBalance {
  readonly actual: number | null;
  readonly estimatedPrincipal: number | null;
  readonly estimatedInterest: number | null;
  readonly estimatedTotal: number | null;

  constructor(profile: any, report?: BalanceReport, activity?: any) {
    this.actual = activity
      ? DebtBalance.amount(activity.balance)
      : profile.tracking_account_id || profile.balance_anchor_amount != null || report?.balance_known === false
        ? null
        : DebtBalance.amount(report?.display_balance !== undefined ? report.display_balance : report?.balance);
    this.estimatedPrincipal = DebtBalance.amount(activity?.estimated_balance);
    this.estimatedInterest = DebtBalance.amount(activity?.estimated_interest);
    this.estimatedTotal = DebtBalance.amount(activity?.projected_balance);
  }

  /** Estimates enter a scenario only after an explicit user choice. */
  payoffAmount(includeEstimate: boolean): number | null {
    return this.actual ?? (includeEstimate ? this.estimatedTotal : null);
  }

  /** Native loan balances are magnitudes; null and invalid values never become zero. */
  private static amount(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? Math.abs(value) : null;
  }
}

/** Keep APR display consistent with the API's fractional annual rate. */
export function formatDebtApr(apr: number): string {
  return Number.isFinite(apr)
    ? new Intl.NumberFormat("en-AU", { style: "percent", maximumFractionDigits: 3 }).format(apr)
    : "—";
}

/** Name the chosen interest assumption without confusing daily accrual and compounding. */
export function debtInterestLabel(compounding: string): string {
  return compounding === "daily" ? "Daily compounding"
    : compounding === "monthly" ? "Monthly compounding" : "Simple daily accrual";
}

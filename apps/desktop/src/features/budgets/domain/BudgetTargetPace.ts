export type FutureCost = { month: string; amount: number; name: string; rowId: string; marked?: boolean };
export type CashCheckpoint = { month: string; deadline: string; label: "month-end" | "due-date";
  cash: number | null; costs: number; gap: number | null; timingUnknown?: boolean };
type CashPosition = { cashLeft: number | null };

/** Find the single spending adjustment needed to keep shared monthly cash nonnegative. */
export class BudgetTargetPace {
  readonly checkpoints: CashCheckpoint[] = [];
  readonly costs: FutureCost[];
  readonly weekly: number;
  readonly monthly: number;
  readonly gap: number;
  readonly unknown: boolean;

  constructor(costs: FutureCost[], cash: Record<string, CashPosition>, today: string, complete = true, dated: CashCheckpoint[] = [], throughMonth?: string) {
    this.costs = costs.filter(cost => cost.month >= today.slice(0, 7) && cost.amount > 0);
    const last = [...this.costs.map(cost => cost.month), ...(throughMonth ? [throughMonth] : [])].sort().slice(-1)[0];
    for (let month = today.slice(0, 7); last && month <= last; month = BudgetTargetPace.offset(month, 1)) {
      const closing = BudgetTargetPace.balance(cash[month]?.cashLeft);
      const costs = this.costs.filter(cost => cost.month === month).reduce((sum, cost) => sum + cost.amount, 0);
      this.checkpoints.push({ month, deadline: BudgetTargetPace.offset(month, 1), label: "month-end",
        cash: closing, costs, gap: closing === null ? null : Math.max(0, -closing) });
    }
    this.checkpoints.push(...dated);
    this.checkpoints.sort((a, b) => a.deadline.localeCompare(b.deadline));
    this.unknown = !complete || this.checkpoints.some(point => point.gap === null || point.timingUnknown);
    this.gap = Math.max(0, ...this.checkpoints.map(point => point.gap || 0));
    // Each gap already includes preceding plans. Take the maximum required pace, never sum gaps.
    const rates = this.checkpoints.map(point => BudgetTargetPace.rates(point.gap || 0, today, point.deadline));
    this.weekly = Math.max(0, ...rates.map(rate => rate.weekly));
    this.monthly = Math.max(0, ...rates.map(rate => rate.monthly));
  }

  /** Weekly/monthly equivalents count only days after today and before the deadline. */
  private static rates(gap: number, today: string, deadline: string) {
    const [year, month, day] = today.split("-").map(Number);
    const [dueYear, dueMonth, dueDay = 1] = deadline.split("-").map(Number);
    const days = Math.max(0, (Date.UTC(dueYear, dueMonth - 1, dueDay) - Date.UTC(year, month - 1, day + 1)) / 86_400_000);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const months = Math.max(0, (dueYear - year) * 12 + dueMonth - month - day / daysInMonth
      + (dueDay - 1) / new Date(Date.UTC(dueYear, dueMonth, 0)).getUTCDate());
    const rate = (periods: number) => gap <= 0 ? 0 : periods > 0 ? Math.ceil((gap / periods - 1e-9) * 100) / 100 : Infinity;
    return { weekly: rate(days / 7), monthly: rate(months) };
  }

  /** Missing observations cannot establish that a purchase is covered. */
  private static balance(value: number | null | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  /** Calendar arithmetic keeps year boundaries independent of local daylight saving. */
  private static offset(month: string, offset: number): string {
    const [year, number] = month.split("-").map(Number);
    const index = year * 12 + number - 1 + offset;
    return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
  }

  /** Use the local calendar day for the planning start date. */
  static today(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
}

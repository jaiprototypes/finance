/** Slide six months through a calendar year, continuing into the following year. */
export class BudgetMonthWindow {
  static readonly size = 6;
  static readonly yearSize = 12;

  readonly months: string[];
  readonly startIndex: number;
  readonly maxStartIndex: number;

  constructor(months: readonly string[], startIndex = 0) {
    const count = Math.min(months.length, BudgetMonthWindow.yearSize);
    this.maxStartIndex = count === BudgetMonthWindow.yearSize ? count - 1
      : Math.max(0, count - BudgetMonthWindow.size);
    const requestedStart = Number.isFinite(startIndex) ? Math.trunc(startIndex) : 0;
    this.startIndex = Math.min(this.maxStartIndex, Math.max(0, requestedStart));
    this.months = count === BudgetMonthWindow.yearSize
      ? Array.from({ length: BudgetMonthWindow.size }, (_, offset) =>
        BudgetMonthWindow.offset(months[0], this.startIndex + offset))
      : months.slice(this.startIndex, this.startIndex + BudgetMonthWindow.size);
  }

  /** Crossing a year boundary keeps the next start exactly one month away. */
  static move(year: string, startIndex: number, direction: -1 | 1): { year: string; startIndex: number } {
    const start = Number.isFinite(startIndex) ? Math.min(11, Math.max(0, Math.trunc(startIndex))) : 0;
    const next = start + direction;
    if (next < 0) return { year: String(Number(year) - 1), startIndex: 11 };
    if (next >= BudgetMonthWindow.yearSize) return { year: String(Number(year) + 1), startIndex: 0 };
    return { year, startIndex: next };
  }

  /** Keep a newly reached current month at the right edge of the six-month window. */
  static endingAt(month: string): { year: string; startIndex: number } {
    const first = BudgetMonthWindow.offset(month, 1 - BudgetMonthWindow.size);
    return { year: first.slice(0, 4), startIndex: Number(first.slice(5, 7)) - 1 };
  }

  /** Open the current half-year, or the nearest half-year outside this year. */
  static defaultStart(months: readonly string[], currentMonth: string): number {
    const primaryMonths = months.slice(0, BudgetMonthWindow.yearSize);
    const currentIndex = primaryMonths.findIndex((month) => month >= currentMonth);
    // Historical years still open July–December rather than projecting into another year.
    const start = currentIndex < 0 ? Math.max(0, primaryMonths.length - BudgetMonthWindow.size) : currentIndex;
    const halfYearStart = Math.floor(start / BudgetMonthWindow.size) * BudgetMonthWindow.size;
    return new BudgetMonthWindow(primaryMonths, halfYearStart).startIndex;
  }

  /** Month arithmetic avoids local timezone and daylight-saving date boundaries. */
  private static offset(month: string, offset: number): string {
    const [year, number] = month.split("-").map(Number);
    const index = year * 12 + number - 1 + offset;
    return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
  }
}

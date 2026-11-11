export type CashPlanEntry = {
  type: "income" | "expense";
  actual: number;
  reserved: number;
  target?: number;
  cashNeutral?: boolean;
  dueDate?: string | null;
};

export type CashMonthInput = {
  month: string;
  state: string;
  snapshot?: {
    opening: number | null;
    received: number;
    paid: number;
    closing: number | null;
    pending: number;
    transfer_adjustment?: number;
  };
  entries: CashPlanEntry[];
};

/** Apply only unfulfilled plans to independently reconciled bank cash. */
export class BudgetCashPosition {
  readonly month: string;
  readonly state: string;
  readonly opening: number | null;
  readonly received: number;
  readonly paid: number;
  readonly closing: number | null;
  readonly pending: number;
  readonly transferAdjustment: number;
  readonly planChange: number;
  readonly reservedSavings: number;

  constructor(input: CashMonthInput, previousPlanChange = 0, previousSavings = 0) {
    this.month = input.month;
    this.state = input.state;
    this.opening = BudgetCashPosition.knownBalance(input.snapshot?.opening);
    this.closing = BudgetCashPosition.knownBalance(input.snapshot?.closing);
    this.received = input.snapshot?.received || 0;
    this.paid = input.snapshot?.paid || 0;
    this.pending = input.snapshot?.pending || 0;
    // Timing and currency differences reconcile cash without inflating external flows.
    this.transferAdjustment = input.snapshot?.transfer_adjustment || 0;
    this.planChange = input.state === "past" ? 0 : previousPlanChange
      + input.entries.reduce((sum, entry) => sum + BudgetCashPosition.unfulfilled(entry), 0);
    this.reservedSavings = input.state === "past" ? 0 : previousSavings
      + input.entries.reduce((sum, entry) => sum + BudgetCashPosition.savingReservation(entry), 0);
  }

  /** Unknown bank coverage stays unknown even when an income plan exists. */
  get projectedClosing(): number | null {
    return this.closing === null ? null : this.closing + this.planChange;
  }

  /** Completed months settle to bank cash; open months reflect remaining plans. */
  get cashLeft(): number | null {
    const cash = this.state === "past" ? this.closing : this.projectedClosing;
    return cash === null ? null : cash - this.reservedSavings;
  }

  /** Planned saving is protected from spending, without becoming an external expense. */
  private static savingReservation(entry: CashPlanEntry): number {
    if (!entry.cashNeutral || entry.target === undefined) return 0;
    // Saver transfers remain inside combined bank cash, so they do not fulfil this reserve away.
    return Math.max(0, entry.target);
  }

  /** A card reservation already reduces available cash and must not be paid twice. */
  private static unfulfilled(entry: CashPlanEntry): number {
    // Savings allocations move money between included accounts without changing combined cash.
    if (entry.cashNeutral || entry.target === undefined) return 0;
    const remaining = Math.max(0, entry.target - entry.actual - entry.reserved);
    return entry.type === "income" ? remaining : -remaining;
  }

  /** Preserve a genuine zero balance without substituting for missing data. */
  private static knownBalance(value?: number | null): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
}

export type DatedCashCheckpoint = {
  month: string; deadline: string; label: "due-date"; cash: number | null;
  costs: number; gap: number | null; timingUnknown: boolean;
};

/** Check explicit bill dates against observed cash and scheduled, unfulfilled plans. */
export class BudgetCashSchedule {
  readonly checkpoints: DatedCashCheckpoint[] = [];

  constructor(inputs: CashMonthInput[], positions: Record<string, BudgetCashPosition>, today: string) {
    for (const input of inputs) {
      if (input.month >= today.slice(0, 7)) this.checkMonth(input, positions, today);
    }
  }

  /** Reserve undated expenses first; undated income cannot prove an early bill is funded. */
  private checkMonth(input: CashMonthInput, positions: Record<string, BudgetCashPosition>, today: string) {
    const [year, month] = input.month.split("-").map(Number);
    const previous = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
    const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const current = positions[input.month];
    const prior = positions[previous];
    let balance = input.month === today.slice(0, 7)
      ? current?.closing == null ? null : current.closing - current.reservedSavings
      : prior?.cashLeft == null || prior.closing == null || current?.closing == null ? null
      : prior.cashLeft + current.closing - prior.closing - (current.reservedSavings - prior.reservedSavings);
    let undatedIncome = 0;
    const events = new Map<string, { income: number; expense: number }>();
    for (const entry of input.entries) {
      if (entry.cashNeutral || entry.target === undefined) continue;
      const amount = Math.max(0, entry.target - entry.actual - entry.reserved);
      if (amount <= 0) continue;
      if (!entry.dueDate) {
        if (entry.type === "income") undatedIncome += amount;
        else if (balance !== null) balance -= amount;
        continue;
      }
      const date = entry.dueDate < today ? today : entry.dueDate;
      const event = events.get(date) || { income: 0, expense: 0 };
      event[entry.type] += amount;
      events.set(date, event);
    }
    for (const [date, event] of [...events].sort(([a], [b]) => a.localeCompare(b))) {
      if (balance !== null) balance += event.income - event.expense;
      if (date === lastDay && balance !== null) balance += undatedIncome;
      if (event.expense <= 0) continue;
      const gap = balance === null ? null : Math.max(0, -balance);
      this.checkpoints.push({ month: input.month, deadline: date, label: "due-date",
        cash: balance, costs: event.expense, gap,
        timingUnknown: date < lastDay && undatedIncome > 0 && gap !== null && gap > 0 });
    }
  }
}

/** Carry plans across the full calendar year while bank cash retains its source. */
export class BudgetCashTimeline {
  readonly months: Record<string, BudgetCashPosition> = {};

  /** Retain signed headroom for Enter validation; recommendations clamp it at zero. */
  static minimumBalances(positions: Record<string, BudgetCashPosition>, dated: DatedCashCheckpoint[] = []) {
    const months = Object.keys(positions).sort();
    return Object.fromEntries(months.map(month => {
      const checkpoints = months.filter(next => next >= month).map(next => positions[next].cashLeft);
      for (const point of dated) {
        if (point.month >= month) checkpoints.push(point.timingUnknown ? null : point.cash);
      }
      const known = checkpoints.length > 0 && checkpoints.every(value => value !== null && Number.isFinite(value));
      return [month, known ? Math.min(...checkpoints as number[]) : null];
    }));
  }

  /** Extra proposals must fit every later month-end and explicitly dated payment. */
  static spendingAllowances(positions: Record<string, BudgetCashPosition>, dated: DatedCashCheckpoint[] = []) {
    return Object.fromEntries(Object.entries(BudgetCashTimeline.minimumBalances(positions, dated))
      .map(([month, cash]) => [month, cash === null ? null : Math.max(0, cash)]));
  }

  constructor(inputs: CashMonthInput[]) {
    let planChange = 0;
    let savings = 0;
    for (const input of inputs) {
      const position = new BudgetCashPosition(input, planChange, savings);
      this.months[input.month] = position;
      planChange = position.planChange;
      savings = position.reservedSavings;
    }
  }
}

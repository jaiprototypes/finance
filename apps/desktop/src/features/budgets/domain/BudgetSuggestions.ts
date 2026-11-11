type Amounts = Record<string, number>;
type Edits = Record<string, Record<string, string>>;

export type BudgetSuggestionRow = {
  id: string | number;
  type: string;
  cash_neutral?: boolean;
  expense?: Amounts;
  pending_expense?: Amounts;
  budget?: Amounts;
  budget_entered?: Record<string, boolean>;
};

export type BudgetSuggestionHistory = {
  month: string;
  covered: boolean;
  expenses: Amounts;
};

export type BudgetSuggestion = {
  amount: number;
  historicalAverage: number;
  basis: "future-plan" | "history" | "recorded-commitments";
};

export type BudgetMonthSuggestions = {
  month: string;
  enabled: boolean;
  disabledReason?: "income-plan-required" | "invalid-expense-plan";
  income: number;
  committed: number;
  available: number;
  availableLeft: number;
  overcommitted: number;
  cashLimited: boolean;
  cashKnown: boolean;
  historyMonths: string[];
  suggestions: Record<string, BudgetSuggestion>;
};

type Target = { kind: "blank" | "invalid"; value?: never } | { kind: "valid"; value: number };
type Candidate = { id: string; floor: number; historical: number; demand: number; allocation: number };

/** Preview future-plan allowances or historical monthly targets; accepting a suggestion remains a separate edit. */
export class BudgetSuggestions {
  readonly months: Record<string, BudgetMonthSuggestions> = {};
  private readonly history: BudgetSuggestionHistory[];
  private readonly rows: readonly BudgetSuggestionRow[];
  private readonly edits: Edits;
  private readonly cashAllowance?: Record<string, number | null>;

  constructor({ months, currentMonth, rows, edits = {}, history = [], cashAllowance }: {
    months: readonly string[];
    currentMonth: string;
    rows: readonly BudgetSuggestionRow[];
    edits?: Edits;
    history?: readonly BudgetSuggestionHistory[];
    cashAllowance?: Record<string, number | null>;
  }) {
    this.rows = rows;
    this.edits = edits;
    this.cashAllowance = cashAllowance;
    // A partial current month and unknown feed coverage cannot establish a monthly pattern.
    this.history = [...new Map(history.map((entry) => [entry.month, entry])).values()]
      .filter((entry) => entry.covered && entry.month < currentMonth)
      .sort((a, b) => a.month.localeCompare(b.month)).slice(-3);
    for (const month of months) {
      if (month >= currentMonth) this.months[month] = this.recommend(month);
    }
  }

  /** Reserve existing targets, recorded spending and bank holds before suggesting any additions. */
  private recommend(month: string): BudgetMonthSuggestions {
    const incomeRows = this.rows.filter((row) => row.type === "income");
    const targets = incomeRows.map((row) => this.target(row, month));
    const incomeReady = targets.length > 0 && targets.every((target) => target.kind === "valid" && target.value >= 0);
    const income = incomeReady ? targets.reduce((sum, target) => sum + (target.value || 0), 0) : 0;
    const expenseRows = this.rows.filter((row) => row.type !== "income");
    const futurePlan = this.hasFutureTargets(month);
    const candidates: Candidate[] = [];
    let committed = 0;
    let invalidExpense = false;
    for (const row of expenseRows) {
      const target = this.target(row, month);
      const floor = BudgetSuggestions.ceilingCents(Math.max(0,
        BudgetSuggestions.amount(row.expense?.[month]) + BudgetSuggestions.amount(row.pending_expense?.[month])));
      invalidExpense ||= target.kind === "invalid";
      committed += Math.max(floor, target.kind === "valid" ? BudgetSuggestions.ceilingCents(target.value) : 0);
      if (target.kind === "blank" && !(futurePlan && row.cash_neutral)) candidates.push(this.candidate(row, floor));
    }
    const incomeCents = Math.floor((income + 1e-9) * 100);
    const enabled = incomeReady && incomeCents > 0 && !invalidExpense;
    const incomeAvailable = enabled ? Math.max(0, incomeCents - committed) : 0;
    const cash = this.cashAllowance?.[month];
    const cashKnown = !this.cashAllowance || (typeof cash === "number" && Number.isFinite(cash));
    const cashCents = !this.cashAllowance ? incomeAvailable : cashKnown ? Math.max(0, Math.floor((cash! + 1e-9) * 100)) : 0;
    const available = Math.min(incomeAvailable, cashCents);
    const result: BudgetMonthSuggestions = {
      month, enabled, cashLimited: available < incomeAvailable, cashKnown, income: incomeCents / 100, committed: committed / 100,
      available: available / 100, availableLeft: available / 100,
      overcommitted: enabled ? Math.max(0, committed - incomeCents) / 100 : 0,
      historyMonths: this.history.map((entry) => entry.month), suggestions: {}
    };
    if (!enabled) {
      result.disabledReason = !incomeReady || incomeCents <= 0 ? "income-plan-required" : "invalid-expense-plan";
      return result;
    }
    if (result.overcommitted > 0) return result;
    result.availableLeft -= BudgetSuggestions.allocate(candidates, available, futurePlan) / 100;
    result.availableLeft = Math.round(result.availableLeft * 100) / 100;
    for (const candidate of candidates) {
      const amount = candidate.floor + candidate.allocation;
      if (amount <= 0 && !(futurePlan && cashKnown)) continue;
      result.suggestions[candidate.id] = {
        amount: amount / 100, historicalAverage: candidate.historical / 100,
        basis: futurePlan ? "future-plan" : candidate.allocation > 0 ? "history" : "recorded-commitments"
      };
    }
    return result;
  }

  /** A later explicit expense target selects planning mode; cleared and paid targets do not. */
  private hasFutureTargets(month: string): boolean {
    return this.rows.some(row => row.type !== "income" && !row.cash_neutral
      && [...new Set([...Object.keys(row.budget || {}), ...Object.keys(this.edits[String(row.id)] || {})])]
        .some(next => {
          if (next <= month) return false;
          const target = this.target(row, next);
          const paid = BudgetSuggestions.amount(row.expense?.[next]) + BudgetSuggestions.amount(row.pending_expense?.[next]);
          return target.kind === "valid" && target.value > Math.max(0, paid);
        }));
  }

  /** Covered zero-spend months count; signed refunds reduce the average rather than create income. */
  private candidate(row: BudgetSuggestionRow, floor: number): Candidate {
    const id = String(row.id);
    const mean = this.history.length ? this.history.reduce((sum, entry) =>
      sum + BudgetSuggestions.amount(entry.expenses[id]), 0) / this.history.length : 0;
    const historical = Math.round((Math.max(0, mean) + 1e-9) * 100);
    return { id, floor, historical, demand: Math.max(0, historical - floor), allocation: 0 };
  }

  /** Blank drafts remove saved targets; explicit zero and invalid drafts remain protected. */
  private target(row: BudgetSuggestionRow, month: string): Target {
    const raw = this.edits[String(row.id)]?.[month];
    if (raw !== undefined && raw.trim() === "") return { kind: "blank" };
    if (raw === undefined && !row.budget_entered?.[month]) return { kind: "blank" };
    const value = raw === undefined ? Number(row.budget?.[month] || 0) : Number(raw);
    return Number.isFinite(value) ? { kind: "valid", value } : { kind: "invalid" };
  }

  /** Plan mode distributes safe headroom; history mode stops at historical demand. */
  private static allocate(candidates: Candidate[], available: number, futurePlan: boolean): number {
    if (!candidates.length) return 0;
    const historicalDemand = candidates.reduce((sum, row) => sum + row.demand, 0);
    // Without history, an equal starting split avoids inventing category priorities.
    if (futurePlan && historicalDemand <= 0) candidates.forEach(row => { row.demand = 1; });
    const demand = candidates.reduce((sum, row) => sum + row.demand, 0);
    const pool = futurePlan ? available : Math.min(available, demand);
    if (pool <= 0) return 0;
    const shares = candidates.filter((row) => row.demand > 0).map((row) => {
      const exact = pool * row.demand / demand;
      row.allocation = Math.floor(exact);
      return { row, remainder: exact - row.allocation };
    }).sort((a, b) => b.remainder - a.remainder || a.row.id.localeCompare(b.row.id));
    const allocated = shares.reduce((sum, { row }) => sum + row.allocation, 0);
    for (let index = 0; index < pool - allocated; index += 1) shares[index].row.allocation += 1;
    return pool;
  }

  private static ceilingCents(value: number): number {
    return Math.max(0, Math.ceil((value - 1e-9) * 100));
  }

  private static amount(value: number | undefined): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
}

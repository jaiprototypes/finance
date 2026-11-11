import type { CashMonthInput } from "./BudgetCashTimeline";

type Amounts = Record<string, number>;
type PlanRow = {
  id: string | number;
  type: string;
  income?: Amounts;
  expense?: Amounts;
  pending_income?: Amounts;
  pending_expense?: Amounts;
  budget?: Amounts;
  budget_entered?: Record<string, boolean>;
  cash_neutral?: boolean;
};
type PlanContext = { months: string[]; categories: PlanRow[] };
type PlanDrafts = Record<string, Record<string, Record<string, string>>>;

/** Carry earlier unfulfilled plans into future years, including workspace drafts. */
export class BudgetPlanContext {
  readonly inputs: CashMonthInput[];

  constructor(contexts: PlanContext[], drafts: PlanDrafts, currency: string, currentMonth: string, beforeMonth: string) {
    const months = new Map<string, Map<string, PlanRow>>();
    for (const context of contexts) {
      for (const month of context.months || []) {
        if (month < currentMonth || month >= beforeMonth) continue;
        const rows = months.get(month) || new Map<string, PlanRow>();
        for (const row of context.categories || []) rows.set(String(row.id), row);
        months.set(month, rows);
      }
    }
    this.inputs = [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, rows]) => ({
      month,
      state: month === currentMonth ? "current" : "future",
      entries: [...rows.values()].map((row) => {
        const income = row.type === "income";
        const raw = drafts[`${month.slice(0, 4)}:${currency}`]?.[String(row.id)]?.[month];
        return {
          type: income ? "income" : "expense",
          actual: Number((income ? row.income : row.expense)?.[month] || 0),
          reserved: Number((income ? row.pending_income : row.pending_expense)?.[month] || 0),
          target: BudgetPlanContext.target(row, month, raw),
          cashNeutral: Boolean(row.cash_neutral)
        };
      })
    }));
  }

  /** Blank drafts remove saved targets; an explicit zero remains a target. */
  private static target(row: PlanRow, month: string, raw?: string): number | undefined {
    if (raw === "") return undefined;
    const target = raw !== undefined ? Number(raw)
      : row.budget_entered?.[month] ? Number(row.budget?.[month] || 0) : undefined;
    return target !== undefined && Number.isFinite(target) ? target : undefined;
  }
}

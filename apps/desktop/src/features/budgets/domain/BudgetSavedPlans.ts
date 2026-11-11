export type SavedCell = { rowId: string; month: string; amount: number; targetId?: number;
  deleted?: boolean; rollover?: number; dueDate?: string | null; futureCost?: boolean };

/** Apply acknowledged writes locally while retaining the existing bank snapshot. */
export class BudgetSavedPlans {
  static apply(report: any, cells: SavedCell[]): any {
    if (!report) return report;
    const relevant = cells.filter(cell => report.months?.includes(cell.month));
    if (!relevant.length) return report;
    return { ...report, categories: (report.categories || []).map((row: any) => {
      const updates = relevant.filter(cell => cell.rowId === String(row.id));
      if (!updates.length) return row;
      const result = { ...row };
      for (const field of ["budget", "budget_entered", "budget_target_id", "due_date", "future_cost", "rollover", "effective_budget"]) {
        result[field] = { ...row[field] };
      }
      for (const cell of updates) {
        result.budget[cell.month] = cell.deleted ? 0 : cell.amount;
        result.budget_entered[cell.month] = !cell.deleted;
        result.budget_target_id[cell.month] = cell.deleted ? null : cell.targetId;
        result.due_date[cell.month] = cell.deleted ? null : cell.dueDate ?? row.due_date?.[cell.month] ?? null;
        result.future_cost[cell.month] = !cell.deleted && (cell.futureCost ?? row.future_cost?.[cell.month] ?? false);
        result.rollover[cell.month] = cell.deleted ? 0 : cell.rollover ?? row.rollover?.[cell.month] ?? 0;
        const actual = row[row.type === "income" ? "income" : "expense"]?.[cell.month] || 0;
        result.effective_budget[cell.month] = cell.deleted ? actual : cell.amount;
      }
      return result;
    }) };
  }
}

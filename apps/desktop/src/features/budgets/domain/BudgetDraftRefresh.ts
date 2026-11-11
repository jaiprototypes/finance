type Edits = Record<string, Record<string, string>>;

/** Refresh saved plans without overwriting changes still being reviewed in the workspace. */
export class BudgetDraftRefresh {
  static merge(previousMatrix: any | undefined, edits: Edits, freshMatrix: any): Edits {
    const sameCurrency = Boolean(previousMatrix?.base_currency
      && previousMatrix.base_currency === freshMatrix.base_currency);
    const changes = sameCurrency ? BudgetDraftRefresh.changes(previousMatrix, edits, freshMatrix.current_month) : {};
    const refreshed: Edits = {};

    for (const row of freshMatrix.categories || []) {
      const id = String(row.id);
      const values: Record<string, string> = {};
      for (const month of freshMatrix.months || []) {
        values[month] = changes[id]?.[month] ?? BudgetDraftRefresh.saved(row, month);
      }
      refreshed[id] = values;
    }
    return refreshed;
  }

  /** Keep only unsaved targets so cached saved values cannot override newer server plans. */
  static changes(previousMatrix: any | undefined, edits: Edits, currentMonth: string): Edits {
    const changes: Edits = {};
    for (const row of previousMatrix?.categories || []) {
      const id = String(row.id);
      for (const month of previousMatrix.months || []) {
        const raw = edits[id]?.[month];
        if (month < currentMonth || raw === undefined
          || BudgetDraftRefresh.equivalent(raw, BudgetDraftRefresh.saved(row, month))) continue;
        changes[id] ||= {};
        changes[id][month] = raw;
      }
    }
    return changes;
  }

  /** An entered zero remains different from an unplanned cell. */
  private static saved(row: any, month: string): string {
    return row.budget_entered?.[month] ? String(row.budget?.[month] ?? 0) : "";
  }

  /** Formatting alone is not an unsaved edit; invalid typed drafts remain reviewable. */
  private static equivalent(raw: string, saved: string): boolean {
    if (raw === saved) return true;
    if (!raw.trim() || !saved.trim()) return raw.trim() === saved.trim();
    const typed = Number(raw);
    const baseline = Number(saved);
    return Number.isFinite(typed) && Number.isFinite(baseline) && typed === baseline;
  }
}

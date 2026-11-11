type MonthMap = Record<string, any>;
type MatrixRow = { id: string | number; subcategories?: MatrixRow[]; [key: string]: any };
type MatrixData = {
  year?: number;
  months?: string[];
  categories?: MatrixRow[];
  base_currency?: string;
  current_month?: string;
  month_meta?: MonthMap;
  cash_flow?: { months?: MonthMap; [key: string]: any } | null;
  [key: string]: any;
};

/** Extend a calendar budget for a continuous window while keeping its annual accounting period. */
export class BudgetMatrixPeriod {
  readonly matrix: MatrixData | null;
  readonly months: string[];
  readonly categories: MatrixRow[];
  readonly hasFollowing: boolean;

  private static readonly monthlyFields = [
    "budget", "budget_entered", "budget_target_id", "due_date", "future_cost", "effective_budget", "editable", "rollover",
    "income", "expense", "pending_income", "pending_expense"
  ];

  constructor(primary: MatrixData | null | undefined, following?: MatrixData | null) {
    const next = BudgetMatrixPeriod.followingFor(primary, following);
    this.hasFollowing = Boolean(next);
    this.months = [...new Set([...(primary?.months || []), ...(next?.months || [])])].sort();
    this.categories = BudgetMatrixPeriod.mergeRows(primary?.categories || [], next?.categories || [], next?.months || []);
    this.matrix = primary ? {
      ...primary,
      // Annual totals and prior-plan context remain owned by the selected year.
      months: [...(primary.months || [])],
      categories: this.categories,
      // A previous calendar year has no advisory history after January; use the open year's baseline.
      suggestion_history: primary.suggestion_history?.length ? primary.suggestion_history
        : next?.suggestion_history || primary.suggestion_history,
      month_meta: BudgetMatrixPeriod.mergeMap(primary.month_meta, next?.month_meta, next?.months || []),
      cash_flow: primary.cash_flow ? {
        ...primary.cash_flow,
        // A second report extends monthly snapshots; its account balances are never added again.
        months: BudgetMatrixPeriod.mergeMap(primary.cash_flow.months, next?.cash_flow?.months, next?.months || [])
      } : primary.cash_flow
    } : null;
  }

  /** Monthly snapshots can join only when they describe the same bank anchors and FX reference. */
  static cashMatches(primary?: MatrixData | null, following?: MatrixData | null): boolean {
    return JSON.stringify(BudgetMatrixPeriod.cashFingerprint(primary?.cash_flow))
      === JSON.stringify(BudgetMatrixPeriod.cashFingerprint(following?.cash_flow));
  }

  /** Sort accounts so provider ordering does not look like a changed cash observation. */
  private static cashFingerprint(cash?: MatrixData["cash_flow"]): unknown {
    if (!cash) return null;
    const accounts: any[] = Array.isArray(cash.accounts) ? cash.accounts : [];
    const rate = cash.fx?.aud_per_usd ?? null;
    const hasAnchors = accounts.some((account) => account && ["currency", "anchor_balance", "as_of", "coverage_status"]
      .some((field) => account[field] !== undefined));
    if (hasAnchors) return { rate, accounts: accounts.map((account) => [account.account_id, account.currency,
      account.anchor_balance, account.as_of, account.coverage_status])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))) };
    if (cash.fx?.aud_per_usd !== undefined || ["cash_balance", "as_of", "latest_as_of"]
      .some((field) => cash[field] !== undefined)) {
      return { rate, balance: cash.cash_balance ?? null, asOf: cash.as_of ?? null, latestAsOf: cash.latest_as_of ?? null };
    }
    // Minimal test/legacy payloads may expose snapshots without detailed anchor metadata.
    return Object.values(cash.months || {}).some((month: any) => month &&
      (month.opening !== undefined || month.closing !== undefined)) ? { snapshots: true } : null;
  }

  /** Another currency, planning boundary or non-adjacent calendar year cannot extend this period. */
  private static followingFor(primary?: MatrixData | null, following?: MatrixData | null): MatrixData | undefined {
    if (!primary || !following || !primary.base_currency || !primary.current_month
      || primary.base_currency !== following.base_currency || primary.current_month !== following.current_month) return;
    const year = Number(primary.year ?? primary.months?.[0]?.slice(0, 4));
    const nextYear = Number(following.year ?? following.months?.[0]?.slice(0, 4));
    if (!Number.isFinite(year) || nextYear !== year + 1 || !following.months?.length
      || following.months.some((month) => !month.startsWith(`${nextYear}-`))
      || !BudgetMatrixPeriod.cashMatches(primary, following)) return;
    return following;
  }

  /** Preserve primary ordering and stable IDs, including details first appearing next year. */
  private static mergeRows(primary: MatrixRow[], following: MatrixRow[], months: string[]): MatrixRow[] {
    const next = new Map(following.map((row) => [String(row.id), row]));
    const rows = primary.map((row) => {
      const extra = next.get(String(row.id));
      next.delete(String(row.id));
      return BudgetMatrixPeriod.mergeRow(row, extra, months);
    });
    return [...rows, ...[...next.values()].map((row) => BudgetMatrixPeriod.mergeRow(undefined, row, months))];
  }

  /** Monthly values extend; year-total values retain only the primary calendar's contribution. */
  private static mergeRow(primary: MatrixRow | undefined, following: MatrixRow | undefined, months: string[]): MatrixRow {
    const row = { ...following, ...primary } as MatrixRow;
    for (const field of BudgetMatrixPeriod.monthlyFields) {
      if (primary?.[field] !== undefined || following?.[field] !== undefined) {
        row[field] = BudgetMatrixPeriod.mergeMap(primary?.[field], following?.[field], months);
      }
    }
    for (const field of Object.keys(row).filter((name) => name.startsWith("total_"))) {
      row[field] = primary?.[field] ?? 0;
    }
    if (primary?.subcategories || following?.subcategories) {
      row.subcategories = BudgetMatrixPeriod.mergeRows(primary?.subcategories || [], following?.subcategories || [], months);
    }
    return row;
  }

  /** Import only months belonging to the extension, keeping existing snapshots authoritative. */
  private static mergeMap(primary?: MonthMap, following?: MonthMap, months: string[] = []): MonthMap {
    const extra = Object.fromEntries(months.filter((month) => following && Object.prototype.hasOwnProperty.call(following, month))
      .map((month) => [month, following![month]]));
    return { ...extra, ...primary };
  }
}

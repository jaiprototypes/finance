export type CellLimitResult = {
  accepted: boolean;
  suggested: number | null;
  reason?: "invalid" | "unknown" | "too-high" | "income-too-low";
};

/** Check a draft against shared cash after removing that cell's unfulfilled target. */
export class BudgetCellLimit {
  static expense(raw: string, committed: number, headroom: number | null): CellLimitResult {
    const invalid = BudgetCellLimit.invalid(raw);
    if (invalid) return invalid;
    if (raw === "" || Number(raw) <= Math.max(0, committed)) return { accepted: true, suggested: null };
    if (headroom === null || !Number.isFinite(headroom)) {
      return { accepted: false, suggested: null, reason: "unknown" };
    }
    if (headroom < -1e-9 || committed + headroom < -1e-9) {
      return { accepted: false, suggested: null, reason: "too-high" };
    }
    // Retain signed refunds when translating remaining cash into a monthly net target.
    const maximum = Math.floor((committed + Math.max(0, headroom) + 1e-9) * 100) / 100;
    return Number(raw) <= maximum + 1e-9 ? { accepted: true, suggested: null }
      : { accepted: false, suggested: maximum, reason: "too-high" };
  }

  /** Income may be increased freely; reductions must still cover later plans. */
  static income(raw: string, previous: string, minimumCash: number | null, received = 0): CellLimitResult {
    const invalid = BudgetCellLimit.invalid(raw);
    if (invalid) return invalid;
    if (Number(raw) >= Number(previous)) return { accepted: true, suggested: null };
    if (minimumCash === null) return { accepted: false, suggested: null, reason: "unknown" };
    if (minimumCash >= -1e-9) return { accepted: true, suggested: null };
    return { accepted: false, suggested: Math.ceil((Math.max(Number(raw), received) - minimumCash - 1e-9) * 100) / 100,
      reason: "income-too-low" };
  }

  /** Blank clears a plan; negative and non-finite amounts cannot be committed. */
  private static invalid(raw: string): CellLimitResult | null {
    return raw !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0)
      ? { accepted: false, suggested: null, reason: "invalid" } : null;
  }
}

/** Read report balances without turning an unobserved liability into zero. */
export class ObservedAccountBalance {
  static native(row: any): number | null {
    return this.read(row, ["display_balance", "balance"]);
  }

  static base(row: any): number | null {
    return this.read(row, ["display_balance_base", "balance_base", "balance"]);
  }

  private static read(row: any, fields: string[]): number | null {
    if (!row || row.balance_known === false) return null;
    for (const field of fields) {
      if (row[field] !== undefined) {
        return typeof row[field] === "number" && Number.isFinite(row[field]) ? row[field] : null;
      }
    }
    return null;
  }
}

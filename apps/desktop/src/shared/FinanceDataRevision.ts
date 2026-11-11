/** Track app-originated financial changes without storing data or polling the backend. */
export class FinanceDataRevision {
  static current = 0;

  /** Budget cell saves already reconcile their own cache; read-only POSTs do not invalidate it. */
  static record(path: string): void {
    const route = `/${path.replace(/^\/?(?:api\/v1\/)?/, "")}`;
    if (!/^\/(?:accounts|transactions|imports|categories|settings|classify|plaid|up|debts|receivables|business|invoices|fx)(?:\/|$)/.test(route)) return;
    if (/\/(?:preview|search|audit|train|link-token|payoff|recommendations)(?:\/|$)/.test(route)) return;
    this.current += 1;
  }
}

/** Format source dates without implying that reconstructed history is a bank snapshot. */
export function formatCashSnapshot(value?: string | null, includeTime = true): string {
  if (!value) return "Unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium", ...(includeTime ? { timeStyle: "short" as const } : {})
  }).format(parsed);
}

/** Keep native bank balances and their history coverage available for review. */
export function BudgetCashAccounts({ accounts, formatCurrency }: { accounts: any[]; formatCurrency: any }) {
  if (!accounts.length) return null;
  return (
    <details className="budget-cash-details">
      <summary>Bank balances ({accounts.length})</summary>
      <div className="budget-cash-account-list">
        {accounts.map((account: any) => (
          <div className="budget-cash-account" key={account.account_id}>
            <strong>{account.name}</strong>
            <strong>{account.anchor_balance == null ? "—" : formatCurrency(account.anchor_balance, account.currency)}</strong>
            <span className="muted">{account.currency} · {account.balance_basis === "current" ? "Current balance" : "Available balance"}</span>
            <time className="muted" dateTime={account.as_of || undefined} title={account.as_of || undefined}>
              {formatCashSnapshot(account.as_of)}
            </time>
            <span className="muted budget-cash-account-coverage">
              {account.coverage_start
                ? `Cash history from ${formatCashSnapshot(account.coverage_start, false)}`
                : account.coverage_status === "anchor_stale"
                  ? "Bank snapshot needs refreshing before cash history can be reconstructed."
                  : "Cash history is unavailable for the linked account coverage."}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

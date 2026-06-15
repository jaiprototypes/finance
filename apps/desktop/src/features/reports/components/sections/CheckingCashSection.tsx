export function CheckingCashSection({ model }: { model: any }) {
  const {
    BoxTitle,
    allCheckingTotal,
    businessCheckingAccounts,
    businessCheckingAsOfLabel,
    businessCheckingCount,
    businessCheckingTotal,
    checkingAsOfLabel,
    formatCount,
    formatCurrency,
    netWorth,
    personalCheckingAccounts,
    personalCheckingCount,
    personalCheckingTotal,
    renderCheckingAccountsTable
  } = model;

  return (
    <div className="panel">
      <BoxTitle title="Personal checking cash" />
      <p className="metric">{formatCurrency(personalCheckingTotal, netWorth?.base_currency)}</p>
      <p className="muted">
        {formatCount(personalCheckingCount)} personal accounts
        {checkingAsOfLabel ? ` · As of ${checkingAsOfLabel}` : ""}
        {(netWorth?.checking_ledger_fallback_count || 0) > 0
          ? ` · ${formatCount(netWorth?.checking_ledger_fallback_count || 0)} ledger fallback`
          : ""}
      </p>
      <div className="metric-stack">
        <div className="metric-row">
          <span>Business checking</span>
          <strong>{formatCurrency(businessCheckingTotal, netWorth?.base_currency)}</strong>
        </div>
        <div className="metric-row">
          <span>All checking</span>
          <strong>{formatCurrency(allCheckingTotal, netWorth?.base_currency)}</strong>
        </div>
      </div>
      <div className="table-detail-title">Personal checking accounts</div>
      {renderCheckingAccountsTable(personalCheckingAccounts, "No personal checking accounts are linked.")}
      {(businessCheckingAccounts.length > 0 || businessCheckingCount > 0) && (
        <>
          <div className="table-detail-title">Business checking accounts</div>
          <p className="muted">
            {formatCount(businessCheckingCount)} business accounts
            {businessCheckingAsOfLabel ? ` · As of ${businessCheckingAsOfLabel}` : ""}
            {(netWorth?.business_checking_ledger_fallback_count || 0) > 0
              ? ` · ${formatCount(netWorth?.business_checking_ledger_fallback_count || 0)} ledger fallback`
              : ""}
          </p>
          {renderCheckingAccountsTable(businessCheckingAccounts, "No business checking accounts are linked.")}
        </>
      )}
    </div>
  );
}

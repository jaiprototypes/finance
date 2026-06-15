export function BudgetSettingsSection({ model }: { model: any }) {
  const {
    BoxTitle,
    baseCurrency,
    setBaseCurrency,
    budgetSkipMerchants,
    setBudgetSkipMerchants,
    merchants,
    save
  } = model;

  return (
      <div className="panel">
        <BoxTitle title="Base currency + Budget filters" />
        <div className="row">
          <select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
            <option value="USD">USD</option>
            <option value="AUD">AUD</option>
          </select>
          <textarea
            placeholder="Skip merchants (comma or new line separated)"
            value={budgetSkipMerchants}
            onChange={(e) => setBudgetSkipMerchants(e.target.value)}
            rows={2}
          />
        </div>
        <p className="muted">
          Reports and budget actuals rebalance to this base using the latest trailing fortnight
          AUD/USD average.
        </p>
        <p className="muted">Transactions classified as Transfers or Friends & Family are excluded from budget actuals.</p>
        <div className="row">
          <button onClick={save}>Save base currency</button>
        </div>
      </div>

  );
}

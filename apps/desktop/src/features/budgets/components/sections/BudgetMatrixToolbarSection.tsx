export function BudgetMatrixToolbarSection({ model }: { model: any }) {
  const {
    BoxTitle,
    autofillMatrixFromActuals,
    budgetCurrency,
    budgetMatrix,
    matrixBaseCurrency,
    matrixBaseCurrencyStatus,
    matrixBusy,
    matrixError,
    matrixYear,
    refreshBudgetTransactions,
    saveBlocked,
    saveMatrixAll,
    saveMatrixBaseCurrency,
    setMatrixBaseCurrency,
    setMatrixBaseCurrencyStatus,
    setMatrixYear
  } = model;

  return (
    <>
      <BoxTitle title="Yearly budget matrix" />
      {matrixError && <p className="form-error">{matrixError}</p>}
      {matrixBaseCurrencyStatus && <p className="muted">{matrixBaseCurrencyStatus}</p>}
      <div className="row">
        <label className="row">
          <span>Base currency</span>
          <select
            value={matrixBaseCurrency}
            onChange={(e) => {
              setMatrixBaseCurrency(e.target.value);
              setMatrixBaseCurrencyStatus(null);
            }}
          >
            <option value="AUD">AUD</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <button onClick={saveMatrixBaseCurrency} disabled={matrixBusy || matrixBaseCurrency === budgetCurrency}>
          Save base currency
        </button>
        <input
          type="number"
          min="2000"
          max="2100"
          value={matrixYear}
          onChange={(e) => setMatrixYear(e.target.value)}
        />
        <button onClick={refreshBudgetTransactions} disabled={matrixBusy}>
          Refresh
        </button>
        <button onClick={autofillMatrixFromActuals} disabled={matrixBusy || !budgetMatrix}>
          Autofill from actuals
        </button>
        <button onClick={saveMatrixAll} disabled={matrixBusy || !budgetMatrix || saveBlocked}>
          Save all
        </button>
        <span className="muted">Past months lock to actuals. Open months must keep projected closing personal checking balance above the cash buffer.</span>
      </div>
      <p className="muted">
        Matrix values are displayed in {budgetCurrency}. Blank open cells fall back to actuals until you enter a plan.
      </p>
      <p className="muted">Refresh pulls new Plaid and Up transactions, updates linked balances, then refreshes the matrix. Expand a bucket to inspect subcategories.</p>
    </>
  );
}

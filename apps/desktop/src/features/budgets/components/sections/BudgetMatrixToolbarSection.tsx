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
    refreshBudgetTransactions,
    saveMatrixBaseCurrency,
    setMatrixBaseCurrency,
    setMatrixBaseCurrencyStatus
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
        <button onClick={refreshBudgetTransactions} disabled={matrixBusy}>
          Refresh
        </button>
        <button onClick={autofillMatrixFromActuals} disabled={matrixBusy || !budgetMatrix}>
          Autofill from actuals
        </button>
        <span className="muted">Past months use actuals. Current and future months accept plans.</span>
      </div>
      <details className="budget-matrix-help">
        <summary>How this budget works</summary>
        <p className="muted">
          Matrix values are displayed in {budgetCurrency}. Blank open cells fall back to actuals until you enter a plan.
          {" "}Refunds and Friends &amp; Family receipts reduce spending, including negative net spending.
        </p>
        <p className="muted">Once income is planned, blank spending cells show an allowance that protects later expense targets, after existing income and costs. The allowance is shared using recent spending proportions, or equally without history. If there are no later targets, suggestions use the last three covered completed months. Use a suggestion to enter the monthly total, then press Enter to save that cell or use Save all cells.</p>
        <p className="muted">Cash left starts with bank balances. Money received and paid exclude transfers between the included personal cash accounts, including round-ups and savings withdrawals. Transfer timing and currency differences appear separately when needed to reconcile the balances. Current and future months estimate cash after remaining plans. Completed months use bank activity, so unfulfilled plans stop carrying forward when the month ends. Missing cash history is shown as unavailable.</p>
        <p className="muted">Savings activity shows deposits, round-ups and withdrawals; Net saved is the balance in connected savers. Planned Savings stay protected from spending without reducing combined bank cash.</p>
        <p className="muted">Refresh pulls new Plaid and Up transactions, updates linked balances, then refreshes the matrix. Expand a bucket to inspect subcategories.</p>
      </details>
    </>
  );
}

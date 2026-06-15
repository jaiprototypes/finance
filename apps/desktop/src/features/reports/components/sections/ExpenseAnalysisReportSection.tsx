export function ExpenseAnalysisReportSection({ model }: { model: any }) {
  const { BoxTitle, expenseAnalysis, formatCurrency } = model;

  return (
    <div className="panel">
      <BoxTitle title="Expense analysis" />
      {expenseAnalysis && (
        <>
          <p className="muted">
            Average monthly spend: {formatCurrency(expenseAnalysis.avg_spend, expenseAnalysis.base_currency)}
          </p>
          <div className="grid">
            <div className="card">
              <h4>Top categories</h4>
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {(expenseAnalysis.categories || []).map((row: any) => (
                    <tr key={row.category}>
                      <td>{row.category}</td>
                      <td>{formatCurrency(row.spend, row.currency || expenseAnalysis.base_currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h4>Top merchants</h4>
              <table>
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th>Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {(expenseAnalysis.merchants || []).map((row: any) => (
                    <tr key={row.merchant}>
                      <td>{row.merchant}</td>
                      <td>{formatCurrency(row.spend, row.currency || expenseAnalysis.base_currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

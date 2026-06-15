export function CategorySpendReportSection({ model }: { model: any }) {
  const { BoxTitle, categorySpend, formatCount, formatCurrency, formatDateRange, reportCurrency } = model;

  return (
    <div className="panel">
      <BoxTitle title="Category spend" />
      <p className="muted">Personal spend totals show the supporting transaction date range for each category.</p>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Dates</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {categorySpend.map((row: any) => (
            <tr key={row.category}>
              <td>
                <div className="table-compact-title">{row.category}</div>
                <div className="table-compact-meta">{formatCount(row.transaction_count || 0)} transactions</div>
              </td>
              <td>{formatDateRange(row.start_date, row.end_date)}</td>
              <td>{formatCurrency(row.total, row.currency || reportCurrency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BusinessPnlReportSection({ model }: { model: any }) {
  const {
    BoxTitle,
    Fragment,
    RowDisclosureButton,
    businessPnl,
    expandedPnlMonth,
    formatCurrency,
    formatMonthYearLabel,
    reportCurrency,
    togglePnlDetails
  } = model;

  return (
    <div className="panel">
      <BoxTitle title="Business P&L" />
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Net</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {businessPnl.map((row: any) => {
            const monthKey = String(row.month);
            const isExpanded = expandedPnlMonth === monthKey;
            return (
              <Fragment key={row.month}>
                <tr>
                  <td>
                    <div className="table-compact-title">{formatMonthYearLabel(row.month)}</div>
                    <div className="table-compact-meta">{row.currency || reportCurrency}</div>
                  </td>
                  <td>{formatCurrency(row.net, row.currency || reportCurrency)}</td>
                  <td>
                    <RowDisclosureButton open={isExpanded} onClick={() => togglePnlDetails(monthKey)} />
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="table-detail-row">
                    <td colSpan={3}>
                      <div className="table-detail-grid">
                        <div className="table-detail-card">
                          <div className="table-detail-title">P&amp;L breakdown</div>
                          <div className="table-detail-copy">
                            <div>
                              <strong>Income:</strong> {formatCurrency(row.income, row.currency || reportCurrency)}
                            </div>
                            <div>
                              <strong>Expenses:</strong> {formatCurrency(row.expenses, row.currency || reportCurrency)}
                            </div>
                            <div>
                              <strong>Net:</strong> {formatCurrency(row.net, row.currency || reportCurrency)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

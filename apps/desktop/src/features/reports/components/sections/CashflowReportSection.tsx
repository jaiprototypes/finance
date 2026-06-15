export function CashflowReportSection({ model }: { model: any }) {
  const {
    BoxTitle,
    Fragment,
    RowDisclosureButton,
    cashflow,
    expandedCashflowMonth,
    formatCurrency,
    formatMonthYearLabel,
    reportCurrency,
    toggleCashflowDetails
  } = model;

  return (
    <div className="panel">
      <BoxTitle title="Personal cashflow" />
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Net</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {cashflow.map((row: any) => {
            const monthKey = String(row.month);
            const isExpanded = expandedCashflowMonth === monthKey;
            return (
              <Fragment key={`${row.month}-${row.currency || reportCurrency}`}>
                <tr>
                  <td>
                    <div className="table-compact-title">{formatMonthYearLabel(row.month)}</div>
                    <div className="table-compact-meta">{row.currency || reportCurrency}</div>
                  </td>
                  <td>{formatCurrency(row.net, row.currency)}</td>
                  <td>
                    <RowDisclosureButton open={isExpanded} onClick={() => toggleCashflowDetails(monthKey)} />
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="table-detail-row">
                    <td colSpan={3}>
                      <div className="table-detail-grid">
                        <div className="table-detail-card">
                          <div className="table-detail-title">Month breakdown</div>
                          <div className="table-detail-copy">
                            <div>
                              <strong>Personal inflow:</strong> {formatCurrency(row.inflow, row.currency)}
                            </div>
                            <div>
                              <strong>Personal outflow:</strong> {formatCurrency(row.outflow, row.currency)}
                            </div>
                            <div>
                              <strong>Personal net:</strong> {formatCurrency(row.net, row.currency)}
                            </div>
                            {(Number(row.business_inflow || 0) !== 0 || Number(row.business_outflow || 0) !== 0) && (
                              <>
                                <div>
                                  <strong>Business inflow:</strong> {formatCurrency(row.business_inflow, row.currency)}
                                </div>
                                <div>
                                  <strong>Business outflow:</strong> {formatCurrency(row.business_outflow, row.currency)}
                                </div>
                                <div>
                                  <strong>Business net:</strong> {formatCurrency(row.business_net, row.currency)}
                                </div>
                                <div>
                                  <strong>All checking net:</strong> {formatCurrency(row.total_net, row.currency)}
                                </div>
                              </>
                            )}
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

export function ForecastReportSection({ model }: { model: any }) {
  const { BoxTitle, forecast, formatCurrency, reportCurrency } = model;

  return (
    <div className="panel">
      <BoxTitle title="Cashflow forecast" />
      {forecast && (
        <>
          <p className="muted">
            Avg inflow: {formatCurrency(forecast.avg_inflow, forecast.base_currency)} · Avg outflow:{" "}
            {formatCurrency(forecast.avg_outflow, forecast.base_currency)}
          </p>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Inflow</th>
                <th>Outflow</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {(forecast.forecast || []).map((row: any) => (
                <tr key={`${row.month}-${row.currency || reportCurrency}`}>
                  <td>{row.month}</td>
                  <td>{formatCurrency(row.inflow, row.currency)}</td>
                  <td>{formatCurrency(row.outflow, row.currency)}</td>
                  <td>{formatCurrency(row.net, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function BusinessSummarySection({ model }: { model: any }) {
  const {
    BoxTitle,
    formatCount,
    formatCurrency,
    clients,
    invoices,
    activeClients,
    openInvoices,
    outstandingTotal,
    archivedInvoiceTotal,
    outstandingCurrencies,
    archiveCurrencies,
    businessSnapshotCurrency,
    invoiceStats,
    openClientCreator,
    openInvoiceComposer,
    openArchiveIntake,
    historicalOutstandingTotal,
    historicalCurrencies
  } = model;

  return (
      <div className="panel business-summary-panel">
        <div className="business-summary-head">
          <div>
            <BoxTitle title="Business snapshot" />
            <p className="panel-help">
              Keep daily attention on live receivables and active clients. Open the tools only when you need to add or repair records.
            </p>
          </div>
          <div className="business-summary-actions">
            <button className="button-ghost button-small" onClick={() => openInvoiceComposer()} type="button">
              New invoice
            </button>
            <button className="button-ghost button-small" onClick={openClientCreator} type="button">
              New client
            </button>
            <button className="button-ghost button-small" onClick={() => openArchiveIntake()} type="button">
              Import history
            </button>
          </div>
        </div>
        <div className="business-brand-inline">
          <img src={companyLogoSrc} alt="Invoice logo" />
          <div>
            <strong>Invoice branding ready</strong>
            <span>
              {usingCustomLogo ? "Custom logo active." : "Default logo active."} Exported invoices follow the company profile in Control Room.
            </span>
          </div>
        </div>
        <div className="grid kpi-grid">
          <div className="card kpi-card">
            <div className="kpi-label">Active clients</div>
            <div className="kpi-value">{formatCount(activeClients.length)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">Open invoices</div>
            <div className="kpi-value">{formatCount(openInvoices.length)}</div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">Live outstanding</div>
            <div className="kpi-value kpi-value-money">
              {formatCurrency(
                outstandingTotal,
                outstandingCurrencies.length === 1 ? outstandingCurrencies[0] : businessSnapshotCurrency
              )}
            </div>
          </div>
          <div className="card kpi-card">
            <div className="kpi-label">Historical outstanding</div>
            <div className="kpi-value kpi-value-money">
              {formatCurrency(
                historicalOutstandingTotal,
                historicalCurrencies.length === 1 ? historicalCurrencies[0] : businessSnapshotCurrency
              )}
            </div>
          </div>
        </div>
        <div className="business-summary-meta">
          <span>{formatCount(invoiceStats.archived)} historical docs</span>
          <span>
            Archive value{" "}
            {formatCurrency(
              archivedInvoiceTotal,
              archiveCurrencies.length === 1 ? archiveCurrencies[0] : businessSnapshotCurrency
            )}
          </span>
          <span>{formatCount(invoiceStats.overdue)} overdue live invoices</span>
        </div>
      </div>

  );
}

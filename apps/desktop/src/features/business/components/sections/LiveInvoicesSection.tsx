export function LiveInvoicesSection({ model }: { model: any }) {
  const {
    Fragment,
    BoxTitle,
    RowDisclosureButton,
    formatCount,
    formatCurrency,
    toDateValue,
    clients,
    invoices,
    paymentAmounts,
    setPaymentAmounts,
    invoiceRecipientEmails,
    setInvoiceRecipientEmails,
    invoiceNotice,
    invoiceSendError,
    showSettledInvoices,
    setShowSettledInvoices,
    expandedInvoiceId,
    invoicePreviewBusy,
    settledInvoices,
    displayedInvoices,
    applyPayment,
    downloadInvoicePdf,
    openInvoicePreview,
    startEditInvoice,
    deleteInvoice,
    updateInvoiceStatus,
    sendInvoice,
    incomingTransactions,
    toggleInvoiceDetails
  } = model;

  return (
      <div className="panel">
        <div className="panel-title-row">
          <div>
            <BoxTitle title="Live invoices" />
            <p className="panel-help">Open invoices stay visible by default. Settled invoices remain available for review.</p>
          </div>
          {settledInvoices.length > 0 && (
            <button
              className="button-ghost button-small"
              onClick={() => setShowSettledInvoices((current: boolean) => !current)}
              type="button"
            >
              {showSettledInvoices ? "Hide settled" : `Show settled (${settledInvoices.length})`}
            </button>
          )}
        </div>
        {invoiceNotice && <p className="muted">{invoiceNotice}</p>}
        {invoiceSendError && <p className="form-error">{invoiceSendError}</p>}
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Timing</th>
              <th>Balance</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {displayedInvoices.length === 0 && (
              <tr>
                <td colSpan={4}>
                  {invoices.length === 0
                    ? "No live invoices yet."
                    : "No open invoices. Settled invoices are hidden."}
                </td>
              </tr>
            )}
            {displayedInvoices.map((invoice: any) => {
              const client = clients.find((c: any) => c.id === invoice.client_id);
              const amountValue = paymentAmounts[invoice.id] ?? String(invoice.total);
              const isExpanded = expandedInvoiceId === invoice.id;
              const balanceDue = Number(invoice.balance_due ?? invoice.total ?? 0);
              const paidTotal = Number(invoice.paid_total ?? 0);
              const invoiceStatusLabel = invoice.is_overdue ? "overdue" : (invoice.status || "draft");
              const lifecycleStatus = invoice.status === "void" ? "void" : invoice.status === "draft" ? "draft" : "sent";
              return (
                <Fragment key={invoice.id}>
                  <tr>
                    <td>
                      <div className="table-compact-title">{invoice.number || `INV-${invoice.id}`}</div>
                      <div className="table-compact-meta">{client ? client.name : "Client record missing"}</div>
                    </td>
                    <td>
                      <div className="table-compact-title">Issued {toDateValue(invoice.issue_date) || "—"}</div>
                      <div className="table-compact-meta">Due {toDateValue(invoice.due_date) || "No due date"}</div>
                    </td>
                    <td>
                      <div className="table-status-stack">
                        <span className={`status-pill status-${String(invoiceStatusLabel).toLowerCase()}`}>
                          {invoiceStatusLabel}
                        </span>
                        <div className="table-compact-meta">
                          {formatCurrency(balanceDue, invoice.currency)} due of {formatCurrency(invoice.total, invoice.currency)}
                          {invoice.is_overdue ? ` · ${formatCount(invoice.days_overdue || 0)}d overdue` : ""}
                        </div>
                      </div>
                    </td>
                    <td>
                      <RowDisclosureButton open={isExpanded} onClick={() => toggleInvoiceDetails(invoice.id)} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="table-detail-row">
                      <td colSpan={4}>
                        <div className="table-detail-grid">
                          <div className="table-detail-card">
                            <div className="invoice-detail-head">
                              <div>
                                <div className="table-detail-title">Invoice controls</div>
                                <div className="invoice-detail-subtitle">{invoice.number || `INV-${invoice.id}`}</div>
                              </div>
                              <span className={`status-pill status-${String(invoiceStatusLabel).toLowerCase()}`}>
                                {invoiceStatusLabel}
                              </span>
                            </div>
                            <div className="invoice-control-grid">
                              <label className="invoice-control-field invoice-control-field-wide">
                                <span>Recipient</span>
                                <input
                                  className="invoice-send-input"
                                  placeholder="Recipient email"
                                  value={invoiceRecipientEmails[invoice.id] ?? String(client?.email || "")}
                                  onChange={(e) =>
                                    setInvoiceRecipientEmails((prev: Record<number, string>) => ({
                                      ...prev,
                                      [invoice.id]: e.target.value
                                    }))
                                  }
                                />
                              </label>
                              <label className="invoice-control-field">
                                <span>Lifecycle</span>
                                <select
                                  value={lifecycleStatus}
                                  onChange={(e) => updateInvoiceStatus(invoice.id, e.target.value)}
                                >
                                  <option value="draft">Draft</option>
                                  <option value="sent">Sent</option>
                                  <option value="void">Void</option>
                                </select>
                              </label>
                            </div>
                            <div className="invoice-action-toolbar">
                              <button
                                className="button-link"
                                onClick={() => openInvoicePreview(invoice)}
                                type="button"
                              >
                                {invoicePreviewBusy ? "Opening PDF…" : "Preview PDF"}
                              </button>
                              <button
                                className="button-ghost button-small"
                                onClick={() => downloadInvoicePdf(invoice)}
                                type="button"
                              >
                                Download
                              </button>
                              {lifecycleStatus === "draft" && (
                                <button className="button-ghost button-small" onClick={() => sendInvoice(invoice)} type="button">
                                  Send
                                </button>
                              )}
                              <button
                                className="button-ghost button-small"
                                onClick={() => startEditInvoice(invoice.id)}
                                type="button"
                              >
                                Edit
                              </button>
                              <button className="button-ghost button-small button-danger" onClick={() => deleteInvoice(invoice.id)} type="button">
                                Delete
                              </button>
                            </div>
                          </div>
                          <div className="table-detail-card">
                            <div className="invoice-detail-head">
                              <div>
                                <div className="table-detail-title">Payment matching</div>
                                <div className="invoice-detail-subtitle">{formatCurrency(balanceDue, invoice.currency)} open</div>
                              </div>
                            </div>
                            <div className="invoice-payment-row">
                              <label className="invoice-control-field">
                                <span>Amount</span>
                                <input
                                  className="invoice-payment-amount"
                                  placeholder="Amount"
                                  value={amountValue}
                                  onChange={(e) =>
                                    setPaymentAmounts((prev: Record<number, string>) => ({ ...prev, [invoice.id]: e.target.value }))
                                  }
                                />
                              </label>
                              <label className="invoice-control-field">
                                <span>Receipt</span>
                                <select
                                  className="invoice-payment-select"
                                  onChange={(e) => applyPayment(invoice.id, Number(e.target.value), Number(amountValue))}
                                  value=""
                                >
                                  <option value="">Apply payment</option>
                                  {incomingTransactions.map((txn: any) => (
                                    <option key={txn.id} value={txn.id}>
                                      {txn.date} {txn.account_name ? `${txn.account_name} · ` : ""}
                                      {txn.description} {formatCurrency(txn.amount, txn.currency)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <div className="invoice-payment-summary">
                              <div>
                                <span>Total</span>
                                <strong>{formatCurrency(invoice.total, invoice.currency)}</strong>
                              </div>
                              <div>
                                <span>Applied</span>
                                <strong>{formatCurrency(paidTotal, invoice.currency)}</strong>
                              </div>
                              <div>
                                <span>Balance</span>
                                <strong>{formatCurrency(balanceDue, invoice.currency)}</strong>
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

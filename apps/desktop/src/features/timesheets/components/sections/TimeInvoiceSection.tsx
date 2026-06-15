export function TimeInvoiceSection({ model }: { model: any }) {
  const {
    BoxTitle,
    activeClients,
    createInvoiceFromTime,
    createdInvoiceId,
    featureUrl,
    invoiceForm,
    setInvoiceForm,
    timeInvoiceError,
    timeInvoiceSuccess,
    toDateValue
  } = model;

  return (
    <div className="panel">
      <BoxTitle title="Invoice from time entries" />
      {timeInvoiceError && <p className="form-error">{timeInvoiceError}</p>}
      {timeInvoiceSuccess && (
        <div className="callout">
          <strong>{timeInvoiceSuccess}</strong>
          {createdInvoiceId && (
            <div>
              <a
                href={featureUrl(`/business/invoices/${createdInvoiceId}/pdf`)}
                target="_blank"
                rel="noreferrer"
              >
                Open invoice PDF
              </a>
            </div>
          )}
        </div>
      )}
      <div className="row">
        <select
          value={invoiceForm.client_id}
          onChange={(e) => setInvoiceForm({ ...invoiceForm, client_id: e.target.value })}
        >
          <option value="">Select client</option>
          {activeClients.map((client: any) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Invoice number (optional)"
          value={invoiceForm.number}
          onChange={(e) => setInvoiceForm({ ...invoiceForm, number: e.target.value })}
        />
        <input
          type="date"
          value={toDateValue(invoiceForm.issue_date)}
          onChange={(e) => setInvoiceForm({ ...invoiceForm, issue_date: e.target.value })}
        />
        <input
          type="date"
          value={toDateValue(invoiceForm.due_date)}
          onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
        />
        <select
          value={invoiceForm.currency}
          onChange={(e) => setInvoiceForm({ ...invoiceForm, currency: e.target.value })}
        >
          <option value="AUD">AUD</option>
          <option value="USD">USD</option>
        </select>
        <select
          value={invoiceForm.group_by}
          onChange={(e) => setInvoiceForm({ ...invoiceForm, group_by: e.target.value })}
        >
          <option value="day">Group by day</option>
          <option value="task">Group by task</option>
        </select>
        <button onClick={createInvoiceFromTime}>Create invoice</button>
      </div>
    </div>
  );
}

export function BusinessToolsSection({ model }: { model: any }) {
  const {
    BoxTitle,
    CollapsibleSection,
    InvoiceSheetPreview,
    formatCurrency,
    formatSignedCurrency,
    toDateValue,
    clients,
    invoices,
    editingClientId,
    editingInvoiceId,
    invoiceError,
    clientError,
    clientNotice,
    archiveError,
    archiveNotice,
    archivePickerKey,
    clientToolOpenToken,
    invoiceToolOpenToken,
    archiveIntakeOpenToken,
    invoicePreviewBusy,
    companyProfile,
    clientEditorRef,
    invoiceEditorRef,
    archiveIntakeRef,
    clientForm,
    setClientForm,
    invoiceForm,
    setInvoiceForm,
    archiveForm,
    setArchiveForm,
    lineItems,
    activeClients,
    draftInvoiceSubtotal,
    draftInvoiceTotal,
    draftInvoiceAdjustment,
    selectedInvoiceClient,
    editingInvoiceRecord,
    draftPreviewItems,
    draftPreviewNumber,
    clientToolSummary,
    invoiceToolSummary,
    archiveIntakeSummary,
    resetClientForm,
    resetInvoiceForm,
    resetArchiveForm,
    saveClient,
    addLineItem,
    updateLineItem,
    removeLineItem,
    saveInvoice,
    uploadArchive,
    openInvoicePreview
  } = model;

  return (
      <div className="panel">
        <BoxTitle title="Business tools" />
        <p className="panel-help">
          Create and repair records here when needed. The operating lists below stay focused on invoices, clients, and collections.
        </p>
        <div className="business-tool-stack">
          <CollapsibleSection
            title={editingInvoiceId ? "Edit live invoice" : "Create live invoice"}
            summary={invoiceToolSummary}
            defaultOpen={Boolean(editingInvoiceId)}
            autoOpenSignal={editingInvoiceId || invoiceToolOpenToken}
          >
            <div
              ref={invoiceEditorRef}
              className={`business-tool-card business-invoice-panel${editingInvoiceId ? " business-invoice-panel-editing" : ""}`}
            >
              {invoiceError && <p className="form-error">{invoiceError}</p>}
              <div className="invoice-compose-layout">
                <div className="invoice-compose-fields">
                  <div className="invoice-compose-summary">
                    <div>
                      <strong>
                        {editingInvoiceId
                          ? `Editing invoice ${invoiceForm.number.trim() || `#${editingInvoiceId}`}`
                          : "Unsaved invoice draft"}
                      </strong>
                      <p className="muted">
                        {editingInvoiceId
                          ? "Update the live invoice here, then save or cancel when you are done."
                          : "Keep the line-item subtotal for the work performed, then set an agreed total only when the payable amount is different."}
                      </p>
                    </div>
                    <div className="invoice-compose-total-stack">
                      <div className="invoice-compose-total-label">Total due</div>
                      <div className="invoice-compose-total">
                        {formatCurrency(draftInvoiceTotal, invoiceForm.currency || "USD")}
                      </div>
                    </div>
                  </div>
                  <div className="invoice-compose-grid">
                    <select
                      value={invoiceForm.client_id}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, client_id: e.target.value })}
                    >
                      <option value="">Select client</option>
                      {activeClients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Invoice number"
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
                      <option value="USD">USD</option>
                      <option value="AUD">AUD</option>
                    </select>
                    <select
                      value={invoiceForm.status}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, status: e.target.value })}
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                      <option value="void">Void</option>
                    </select>
                  </div>
                  <textarea
                    placeholder="Internal notes or payment terms"
                    value={invoiceForm.notes}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                    rows={3}
                  />
                  <div className="invoice-compose-amounts">
                    <div className="invoice-compose-amount">
                      <span>Line subtotal</span>
                      <strong>{formatCurrency(draftInvoiceSubtotal, invoiceForm.currency || "USD")}</strong>
                    </div>
                    <label className="invoice-compose-amount invoice-compose-amount-editable">
                      <span>Agreed total</span>
                      <input
                        placeholder="Use subtotal"
                        value={invoiceForm.agreed_total}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, agreed_total: e.target.value })}
                      />
                    </label>
                    {Math.abs(draftInvoiceAdjustment) > 0.005 && (
                      <div className="invoice-compose-amount">
                        <span>Adjustment</span>
                        <strong>{formatSignedCurrency(draftInvoiceAdjustment, invoiceForm.currency || "USD")}</strong>
                      </div>
                    )}
                    <div className="invoice-compose-amount invoice-compose-amount-final">
                      <span>Total due</span>
                      <strong>{formatCurrency(draftInvoiceTotal, invoiceForm.currency || "USD")}</strong>
                    </div>
                  </div>
                  <p className="muted">Leave agreed total blank to bill the full line-item subtotal.</p>
                  <div className="invoice-line-items">
                    <div className="invoice-line-items-head">
                      <strong>Line items</strong>
                      <button className="button-ghost button-small" onClick={addLineItem} type="button">
                        Add line item
                      </button>
                    </div>
                    {lineItems.map((item, idx) => (
                      <div className="invoice-line-item-row" key={`line-${idx}`}>
                        <input
                          className="invoice-line-item-description"
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                        />
                        <input
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(idx, "quantity", e.target.value)}
                        />
                        <input
                          placeholder="Unit price"
                          value={item.unit_price}
                          onChange={(e) => updateLineItem(idx, "unit_price", e.target.value)}
                        />
                        <button className="button-ghost button-small" onClick={() => removeLineItem(idx)} type="button">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="row">
                    <button onClick={saveInvoice}>{editingInvoiceId ? "Save invoice" : "Create invoice"}</button>
                    {editingInvoiceId && (
                      <button
                        className="button-link"
                        onClick={() =>
                          openInvoicePreview(editingInvoiceRecord || { id: editingInvoiceId, number: invoiceForm.number })
                        }
                        type="button"
                      >
                        {invoicePreviewBusy ? "Opening PDF…" : "Preview saved PDF"}
                      </button>
                    )}
                    {editingInvoiceId && (
                      <button className="button-ghost" onClick={resetInvoiceForm}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                <InvoiceSheetPreview
                  companyLogoSrc={companyLogoSrc}
                  companyProfile={companyProfile}
                  client={selectedInvoiceClient}
                  invoiceNumber={draftPreviewNumber}
                  issueDate={invoiceForm.issue_date}
                  dueDate={invoiceForm.due_date}
                  currency={invoiceForm.currency || "USD"}
                  status={invoiceForm.status || "draft"}
                  notes={invoiceForm.notes}
                  lineItems={draftPreviewItems}
                  subtotal={draftInvoiceSubtotal}
                  total={draftInvoiceTotal}
                  heading={editingInvoiceId ? "Invoice preview" : "Draft preview"}
                  subtitle="This updates live and matches the cleaned export layout."
                />
              </div>
            </div>
          </CollapsibleSection>
          <CollapsibleSection
            title={editingClientId ? "Edit client" : "Client record"}
            summary={clientToolSummary}
            defaultOpen={Boolean(editingClientId)}
            autoOpenSignal={editingClientId || clientToolOpenToken}
          >
            <div ref={clientEditorRef} className={`business-tool-card${editingClientId ? " business-client-panel-editing" : ""}`}>
              {clientError && <p className="form-error">{clientError}</p>}
              {clientNotice && <p className="form-notice">{clientNotice}</p>}
              {editingClientId && (
                <p className="muted business-editor-state">
                  Editing client {clientForm.name.trim() || `#${editingClientId}`}. Save or cancel here when you are done.
                </p>
              )}
              <div className="row">
                <input
                  placeholder="Client name"
                  value={clientForm.name}
                  onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                />
                <input
                  placeholder="Email"
                  value={clientForm.email}
                  onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                />
                <input
                  placeholder="Phone"
                  value={clientForm.phone}
                  onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                />
              </div>
              <div className="row">
                <input
                  placeholder="Address"
                  value={clientForm.address}
                  onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                />
              </div>
              <textarea
                placeholder="Notes"
                value={clientForm.notes}
                onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                rows={3}
              />
              <div className="row">
                <button onClick={saveClient}>{editingClientId ? "Save client" : "Add client"}</button>
                {editingClientId && (
                  <button className="button-ghost" onClick={resetClientForm}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </CollapsibleSection>
          <CollapsibleSection
            title="Historical invoice intake"
            summary={archiveIntakeSummary}
            defaultOpen={false}
            autoOpenSignal={archiveIntakeOpenToken}
          >
            <div ref={archiveIntakeRef} className="business-tool-card">
              {archiveError && <p className="form-error">{archiveError}</p>}
              {archiveNotice && <p className="muted">{archiveNotice}</p>}
              <div className="row">
                <select
                  value={archiveForm.client_id}
                  onChange={(e) =>
                    setArchiveForm({
                      ...archiveForm,
                      client_id: e.target.value,
                      client_name: e.target.value ? "" : archiveForm.client_name
                    })
                  }
                >
                  <option value="">Use PDF or new client</option>
                  {activeClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Or new client name"
                  value={archiveForm.client_name}
                  onChange={(e) =>
                    setArchiveForm({
                      ...archiveForm,
                      client_name: e.target.value,
                      client_id: e.target.value ? "" : archiveForm.client_id
                    })
                  }
                />
                <input
                  key={archivePickerKey}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) =>
                    setArchiveForm({ ...archiveForm, file: e.target.files && e.target.files[0] ? e.target.files[0] : null })
                  }
                />
              </div>
              <div className="row">
                <input
                  placeholder="Invoice number"
                  value={archiveForm.number}
                  onChange={(e) => setArchiveForm({ ...archiveForm, number: e.target.value })}
                />
                <input
                  type="date"
                  value={archiveForm.issue_date}
                  onChange={(e) => setArchiveForm({ ...archiveForm, issue_date: e.target.value })}
                />
                <input
                  type="date"
                  value={archiveForm.due_date}
                  onChange={(e) => setArchiveForm({ ...archiveForm, due_date: e.target.value })}
                />
                <select
                  value={archiveForm.currency}
                  onChange={(e) => setArchiveForm({ ...archiveForm, currency: e.target.value })}
                >
                  <option value="USD">USD</option>
                  <option value="AUD">AUD</option>
                </select>
                <input
                  placeholder="Total"
                  value={archiveForm.total}
                  onChange={(e) => setArchiveForm({ ...archiveForm, total: e.target.value })}
                />
                <select
                  value={archiveForm.status}
                  onChange={(e) => setArchiveForm({ ...archiveForm, status: e.target.value })}
                >
                  <option value="archived">Archived</option>
                  <option value="paid">Paid</option>
                  <option value="sent">Sent</option>
                  <option value="partial">Partial</option>
                  <option value="draft">Draft</option>
                  <option value="void">Void</option>
                </select>
              </div>
              <textarea
                placeholder="Notes"
                value={archiveForm.notes}
                onChange={(e) => setArchiveForm({ ...archiveForm, notes: e.target.value })}
                rows={3}
              />
              <p className="muted">Leave client, number, dates, or total blank to auto-fill them from the PDF when possible.</p>
              <div className="row">
                <button onClick={uploadArchive}>Import historical invoice</button>
                <button className="button-ghost" onClick={resetArchiveForm}>
                  Clear
                </button>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </div>

  );
}

export function BusinessView({ model }: { model: any }) {
  const {
    Fragment,
    featureUrl,
    BoxTitle,
    CollapsibleSection,
    InvoiceSheetPreview,
    RowDisclosureButton,
    SectionHeader,
    formatAmount,
    formatCount,
    formatCurrency,
    formatSignedCurrency,
    formatTimestampLabel,
    toDateValue,
    clients,
    invoices,
    editingClientId,
    editingInvoiceId,
    paymentAmounts,
    setPaymentAmounts,
    invoiceRecipientEmails,
    setInvoiceRecipientEmails,
    archivePaymentAmounts,
    setArchivePaymentAmounts,
    invoiceError,
    invoiceNotice,
    invoiceSendError,
    clientError,
    clientNotice,
    archiveError,
    archiveNotice,
    showArchivedClients,
    setShowArchivedClients,
    showSettledInvoices,
    setShowSettledInvoices,
    archivePickerKey,
    selectedArchiveId,
    setSelectedArchiveId,
    archiveDetail,
    archiveDetailLoading,
    archiveFilter,
    setArchiveFilter,
    expandedClientId,
    expandedInvoiceId,
    clientToolOpenToken,
    invoiceToolOpenToken,
    archiveIntakeOpenToken,
    invoicePreviewBusy,
    invoicePreview,
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
    visibleClients,
    activeClients,
    archivedClients,
    openInvoices,
    settledInvoices,
    displayedInvoices,
    outstandingTotal,
    archivedInvoiceTotal,
    outstandingCurrencies,
    archiveCurrencies,
    businessSnapshotCurrency,
    clientCurrentCounts,
    clientArchivedCounts,
    canDeleteClientRecord,
    draftInvoiceSubtotal,
    draftInvoiceTotal,
    draftInvoiceAdjustment,
    selectedInvoiceClient,
    editingInvoiceRecord,
    draftPreviewItems,
    draftPreviewNumber,
    invoiceStats,
    clientToolSummary,
    invoiceToolSummary,
    archiveIntakeSummary,
    resetClientForm,
    resetInvoiceForm,
    resetArchiveForm,
    openClientCreator,
    openInvoiceComposer,
    openArchiveIntake,
    syncArchiveDetail,
    archiveEditForm,
    setArchiveEditForm,
    saveClient,
    startEditClient,
    deleteClient,
    restoreClient,
    addLineItem,
    updateLineItem,
    removeLineItem,
    saveInvoice,
    uploadArchive,
    applyPayment,
    downloadInvoicePdf,
    closeInvoicePreview,
    openInvoicePreview,
    saveArchiveDetail,
    removeArchivePayment,
    applyArchivePayment,
    startEditInvoice,
    deleteInvoice,
    deleteArchive,
    updateInvoiceStatus,
    sendInvoice,
    clientById,
    incomingTransactions,
    historicalOutstandingTotal,
    historicalCurrencies,
    clientLiveBalance,
    clientHistoricalBalance,
    filteredArchivedInvoices,
    filteredArchivedOutstanding,
    archiveDetailStatusLabel,
    toggleClientDetails,
    toggleInvoiceDetails
  } = model;

  return (
    <div className="page">
      <SectionHeader
        title="Business"
        subtitle="Run client records, receivables, and historical invoice collections from one local workspace."
      />
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
      <div className="panel">
        <BoxTitle title="Client directory" />
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Activity</th>
              <th>Receivables</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {activeClients.length === 0 && (
              <tr>
                <td colSpan={4}>No active clients yet.</td>
              </tr>
            )}
            {activeClients.map((client) => {
              const isExpanded = expandedClientId === client.id;
              const liveCount = clientCurrentCounts[client.id] || 0;
              const archivedCount = clientArchivedCounts[client.id] || 0;
              const deleteLabel = canDeleteClientRecord(client.id) ? "Delete client" : "Archive client";
              const liveBalance = Number(clientLiveBalance[client.id] || 0);
              const archiveBalance = Number(clientHistoricalBalance[client.id] || 0);
              const totalBalance = liveBalance + archiveBalance;
              return (
                <Fragment key={client.id}>
                  <tr>
                    <td>
                      <div className="table-compact-title">{client.name}</div>
                      <div className="table-compact-meta">{client.email || client.phone || "No direct contact on file."}</div>
                    </td>
                    <td>
                      <div className="table-compact-title">
                        {formatCount(liveCount)} live · {formatCount(archivedCount)} archived
                      </div>
                      <div className="table-compact-meta">
                        {client.notes ? "Notes on file" : "No client notes"}
                      </div>
                    </td>
                    <td>
                      <div className="table-compact-title">{formatAmount(totalBalance)}</div>
                      <div className="table-compact-meta">
                        Live {formatAmount(liveBalance)} · Archive {formatAmount(archiveBalance)}
                      </div>
                    </td>
                    <td>
                      <RowDisclosureButton open={isExpanded} onClick={() => toggleClientDetails(client.id)} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="table-detail-row">
                      <td colSpan={4}>
                        <div className="table-detail-grid">
                          <div className="table-detail-card">
                            <div className="table-detail-title">Contact record</div>
                            <div className="table-detail-copy">
                              <div>
                                <strong>Email:</strong> {client.email || "—"}
                              </div>
                              <div>
                                <strong>Phone:</strong> {client.phone || "—"}
                              </div>
                              <div>
                                <strong>Address:</strong> {client.address || "—"}
                              </div>
                              <div>
                                <strong>Notes:</strong> {client.notes || "—"}
                              </div>
                            </div>
                          </div>
                          <div className="table-detail-card">
                            <div className="table-detail-title">Client actions</div>
                            <div className="row">
                              <button className="button-ghost button-small" onClick={() => startEditClient(client)}>
                                Edit
                              </button>
                              <button
                                className="button-ghost button-small"
                                onClick={() => openInvoiceComposer(client.id)}
                              >
                                New invoice
                              </button>
                              <button
                                className="button-ghost button-small"
                                onClick={() => openArchiveIntake(client.id)}
                              >
                                Import history
                              </button>
                              <button className="button-small" onClick={() => deleteClient(client.id)}>
                                {deleteLabel}
                              </button>
                            </div>
                            <div className="table-detail-copy">
                              <div>
                                <strong>Live receivables:</strong> {formatAmount(liveBalance)}
                              </div>
                              <div>
                                <strong>Historical balance:</strong> {formatAmount(archiveBalance)}
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
        {archivedClients.length > 0 && (
          <div className="archived-client-toggle">
            <button className="button-ghost" onClick={() => setShowArchivedClients(!showArchivedClients)}>
              {showArchivedClients ? "Hide archived clients" : `Show archived clients (${archivedClients.length})`}
            </button>
          </div>
        )}
        {showArchivedClients && archivedClients.length > 0 && (
          <div className="archived-client-list">
            <div className="table-detail-title">Archived clients</div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {archivedClients.map((client) => (
                  <tr key={`arch-${client.id}`}>
                    <td>{client.name}</td>
                    <td>{client.email || ""}</td>
                    <td>{client.phone || ""}</td>
                    <td>
                      <button className="button-ghost button-small" onClick={() => restoreClient(client)}>
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="panel">
        <div className="panel-title-row">
          <div>
            <BoxTitle title="Live invoices" />
            <p className="panel-help">Open invoices stay visible by default. Settled invoices remain available for review.</p>
          </div>
          {settledInvoices.length > 0 && (
            <button
              className="button-ghost button-small"
              onClick={() => setShowSettledInvoices((current) => !current)}
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
            {displayedInvoices.map((invoice) => {
              const client = clients.find((c) => c.id === invoice.client_id);
              const amountValue = paymentAmounts[invoice.id] ?? String(invoice.total);
              const isExpanded = expandedInvoiceId === invoice.id;
              const balanceDue = Number(invoice.balance_due ?? invoice.total ?? 0);
              const invoiceStatusLabel = invoice.is_overdue ? "overdue" : (invoice.status || "draft");
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
                            <div className="table-detail-title">Invoice controls</div>
                            <div className="row invoice-send-row">
                              <input
                                className="invoice-send-input"
                                placeholder="Recipient email"
                                value={invoiceRecipientEmails[invoice.id] ?? String(client?.email || "")}
                                onChange={(e) =>
                                  setInvoiceRecipientEmails((prev) => ({ ...prev, [invoice.id]: e.target.value }))
                                }
                              />
                            </div>
                            <div className="row invoice-action-row">
                              <select
                                value={invoice.status}
                                onChange={(e) => updateInvoiceStatus(invoice.id, e.target.value)}
                              >
                                <option value="draft">Draft</option>
                                <option value="sent">Sent</option>
                                <option value="partial">Partial</option>
                                <option value="paid">Paid</option>
                                <option value="void">Void</option>
                              </select>
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
                              {invoice.status === "draft" && (
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
                              <button className="button-small" onClick={() => deleteInvoice(invoice.id)} type="button">
                                Delete
                              </button>
                            </div>
                            <div className="table-detail-copy">
                              <div>
                                <strong>Email target:</strong> {String(invoiceRecipientEmails[invoice.id] ?? client?.email ?? "").trim() || "—"}
                              </div>
                              <div>
                                <strong>Issue date:</strong> {toDateValue(invoice.issue_date) || "—"}
                              </div>
                              <div>
                                <strong>Due date:</strong> {toDateValue(invoice.due_date) || "—"}
                              </div>
                              <div>
                                <strong>Line subtotal:</strong> {formatCurrency(invoice.subtotal, invoice.currency)}
                              </div>
                              {Math.abs(Number(invoice.adjustment || 0)) > 0.005 && (
                                <div>
                                  <strong>Adjustment:</strong> {formatSignedCurrency(invoice.adjustment, invoice.currency)}
                                </div>
                              )}
                              <div>
                                <strong>Notes:</strong> {invoice.notes || "—"}
                              </div>
                            </div>
                          </div>
                          <div className="table-detail-card">
                            <div className="table-detail-title">Payment matching</div>
                            <div className="invoice-payment-row">
                              <input
                                className="invoice-payment-amount"
                                placeholder="Amount"
                                value={amountValue}
                                onChange={(e) =>
                                  setPaymentAmounts((prev) => ({ ...prev, [invoice.id]: e.target.value }))
                                }
                              />
                              <select
                                className="invoice-payment-select"
                                onChange={(e) => applyPayment(invoice.id, Number(e.target.value), Number(amountValue))}
                                value=""
                              >
                                <option value="">Apply payment</option>
                                {incomingTransactions.map((txn) => (
                                  <option key={txn.id} value={txn.id}>
                                    {txn.date} {txn.account_name ? `${txn.account_name} · ` : ""}
                                    {txn.description} {formatCurrency(txn.amount, txn.currency)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="table-detail-copy">
                              <div>
                                <strong>Total due:</strong> {formatCurrency(invoice.total, invoice.currency)}
                              </div>
                              <div>
                                <strong>Balance due:</strong> {formatCurrency(balanceDue, invoice.currency)}
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
      <div className="panel">
        <BoxTitle title="Historical records" />
        <p className="panel-help">Keep older invoice PDFs and receipt reconciliation here so the main business view stays focused on current work.</p>
        <CollapsibleSection
          title="Historical invoice workspace"
          summary={`${formatCount(filteredArchivedInvoices.length)} records · ${formatAmount(filteredArchivedOutstanding)} open`}
          defaultOpen={false}
        >
          {archiveError && <p className="form-error">{archiveError}</p>}
          {archiveNotice && <p className="muted">{archiveNotice}</p>}
          <div className="archive-workspace">
            <div className="archive-queue">
              <div className="archive-queue-header">
                <strong>Historical invoices</strong>
                <div className="archive-queue-summary">
                  <span>{formatCount(filteredArchivedInvoices.length)} records</span>
                  <span>{formatAmount(filteredArchivedOutstanding)} open</span>
                </div>
                <input
                  placeholder="Filter invoices"
                  value={archiveFilter}
                  onChange={(e) => setArchiveFilter(e.target.value)}
                />
              </div>
              {filteredArchivedInvoices.length === 0 && (
                <div className="archive-empty">No historical invoices match the current filter.</div>
              )}
              {filteredArchivedInvoices.map((archive) => {
                const client = clientById.get(archive.client_id);
                const isActive = archive.id === selectedArchiveId;
                const archiveStatusLabel = archive.is_overdue ? "overdue" : (archive.status || "archived");
                return (
                  <button
                    key={archive.id}
                    type="button"
                    className={`archive-item${isActive ? " active" : ""}`}
                    onClick={() => setSelectedArchiveId(archive.id)}
                  >
                    <div className="archive-item-head">
                      <strong>{archive.number || archive.file_name}</strong>
                      <span className={`status-pill status-${String(archiveStatusLabel).toLowerCase()}`}>
                        {archiveStatusLabel}
                      </span>
                    </div>
                    <div className="archive-item-sub">{client?.name || `Client ${archive.client_id}`}</div>
                    <div className="archive-item-meta">
                      <span>{archive.issue_date || "No issue date"}</span>
                      <span>
                        Due {formatCurrency(archive.balance_due ?? archive.total, archive.currency)}
                        {archive.is_overdue ? ` · ${formatCount(archive.days_overdue || 0)}d overdue` : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="archive-detail">
              {archiveDetailLoading && <div className="archive-empty">Loading historical invoice…</div>}
              {!archiveDetailLoading && !archiveDetail && (
                <div className="archive-empty">Select a historical invoice to edit details and match receipts.</div>
              )}
              {!archiveDetailLoading && archiveDetail && (
                <Fragment>
                <div className="archive-detail-head">
                  <div>
                    <h3>{archiveDetail.invoice.number || archiveDetail.invoice.file_name}</h3>
                    <p className="muted">
                      {clientById.get(archiveDetail.invoice.client_id)?.name || `Client ${archiveDetail.invoice.client_id}`} ·{" "}
                      {archiveDetail.invoice.file_name}
                    </p>
                  </div>
                  <div className="archive-detail-actions">
                    <a
                      className="button-link"
                      href={featureUrl(`/business/invoice-archives/${archiveDetail.invoice.id}/download`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download PDF
                    </a>
                    <button className="button-small" onClick={() => deleteArchive(archiveDetail.invoice.id)}>
                      Delete
                    </button>
                  </div>
                </div>
                <CollapsibleSection
                  key={`archive-overview-${archiveDetail.invoice.id}`}
                  title="Overview"
                  summary={`${archiveDetailStatusLabel} · ${formatCurrency(
                    archiveDetail.balance_due,
                    archiveDetail.invoice.currency
                  )} open${archiveDetail.invoice.is_overdue ? ` · ${formatCount(archiveDetail.invoice.days_overdue || 0)}d overdue` : ""}`}
                  defaultOpen
                >
                  <div className="detail-grid">
                    <div className="card archive-summary-card">
                      <div className="metric-stack">
                        <div className="metric-row">
                          <strong>{formatCurrency(archiveDetail.invoice.total, archiveDetail.invoice.currency)}</strong>
                          <span>Total</span>
                        </div>
                        <div className="metric-row">
                          <strong>{formatCurrency(archiveDetail.paid_total, archiveDetail.invoice.currency)}</strong>
                          <span>Applied</span>
                        </div>
                        <div className="metric-row">
                          <strong>{formatCurrency(archiveDetail.balance_due, archiveDetail.invoice.currency)}</strong>
                          <span>Open balance</span>
                        </div>
                      </div>
                    </div>
                    <div className="card archive-summary-card">
                      <div className="table-detail-title">Reference</div>
                      <div className="table-detail-copy">
                        <div>
                          <strong>Client:</strong>{" "}
                          {clientById.get(archiveDetail.invoice.client_id)?.name || `Client ${archiveDetail.invoice.client_id}`}
                        </div>
                        <div>
                          <strong>Source:</strong> {archiveDetail.invoice.source_label}
                        </div>
                        <div>
                          <strong>Updated:</strong>{" "}
                          {formatTimestampLabel(archiveDetail.invoice.updated_at || archiveDetail.invoice.created_at)}
                        </div>
                        <div>
                          <strong>File:</strong> {archiveDetail.invoice.file_name}
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleSection>
                <CollapsibleSection
                  key={`archive-meta-${archiveDetail.invoice.id}`}
                  title="Invoice metadata"
                  summary={`${clientById.get(archiveDetail.invoice.client_id)?.name || "Client"} · ${
                    archiveDetail.invoice.number || archiveDetail.invoice.file_name
                  }`}
                  defaultOpen={false}
                >
                  <div className="card archive-edit-card">
                    <div className="archive-form-grid">
                      <select
                        value={archiveEditForm.client_id}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, client_id: e.target.value })}
                      >
                        <option value="">Select client</option>
                        {visibleClients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="Invoice number"
                        value={archiveEditForm.number}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, number: e.target.value })}
                      />
                      <input
                        type="date"
                        value={archiveEditForm.issue_date}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, issue_date: e.target.value })}
                      />
                      <input
                        type="date"
                        value={archiveEditForm.due_date}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, due_date: e.target.value })}
                      />
                      <select
                        value={archiveEditForm.currency}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, currency: e.target.value })}
                      >
                        <option value="USD">USD</option>
                        <option value="AUD">AUD</option>
                      </select>
                      <input
                        placeholder="Total"
                        value={archiveEditForm.total}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, total: e.target.value })}
                      />
                      <select
                        value={archiveEditForm.status}
                        onChange={(e) => setArchiveEditForm({ ...archiveEditForm, status: e.target.value })}
                      >
                        <option value="archived">Archived</option>
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="partial">Partial</option>
                        <option value="paid">Paid</option>
                        <option value="void">Void</option>
                      </select>
                    </div>
                    <textarea
                      placeholder="Notes"
                      value={archiveEditForm.notes}
                      onChange={(e) => setArchiveEditForm({ ...archiveEditForm, notes: e.target.value })}
                      rows={4}
                    />
                    <div className="row">
                      <button onClick={saveArchiveDetail}>Save historical invoice</button>
                      <button
                        className="button-ghost"
                        onClick={() => archiveDetail && setArchiveEditForm(syncArchiveDetail(archiveDetail))}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </CollapsibleSection>
                <CollapsibleSection
                  key={`archive-matched-${archiveDetail.invoice.id}`}
                  title="Matched receipts"
                  summary={`${formatCount(archiveDetail.payments.length)} linked · ${formatCurrency(
                    archiveDetail.paid_total,
                    archiveDetail.invoice.currency
                  )} applied`}
                  defaultOpen={archiveDetail.payments.length > 0}
                >
                  <div className="card">
                    {archiveDetail.payments.length === 0 && (
                      <div className="archive-empty">No receipts linked yet.</div>
                    )}
                    <div className="receipt-list">
                      {archiveDetail.payments.map((payment: any) => (
                        <div className="receipt-row" key={payment.id}>
                          <div className="receipt-copy">
                            <strong>{payment.transaction_date} · {formatCurrency(payment.amount, archiveDetail.invoice.currency)}</strong>
                            <div className="muted">
                              {payment.transaction_account_name ? `${payment.transaction_account_name} · ` : ""}
                              {payment.transaction_description}
                            </div>
                            <div className="receipt-meta-line">
                              Remaining on receipt: {formatCurrency(payment.transaction_available_amount, archiveDetail.invoice.currency)}
                            </div>
                          </div>
                          <button className="button-ghost button-small" onClick={() => removeArchivePayment(payment.id)}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CollapsibleSection>
                <CollapsibleSection
                  key={`archive-candidates-${archiveDetail.invoice.id}`}
                  title="Suggested receipts"
                  summary={
                    archiveDetail.candidate_transactions.length
                      ? `${formatCount(archiveDetail.candidate_transactions.length)} candidates ready to link`
                      : "No candidate receipts available"
                  }
                  defaultOpen={archiveDetail.payments.length === 0 && archiveDetail.candidate_transactions.length > 0}
                >
                  <div className="card">
                    {archiveDetail.candidate_transactions.length === 0 && (
                      <div className="archive-empty">No candidate receipts available.</div>
                    )}
                    <div className="receipt-list">
                      {archiveDetail.candidate_transactions.map((candidate: any) => (
                        <div className="receipt-row" key={candidate.id}>
                          <div className="receipt-copy">
                            <strong>
                              {candidate.date} · {formatCurrency(candidate.available_amount, candidate.currency)}
                            </strong>
                            <div className="muted">
                              {candidate.account_name ? `${candidate.account_name} · ` : ""}
                              {candidate.description}
                            </div>
                            <div className="receipt-meta-line">
                              {candidate.match_reason} · score {candidate.match_score}
                            </div>
                          </div>
                          <div className="receipt-actions">
                            <input
                              placeholder="Amount"
                              value={archivePaymentAmounts[candidate.id] ?? ""}
                              onChange={(e) =>
                                setArchivePaymentAmounts((prev) => ({ ...prev, [candidate.id]: e.target.value }))
                              }
                            />
                            <button className="button-small" onClick={() => applyArchivePayment(candidate.id)}>
                              Link receipt
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CollapsibleSection>
                </Fragment>
              )}
            </div>
          </div>
        </CollapsibleSection>
      </div>
      {invoicePreview && (
        <div className="modal-backdrop" onClick={closeInvoicePreview}>
          <div
            className="invoice-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${invoicePreview.title} PDF preview`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="invoice-preview-modal-head">
              <div>
                <strong>{invoicePreview.title}</strong>
                <p className="muted">Inline PDF review without downloading first.</p>
              </div>
              <div className="row">
                <a className="button-link" href={invoicePreview.url} download={invoicePreview.name}>
                  Download PDF
                </a>
                <button className="button-ghost button-small" onClick={closeInvoicePreview} type="button">
                  Close
                </button>
              </div>
            </div>
            <iframe className="invoice-preview-frame" src={invoicePreview.url} title={`${invoicePreview.title} PDF`} />
          </div>
        </div>
      )}
    </div>
  );
}

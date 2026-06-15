export function HistoricalRecordsSection({ model }: { model: any }) {
  const {
    Fragment,
    featureUrl,
    BoxTitle,
    CollapsibleSection,
    formatAmount,
    formatCount,
    formatCurrency,
    formatTimestampLabel,
    invoices,
    archivePaymentAmounts,
    setArchivePaymentAmounts,
    archiveError,
    archiveNotice,
    selectedArchiveId,
    setSelectedArchiveId,
    archiveDetail,
    archiveDetailLoading,
    archiveFilter,
    setArchiveFilter,
    visibleClients,
    syncArchiveDetail,
    archiveEditForm,
    setArchiveEditForm,
    saveArchiveDetail,
    removeArchivePayment,
    applyArchivePayment,
    deleteArchive,
    clientById,
    filteredArchivedInvoices,
    filteredArchivedOutstanding,
    archiveDetailStatusLabel
  } = model;

  return (
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
              {filteredArchivedInvoices.map((archive: any) => {
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
                        {visibleClients.map((client: any) => (
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
                                setArchivePaymentAmounts((prev: Record<number, string>) => ({ ...prev, [candidate.id]: e.target.value }))
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

  );
}

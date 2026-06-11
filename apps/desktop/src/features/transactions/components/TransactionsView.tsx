export function TransactionsView({ model }: { model: any }) {
  const {
    Fragment,
    sendFeatureCommand,
    featureUrl,
    BoxTitle,
    RowDisclosureButton,
    SectionHeader,
    formatAmount,
    formatCount,
    formatCurrency,
    toDateValue,
    transactions,
    accounts,
    categories,
    filters,
    setFilters,
    editingId,
    attachments,
    mergeForm,
    setMergeForm,
    splitInputs,
    txnError,
    txnAttempted,
    autoClassifyBusy,
    autoClassifyStatus,
    autoClassifyError,
    reviewBulkCategoryId,
    setReviewBulkCategoryId,
    reviewBulkBusy,
    reviewBulkStatus,
    reviewBulkError,
    registerPage,
    setRegisterPage,
    registerPageSize,
    setRegisterPageSize,
    expandedTransactionId,
    form,
    setForm,
    load,
    subcategoriesForCategory,
    formatSplitCategoryLabel,
    submit,
    startEdit,
    saveEdit,
    cancelEdit,
    deleteTxn,
    autoClassifyAll,
    classifyOne,
    updateSplitInput,
    submitSplit,
    deleteSplit,
    updateReconcile,
    loadAttachments,
    uploadAttachment,
    removeAttachment,
    mergeTransactions,
    reviewTransactions,
    reviewTotal,
    uncategorizedReviewTransactions,
    applyCategoryToReview,
    filtered,
    totalPages,
    startIndex,
    endIndex,
    pagedFiltered,
    summarizeTxnCategory,
    toggleTransactionDetails
  } = model;

  return (
    <div className="page">
      <SectionHeader title="Banking Inbox" subtitle="For review, match, categorize, and post transactions." />
      <div className="page-actions">
        <div>
          <strong>Auto-categorize</strong>
          <span className="muted">Run across {formatCount(transactions.length)} transactions.</span>
        </div>
        <button onClick={autoClassifyAll} disabled={autoClassifyBusy}>
          {autoClassifyBusy ? "Auto-categorizing…" : "Auto-categorize all"}
        </button>
      </div>
      {autoClassifyError && <p className="form-error">{autoClassifyError}</p>}
      {autoClassifyStatus && <p className="muted">{autoClassifyStatus}</p>}
      <div className="panel review-panel">
        <BoxTitle title="For review" />
        <div className="review-summary">
          <div>
            <strong>{formatCount(reviewTransactions.length)}</strong>
            <span className="muted">Waiting review</span>
          </div>
          <div>
            <strong>{formatAmount(reviewTotal)}</strong>
            <span className="muted">Total value</span>
          </div>
        </div>
        {categories.length > 0 && (
          <div className="row">
            <select
              value={reviewBulkCategoryId}
              onChange={(e) => setReviewBulkCategoryId(e.target.value)}
              disabled={reviewBulkBusy || uncategorizedReviewTransactions.length === 0}
            >
              <option value="">Apply one category to all uncategorized review items</option>
              {categories.map((cat) => (
                <option key={`review-bulk-${cat.id}`} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <button
              onClick={applyCategoryToReview}
              disabled={reviewBulkBusy || !reviewBulkCategoryId || uncategorizedReviewTransactions.length === 0}
            >
              {reviewBulkBusy
                ? "Applying…"
                : `Apply to ${formatCount(uncategorizedReviewTransactions.length)} uncategorized`}
            </button>
          </div>
        )}
        {reviewBulkError && <p className="form-error">{reviewBulkError}</p>}
        {reviewBulkStatus && <p className="muted">{reviewBulkStatus}</p>}
        {reviewTransactions.length === 0 ? (
          <p className="muted">All caught up. New imports will show here.</p>
        ) : (
          <div className="review-list">
            {reviewTransactions.map((txn) => {
              const suggested = (txn.splits || []).length > 0
                ? formatSplitCategoryLabel((txn.splits || [])[0])
                : "Uncategorized";
              return (
                <div key={`review-${txn.id}`} className="review-item">
                  <div className="review-main">
                    <div className="review-title">{txn.payee || txn.description}</div>
                    <div className="review-sub muted">
                      {txn.date} - {txn.account_name}
                    </div>
                    <div className="review-sub muted">Suggested: {suggested}</div>
                    {txn.classification_source && (
                      <div className="review-sub muted">
                        Source: {txn.classification_source}
                        {txn.classification_note ? ` · ${txn.classification_note}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="review-amount">{formatCurrency(txn.amount, txn.currency)}</div>
                  <div className="review-actions">
                    {categories.length > 0 && (
                      <div className="row">
                        <input
                          placeholder="Split amount"
                          value={splitInputs[txn.id]?.amount || ""}
                          onChange={(e) => updateSplitInput(txn.id, "amount", e.target.value)}
                        />
                        <select
                          value={splitInputs[txn.id]?.category_id || ""}
                          onChange={(e) => updateSplitInput(txn.id, "category_id", e.target.value)}
                        >
                          <option value="">Category</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                            ))}
                        </select>
                        <select
                          value={splitInputs[txn.id]?.subcategory_id || ""}
                          onChange={(e) => updateSplitInput(txn.id, "subcategory_id", e.target.value)}
                          disabled={!splitInputs[txn.id]?.category_id || Boolean(splitInputs[txn.id]?.subcategory_name)}
                        >
                          <option value="">Subcategory</option>
                          {subcategoriesForCategory(splitInputs[txn.id]?.category_id || "").map((subcategory: any) => (
                            <option key={`review-subcategory-${txn.id}-${subcategory.id}`} value={subcategory.id}>
                              {subcategory.name}
                            </option>
                          ))}
                        </select>
                        <input
                          placeholder="New subcategory"
                          value={splitInputs[txn.id]?.subcategory_name || ""}
                          onChange={(e) => updateSplitInput(txn.id, "subcategory_name", e.target.value)}
                          disabled={!splitInputs[txn.id]?.category_id}
                        />
                        <button onClick={() => submitSplit(txn)}>Split</button>
                      </div>
                    )}
                    <div className="row">
                      <button className="button-ghost" onClick={() => classifyOne(txn.id)}>
                        Auto-categorize
                      </button>
                      <button className="button-ghost" onClick={() => updateReconcile(txn.id, "verified")}>
                        Match
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="panel">
        <BoxTitle title={editingId ? "Edit transaction" : "Post transaction"} />
        {txnError && <p className="form-error">{txnError}</p>}
        <div className="row">
          <select
            className={txnAttempted && !form.account_id ? "field-error" : ""}
            value={form.account_id}
            onChange={(e) => setForm({ ...form, account_id: e.target.value })}
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </option>
            ))}
          </select>
          <input
            type="date"
            value={toDateValue(form.date)}
            className={txnAttempted && !form.date ? "field-error" : ""}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <input placeholder="Payee" value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} />
          <input
            placeholder="Description"
            value={form.description}
            className={txnAttempted && !form.description.trim() ? "field-error" : ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <input
            placeholder="Amount"
            value={form.amount}
            className={
              txnAttempted && (!form.amount || Number(form.amount) === 0 || Number.isNaN(Number(form.amount)))
                ? "field-error"
                : ""
            }
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            <option value="AUD">AUD</option>
            <option value="USD">USD</option>
          </select>
          <input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {editingId ? (
            <>
              <button onClick={saveEdit}>Save</button>
              <button onClick={cancelEdit}>Cancel</button>
            </>
          ) : (
            <button onClick={submit}>Create</button>
          )}
        </div>
      </div>
      <div className="panel">
        <BoxTitle title="Banking register" />
        <div className="row">
          <span className="muted">
            Showing {formatCount(startIndex)}-{formatCount(endIndex)} of {formatCount(filtered.length)}
          </span>
          <div className="row">
            <span className="muted">Rows</span>
            <select
              value={registerPageSize}
              onChange={(e) => setRegisterPageSize(Number(e.target.value))}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>
          <div className="row">
            <button
              className="button-ghost"
              onClick={() => setRegisterPage((page) => Math.max(1, page - 1))}
              disabled={registerPage <= 1}
            >
              Prev
            </button>
            <span className="muted">
              Page {formatCount(registerPage)} of {formatCount(totalPages)}
            </span>
            <button
              className="button-ghost"
              onClick={() => setRegisterPage((page) => Math.min(totalPages, page + 1))}
              disabled={registerPage >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
        <div className="row">
          <input
            placeholder="Search"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <select
            value={filters.account_id}
            onChange={(e) => setFilters({ ...filters, account_id: e.target.value })}
          >
            <option value="all">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <select
            value={filters.category_id}
            onChange={(e) => setFilters({ ...filters, category_id: e.target.value })}
          >
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry</th>
              <th>Account</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {pagedFiltered.map((txn) => {
              const isExpanded = expandedTransactionId === txn.id;
              return (
                <Fragment key={txn.id}>
                  <tr>
                    <td>{txn.date}</td>
                    <td>
                      <div className="table-compact-title">{txn.payee || txn.description}</div>
                      <div className="table-compact-meta">{txn.description}</div>
                    </td>
                    <td>{txn.account_name}</td>
                    <td>{formatCurrency(txn.amount, txn.currency)}</td>
                    <td>
                      <div className="table-status-stack">
                        <span className={`status-pill status-${String(txn.reconciliation_state || "imported").toLowerCase()}`}>
                          {txn.reconciliation_state || "imported"}
                        </span>
                        <div className="table-compact-meta">
                          {(txn.classification || "Personal")} · {summarizeTxnCategory(txn)}
                        </div>
                      </div>
                    </td>
                    <td>
                      <RowDisclosureButton open={isExpanded} onClick={() => toggleTransactionDetails(txn.id)} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="table-detail-row">
                      <td colSpan={6}>
                        <div className="table-detail-grid">
                          <div className="table-detail-card">
                            <div className="table-detail-title">Classification + register controls</div>
                            <div className="row">
                              <select
                                value={txn.classification || "Personal"}
                                onChange={(e) =>
                                  sendFeatureCommand(`/transactions/${txn.id}`, {
                                    classification: e.target.value
                                  }).then(load)
                                }
                              >
                                <option value="Personal">Personal</option>
                                <option value="Business">Business</option>
                                <option value="Split">Split</option>
                              </select>
                              <select
                                value={txn.reconciliation_state || "imported"}
                                onChange={(e) => updateReconcile(txn.id, e.target.value)}
                              >
                                <option value="imported">Imported</option>
                                <option value="pending">Pending</option>
                                <option value="cleared">Cleared</option>
                                <option value="verified">Verified</option>
                              </select>
                              <button onClick={() => classifyOne(txn.id)}>Classify</button>
                              <button className="button-ghost" onClick={() => startEdit(txn)}>Edit</button>
                              <button onClick={() => deleteTxn(txn.id)}>Delete</button>
                            </div>
                            {(txn.classification_source || txn.classification_note || txn.notes) && (
                              <div className="table-detail-copy">
                                {txn.classification_source && (
                                  <div className="muted">
                                    Source: {txn.classification_source}
                                    {txn.classification_note ? ` · ${txn.classification_note}` : ""}
                                  </div>
                                )}
                                {txn.notes && <div className="muted">Notes: {txn.notes}</div>}
                              </div>
                            )}
                            <div className="table-detail-copy">
                              {(txn.splits || []).length > 0 ? (
                                (txn.splits || []).map((split: any, idx: number) => (
                                  <div key={`${txn.id}-split-${idx}`} className="row">
                                    <span>
                                      {formatSplitCategoryLabel(split)} (
                                      {formatCurrency(split.amount, split.currency || txn.currency)})
                                    </span>
                                    {split.split_id && (
                                      <button onClick={() => deleteSplit(split.split_id)}>Remove</button>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <div className="muted">No category splits yet.</div>
                              )}
                            </div>
                            {categories.length > 0 && (
                              <div className="row">
                                <input
                                  placeholder="Split amount"
                                  value={splitInputs[txn.id]?.amount || ""}
                                  onChange={(e) => updateSplitInput(txn.id, "amount", e.target.value)}
                                />
                                <select
                                  value={splitInputs[txn.id]?.category_id || ""}
                                  onChange={(e) => updateSplitInput(txn.id, "category_id", e.target.value)}
                                >
                                  <option value="">Category</option>
                                  {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                      {cat.name}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={splitInputs[txn.id]?.subcategory_id || ""}
                                  onChange={(e) => updateSplitInput(txn.id, "subcategory_id", e.target.value)}
                                  disabled={!splitInputs[txn.id]?.category_id || Boolean(splitInputs[txn.id]?.subcategory_name)}
                                >
                                  <option value="">Subcategory</option>
                                  {subcategoriesForCategory(splitInputs[txn.id]?.category_id || "").map((subcategory: any) => (
                                    <option key={`register-subcategory-${txn.id}-${subcategory.id}`} value={subcategory.id}>
                                      {subcategory.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  placeholder="New subcategory"
                                  value={splitInputs[txn.id]?.subcategory_name || ""}
                                  onChange={(e) => updateSplitInput(txn.id, "subcategory_name", e.target.value)}
                                  disabled={!splitInputs[txn.id]?.category_id}
                                />
                                <button onClick={() => submitSplit(txn)}>Add split</button>
                              </div>
                            )}
                          </div>
                          <div className="table-detail-card">
                            <div className="table-detail-title">Attachments</div>
                            <div className="row">
                              <input
                                type="file"
                                onChange={(e) => uploadAttachment(txn.id, e.target.files?.[0] || null)}
                              />
                              <button className="button-ghost" onClick={() => loadAttachments(txn.id)}>Refresh</button>
                            </div>
                            <div className="table-detail-copy">
                              {(attachments[txn.id] || []).length === 0 ? (
                                <div className="muted">No attachments on this transaction.</div>
                              ) : (
                                (attachments[txn.id] || []).map((attachment: any) => (
                                  <div key={`att-${attachment.id}`} className="row">
                                    <a
                                      href={featureUrl(`/transactions/attachments/${attachment.id}/download`)}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {attachment.file_name || `Attachment ${attachment.id}`}
                                    </a>
                                    <button onClick={() => removeAttachment(txn.id, attachment.id)}>Remove</button>
                                  </div>
                                ))
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
      <div className="panel">
        <BoxTitle title="Merge duplicates" />
        <div className="row">
          <input
            placeholder="Primary transaction ID"
            value={mergeForm.primary_id}
            onChange={(e) => setMergeForm({ ...mergeForm, primary_id: e.target.value })}
          />
          <input
            placeholder="Duplicate transaction ID"
            value={mergeForm.duplicate_id}
            onChange={(e) => setMergeForm({ ...mergeForm, duplicate_id: e.target.value })}
          />
          <button onClick={mergeTransactions}>Merge</button>
        </div>
      </div>
    </div>
  );
}

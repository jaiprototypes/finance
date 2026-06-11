export function TransactionRegisterSection({ model }: { model: any }) {
  const {
    BoxTitle,
    Fragment,
    RowDisclosureButton,
    accounts,
    attachments,
    categories,
    deleteSplit,
    deleteTxn,
    expandedTransactionId,
    featureUrl,
    filtered,
    filters,
    formatCount,
    formatCurrency,
    formatSplitCategoryLabel,
    load,
    loadAttachments,
    mergeForm,
    pagedFiltered,
    registerPage,
    registerPageSize,
    removeAttachment,
    sendFeatureCommand,
    setFilters,
    setRegisterPage,
    setRegisterPageSize,
    splitInputs,
    startEdit,
    startIndex,
    endIndex,
    submitSplit,
    summarizeTxnCategory,
    toggleTransactionDetails,
    totalPages,
    updateReconcile,
    updateSplitInput,
    uploadAttachment
  } = model;

  return (
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
            onClick={() => setRegisterPage((page: number) => Math.max(1, page - 1))}
            disabled={registerPage <= 1}
          >
            Prev
          </button>
          <span className="muted">
            Page {formatCount(registerPage)} of {formatCount(totalPages)}
          </span>
          <button
            className="button-ghost"
            onClick={() => setRegisterPage((page: number) => Math.min(totalPages, page + 1))}
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
          {accounts.map((account: any) => (
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
          {categories.map((cat: any) => (
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
          {pagedFiltered.map((txn: any) => {
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
                            <button onClick={() => model.classifyOne(txn.id)}>Classify</button>
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
                                {categories.map((cat: any) => (
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
                                {model.subcategoriesForCategory(splitInputs[txn.id]?.category_id || "").map((subcategory: any) => (
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
  );
}

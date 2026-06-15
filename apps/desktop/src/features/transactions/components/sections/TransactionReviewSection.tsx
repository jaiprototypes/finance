export function TransactionReviewSection({ model }: { model: any }) {
  const {
    BoxTitle,
    categories,
    classifyOne,
    formatAmount,
    formatCount,
    formatCurrency,
    formatSplitCategoryLabel,
    reviewBulkBusy,
    reviewBulkCategoryId,
    reviewBulkError,
    reviewBulkStatus,
    reviewTotal,
    reviewTransactions,
    setReviewBulkCategoryId,
    splitInputs,
    submitSplit,
    uncategorizedReviewTransactions,
    updateReconcile,
    updateSplitInput,
    applyCategoryToReview
  } = model;

  return (
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
            {categories.map((cat: any) => (
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
              ? "Applying..."
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
          {reviewTransactions.map((txn: any) => {
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
  );
}

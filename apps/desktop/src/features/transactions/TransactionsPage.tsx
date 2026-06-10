import React, { Fragment, useEffect, useRef, useState } from "react";
import { API_BASE, apiDelete, apiGet, apiGetBlob, apiPost, apiPostForm, apiUrl, downloadDiagnostics, saveBlob, uploadTransactionAttachment } from "./api";
import {
  BoxTitle,
  CollapsibleSection,
  DEFAULT_LOCAL_AI_BASE_URL,
  DEFAULT_LOCAL_AI_MODEL,
  DEFAULT_LOCAL_AI_TIMEOUT_SECONDS,
  EMPTY_INVOICE_PREVIEW_PROFILE,
  InvoiceSheetPreview,
  MATRIX_BREAKDOWN_COLORS,
  PLAID_REFRESH_EVENT_KEY,
  RowDisclosureButton,
  SectionHeader,
  WorkspaceInsightCard,
  buildConicGradient,
  clearPendingPlaidLinkSession,
  currentMonthLabel,
  formatAmount,
  formatCompactCurrency,
  formatCount,
  formatCurrency,
  formatDuration,
  formatFileSize,
  formatHours,
  formatMonthLabel,
  formatMonthYearLabel,
  formatPlaidLinkExitError,
  formatRemainingSummary,
  formatSignedCurrency,
  formatTimestampLabel,
  isClosedReceivableStatus,
  loadPlaidScript,
  monthStateLabel,
  normalizeLlmSettings,
  notifyPlaidRefresh,
  renderMatrixMoney,
  savePendingPlaidLinkSession,
  toDateValue,
  toDatetimeLocal,
  toLogoSrc,
  todayDate,
  weekStartLabel
} from "../../shared/financeUi";
import type { InvoicePreviewProfile, LlmSettings } from "../../shared/financeUi";

export function Transactions({
  accountFocus,
  onConsumeAccountFocus
}: {
  accountFocus: string;
  onConsumeAccountFocus: () => void;
}) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filters, setFilters] = useState({ search: "", account_id: "all", category_id: "all" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<Record<number, any[]>>({});
  const [mergeForm, setMergeForm] = useState({ primary_id: "", duplicate_id: "" });
  const [splitInputs, setSplitInputs] = useState<
    Record<number, { category_id: string; subcategory_id: string; subcategory_name: string; amount: string }>
  >({});
  const [txnError, setTxnError] = useState<string | null>(null);
  const [txnAttempted, setTxnAttempted] = useState(false);
  const [autoClassifyBusy, setAutoClassifyBusy] = useState(false);
  const [autoClassifyStatus, setAutoClassifyStatus] = useState<string | null>(null);
  const [autoClassifyError, setAutoClassifyError] = useState<string | null>(null);
  const [reviewBulkCategoryId, setReviewBulkCategoryId] = useState("");
  const [reviewBulkBusy, setReviewBulkBusy] = useState(false);
  const [reviewBulkStatus, setReviewBulkStatus] = useState<string | null>(null);
  const [reviewBulkError, setReviewBulkError] = useState<string | null>(null);
  const [registerPage, setRegisterPage] = useState(1);
  const [registerPageSize, setRegisterPageSize] = useState(50);
  const [expandedTransactionId, setExpandedTransactionId] = useState<number | null>(null);
  const [form, setForm] = useState({
    account_id: "",
    date: "",
    description: "",
    amount: "",
    currency: "AUD",
    payee: "",
    notes: ""
  });

  const load = async () => {
    const [txns, accs, cats] = await Promise.all([
      apiGet<any[]>("/transactions/details"),
      apiGet<any[]>("/accounts"),
      apiGet<any[]>("/categories")
    ]);
    setTransactions(txns);
    setAccounts(accs);
    setCategories(cats);
  };

  const subcategoriesForCategory = (categoryId: string) => {
    const selected = categories.find((category) => String(category.id) === categoryId);
    return selected?.subcategories || [];
  };

  const formatSplitCategoryLabel = (split: any) =>
    split.subcategory_name
      ? `${split.category_name || "Uncategorized"} / ${split.subcategory_name}`
      : split.category_name || "Uncategorized";

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!accountFocus) return;
    setFilters((prev) => ({ ...prev, account_id: accountFocus }));
    onConsumeAccountFocus();
  }, [accountFocus, onConsumeAccountFocus]);

  useEffect(() => {
    setRegisterPage(1);
  }, [filters.search, filters.account_id, filters.category_id, registerPageSize]);

  const submit = async () => {
    setTxnAttempted(true);
    setTxnError(null);
    if (!form.account_id) {
      setTxnError("Select an account.");
      return;
    }
    if (!form.date) {
      setTxnError("Date is required.");
      return;
    }
    if (!form.description.trim()) {
      setTxnError("Description is required.");
      return;
    }
    const amountValue = Number(form.amount);
    if (!Number.isFinite(amountValue) || amountValue === 0) {
      setTxnError("Amount must be a non-zero number.");
      return;
    }
    try {
      await apiPost("/transactions", {
        account_id: Number(form.account_id),
        date: form.date,
        description: form.description,
        amount: amountValue,
        currency: form.currency,
        payee: form.payee || undefined,
        notes: form.notes || undefined
      });
      setForm({ account_id: "", date: "", description: "", amount: "", currency: "AUD", payee: "", notes: "" });
      setTxnAttempted(false);
      load();
    } catch (err) {
      setTxnError(err instanceof Error ? err.message : "Unable to save transaction.");
    }
  };

  const startEdit = (txn: any) => {
    setEditingId(txn.id);
    setForm({
      account_id: String(txn.account_id),
      date: txn.date,
      description: txn.description,
      amount: String(txn.amount),
      currency: txn.currency,
      payee: txn.payee || "",
      notes: txn.notes || ""
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setTxnAttempted(true);
    setTxnError(null);
    if (!form.account_id) {
      setTxnError("Select an account.");
      return;
    }
    if (!form.date) {
      setTxnError("Date is required.");
      return;
    }
    if (!form.description.trim()) {
      setTxnError("Description is required.");
      return;
    }
    const amountValue = Number(form.amount);
    if (!Number.isFinite(amountValue) || amountValue === 0) {
      setTxnError("Amount must be a non-zero number.");
      return;
    }
    try {
      await apiPost(`/transactions/${editingId}`, {
        account_id: Number(form.account_id),
        date: form.date,
        description: form.description,
        amount: amountValue,
        currency: form.currency,
        payee: form.payee || undefined,
        notes: form.notes || undefined
      });
      setEditingId(null);
      setForm({ account_id: "", date: "", description: "", amount: "", currency: "AUD", payee: "", notes: "" });
      setTxnAttempted(false);
      load();
    } catch (err) {
      setTxnError(err instanceof Error ? err.message : "Unable to update transaction.");
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ account_id: "", date: "", description: "", amount: "", currency: "AUD", payee: "", notes: "" });
    setTxnAttempted(false);
    setTxnError(null);
  };

  const deleteTxn = async (txnId: number) => {
    await apiDelete(`/transactions/${txnId}`);
    load();
  };

  const autoClassifyAll = async () => {
    setAutoClassifyError(null);
    setAutoClassifyStatus(null);
    setAutoClassifyBusy(true);
    try {
      const targetIds = transactions
        .filter((txn) => !txn.splits || txn.splits.length === 0)
        .map((txn) => txn.id);
      const hasUncategorized = targetIds.length > 0;
      const batchSize = 200;
      let totalClassified = 0;
      let totalErrors = 0;
      if (hasUncategorized) {
        for (let i = 0; i < targetIds.length; i += batchSize) {
          const batch = targetIds.slice(i, i + batchSize);
          const result = await apiPost<any>("/classify/bulk", { transaction_ids: batch, force: false });
          totalClassified += Number(result?.classified || 0);
          if (Array.isArray(result?.errors)) {
            totalErrors += result.errors.length;
          }
          const progress = formatCount(Math.min(i + batch.length, targetIds.length));
          const total = formatCount(targetIds.length);
          const suffix = totalErrors ? ` · ${formatCount(totalErrors)} errors` : "";
          setAutoClassifyStatus(`Auto-categorized ${progress} of ${total}${suffix}.`);
        }
      } else {
        setAutoClassifyStatus("No uncategorized transactions found.");
      }
      const verifyResult = await apiPost<any>("/transactions/verify-categorized", {});
      const verifiedCount = Number(verifyResult?.updated || 0);
      const statusParts: string[] = [];
      if (hasUncategorized) {
        statusParts.push(`Auto-categorized ${formatCount(totalClassified)} transactions`);
        if (totalErrors) {
          statusParts.push(`${formatCount(totalErrors)} errors`);
        }
      } else {
        statusParts.push("No uncategorized transactions found");
      }
      if (verifiedCount) {
        statusParts.push(`Verified ${formatCount(verifiedCount)} categorized transactions`);
      }
      setAutoClassifyStatus(`${statusParts.join(" · ")}.`);
    } catch (err) {
      setAutoClassifyError(err instanceof Error ? err.message : "Auto-categorize failed.");
    } finally {
      setAutoClassifyBusy(false);
      load();
    }
  };

  const classifyOne = async (transactionId: number) => {
    await apiPost(`/classify/transactions/${transactionId}`);
    load();
  };

  const addSplit = async (
    transactionId: number,
    categoryId: number,
    amount: number,
    currency: string,
    subcategoryId?: number | null,
    subcategoryName?: string,
    options?: { reload?: boolean }
  ) => {
    await apiPost(`/transactions/${transactionId}/splits`, {
      transaction_id: transactionId,
      category_id: categoryId,
      subcategory_id: subcategoryId || undefined,
      subcategory_name: subcategoryName?.trim() || undefined,
      amount,
      currency,
      classification: "Personal"
    });
    if (options?.reload !== false) {
      load();
    }
  };

  const updateSplitInput = (
    transactionId: number,
    field: "category_id" | "subcategory_id" | "subcategory_name" | "amount",
    value: string
  ) => {
    setSplitInputs((prev) => ({
      ...prev,
      [transactionId]: (() => {
        const current = {
          category_id: prev[transactionId]?.category_id || "",
          subcategory_id: prev[transactionId]?.subcategory_id || "",
          subcategory_name: prev[transactionId]?.subcategory_name || "",
          amount: prev[transactionId]?.amount || ""
        };
        if (field === "category_id") {
          return { ...current, category_id: value, subcategory_id: "", subcategory_name: "" };
        }
        if (field === "subcategory_name") {
          return { ...current, subcategory_name: value, subcategory_id: value ? "" : current.subcategory_id };
        }
        return { ...current, [field]: value };
      })()
    }));
  };

  const submitSplit = async (txn: any) => {
    const input = splitInputs[txn.id];
    if (!input?.category_id) return;
    const amount = input.amount ? Number(input.amount) : Number(txn.amount);
    await addSplit(
      txn.id,
      Number(input.category_id),
      amount,
      txn.currency,
      input.subcategory_name.trim() ? undefined : (input.subcategory_id ? Number(input.subcategory_id) : undefined),
      input.subcategory_name
    );
    setSplitInputs((prev) => ({
      ...prev,
      [txn.id]: { category_id: "", subcategory_id: "", subcategory_name: "", amount: "" }
    }));
  };

  const deleteSplit = async (splitId: number) => {
    await apiDelete(`/transactions/splits/${splitId}`);
    load();
  };

  const updateReconcile = async (transactionId: number, state: string) => {
    await apiPost(`/transactions/${transactionId}/reconcile`, { reconciliation_state: state });
    load();
  };

  const loadAttachments = async (transactionId: number) => {
    const data = await apiGet<any[]>(`/transactions/${transactionId}/attachments`);
    setAttachments((prev) => ({ ...prev, [transactionId]: data }));
  };

  const uploadAttachment = async (transactionId: number, file: File | null) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    await uploadTransactionAttachment(transactionId, formData);
    await loadAttachments(transactionId);
  };

  const removeAttachment = async (transactionId: number, attachmentId: number) => {
    await apiDelete(`/transactions/attachments/${attachmentId}`);
    await loadAttachments(transactionId);
  };

  const mergeTransactions = async () => {
    if (!mergeForm.primary_id || !mergeForm.duplicate_id) return;
    await apiPost("/transactions/merge", {
      primary_id: Number(mergeForm.primary_id),
      duplicate_id: Number(mergeForm.duplicate_id)
    });
    setMergeForm({ primary_id: "", duplicate_id: "" });
    load();
  };

  const reviewTransactions = transactions.filter((txn) =>
    ["pending", "imported"].includes(txn.reconciliation_state || "imported")
  );
  const reviewTotal = reviewTransactions.reduce((sum, txn) => sum + Number(txn.amount || 0), 0);
  const uncategorizedReviewTransactions = reviewTransactions.filter((txn) => !txn.splits || txn.splits.length === 0);

  const applyCategoryToReview = async () => {
    setReviewBulkError(null);
    setReviewBulkStatus(null);
    if (!reviewBulkCategoryId) {
      setReviewBulkError("Select a category to apply across the review box.");
      return;
    }
    const targetTransactions = uncategorizedReviewTransactions;
    if (targetTransactions.length === 0) {
      setReviewBulkStatus("No uncategorized review transactions found.");
      return;
    }
    setReviewBulkBusy(true);
    try {
      let applied = 0;
      let errors = 0;
      const categoryId = Number(reviewBulkCategoryId);
      for (const txn of targetTransactions) {
        try {
          await addSplit(txn.id, categoryId, Number(txn.amount), txn.currency, undefined, undefined, { reload: false });
          applied += 1;
        } catch (_err) {
          errors += 1;
        }
      }
      const skipped = reviewTransactions.length - targetTransactions.length;
      const parts = [`Applied to ${formatCount(applied)} transactions`];
      if (skipped > 0) {
        parts.push(`Skipped ${formatCount(skipped)} already categorized`);
      }
      if (errors > 0) {
        parts.push(`${formatCount(errors)} errors`);
      }
      setReviewBulkStatus(`${parts.join(" · ")}.`);
      setReviewBulkCategoryId("");
    } catch (err) {
      setReviewBulkError(err instanceof Error ? err.message : "Unable to apply category across review transactions.");
    } finally {
      setReviewBulkBusy(false);
      load();
    }
  };

  const filtered = transactions.filter((txn) => {
    const matchesSearch =
      !filters.search ||
      `${txn.description} ${txn.payee || ""}`.toLowerCase().includes(filters.search.toLowerCase());
    const matchesAccount =
      filters.account_id === "all" || String(txn.account_id) === filters.account_id;
    const matchesCategory =
      filters.category_id === "all" ||
      (txn.splits || []).some((split: any) => String(split.category_id) === filters.category_id);
    return matchesSearch && matchesAccount && matchesCategory;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / registerPageSize));
  useEffect(() => {
    if (registerPage > totalPages) {
      setRegisterPage(totalPages);
    }
  }, [registerPage, totalPages]);
  const startIndex = filtered.length === 0 ? 0 : (registerPage - 1) * registerPageSize + 1;
  const endIndex = Math.min(registerPage * registerPageSize, filtered.length);
  const pagedFiltered = filtered.slice((registerPage - 1) * registerPageSize, registerPage * registerPageSize);
  const summarizeTxnCategory = (txn: any) => {
    const splits = txn.splits || [];
    if (!splits.length) return "Uncategorized";
    if (splits.length === 1) return formatSplitCategoryLabel(splits[0]);
    return `${formatSplitCategoryLabel(splits[0])} +${formatCount(splits.length - 1)}`;
  };
  const toggleTransactionDetails = async (txnId: number) => {
    if (expandedTransactionId === txnId) {
      setExpandedTransactionId(null);
      return;
    }
    setExpandedTransactionId(txnId);
    await loadAttachments(txnId).catch(() => undefined);
  };

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
                                  apiPost(`/transactions/${txn.id}`, {
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
                                      href={apiUrl(`/transactions/attachments/${attachment.id}/download`)}
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

import React, { Fragment, useEffect, useRef, useState } from "react";
import { removeFeatureRecord, getFeatureData, sendFeatureCommand, featureUrl, uploadTransactionAttachment } from "../api";
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
} from "../../../shared/financeUi";
import type { InvoicePreviewProfile, LlmSettings } from "../../../shared/financeUi";

export type TransactionsWorkspaceProps = {
  accountFocus: string;
  onConsumeAccountFocus: () => void;
};

export function useTransactionsWorkspace({
  accountFocus,
  onConsumeAccountFocus
}: TransactionsWorkspaceProps) {
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
      getFeatureData<any[]>("/transactions/details"),
      getFeatureData<any[]>("/accounts"),
      getFeatureData<any[]>("/categories")
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
      await sendFeatureCommand("/transactions", {
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
      await sendFeatureCommand(`/transactions/${editingId}`, {
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
    await removeFeatureRecord(`/transactions/${txnId}`);
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
          const result = await sendFeatureCommand<any>("/classify/bulk", { transaction_ids: batch, force: false });
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
      const verifyResult = await sendFeatureCommand<any>("/transactions/verify-categorized", {});
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
    await sendFeatureCommand(`/classify/transactions/${transactionId}`);
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
    await sendFeatureCommand(`/transactions/${transactionId}/splits`, {
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
    await removeFeatureRecord(`/transactions/splits/${splitId}`);
    load();
  };

  const updateReconcile = async (transactionId: number, state: string) => {
    await sendFeatureCommand(`/transactions/${transactionId}/reconcile`, { reconciliation_state: state });
    load();
  };

  const loadAttachments = async (transactionId: number) => {
    const data = await getFeatureData<any[]>(`/transactions/${transactionId}/attachments`);
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
    await removeFeatureRecord(`/transactions/attachments/${attachmentId}`);
    await loadAttachments(transactionId);
  };

  const mergeTransactions = async () => {
    if (!mergeForm.primary_id || !mergeForm.duplicate_id) return;
    await sendFeatureCommand("/transactions/merge", {
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

  const viewModel = {
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
  };

  return viewModel;
}

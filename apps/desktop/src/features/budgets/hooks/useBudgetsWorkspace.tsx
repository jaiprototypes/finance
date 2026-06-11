import { Fragment, useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { removeFeatureRecord, getFeatureData, sendFeatureCommand } from "../api";
import {
  BoxTitle,
  SectionHeader,
  formatCompactCurrency,
  formatCount,
  formatCurrency,
  formatMonthLabel,
  formatMonthYearLabel,
  renderMatrixMoney,
} from "../../../shared/financeUi";
import { buildBudgetMatrixModel } from "./budgetMatrixModel";
import { createBudgetSubcategoryRenderers } from "./budgetSubcategoryRenderers";

export function useBudgetsWorkspace() {
  const [months, setMonths] = useState<any[]>([]);
  const [matrixCategories, setMatrixCategories] = useState<any[]>([]);
  const [matrixYear, setMatrixYear] = useState(String(new Date().getFullYear()));
  const [budgetMatrix, setBudgetMatrix] = useState<any | null>(null);
  const [matrixEdits, setMatrixEdits] = useState<Record<string, Record<string, string>>>({});
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrixBusy, setMatrixBusy] = useState(false);
  const [matrixBaseCurrency, setMatrixBaseCurrency] = useState("USD");
  const [matrixBaseCurrencyStatus, setMatrixBaseCurrencyStatus] = useState<string | null>(null);
  const [matrixDrilldown, setMatrixDrilldown] = useState<any | null>(null);
  const [matrixDrilldownAssignments, setMatrixDrilldownAssignments] = useState<Record<string, string>>({});
  const [matrixDrilldownBusySplitId, setMatrixDrilldownBusySplitId] = useState<number | null>(null);
  const [expandedMatrixRows, setExpandedMatrixRows] = useState<Record<string, boolean>>({});
  const [addingMatrixSubcategoryFor, setAddingMatrixSubcategoryFor] = useState<string | null>(null);
  const [matrixSubcategoryDrafts, setMatrixSubcategoryDrafts] = useState<Record<string, string>>({});
  const [editingMatrixSubcategoryId, setEditingMatrixSubcategoryId] = useState<string | null>(null);
  const [matrixSubcategoryRenameValues, setMatrixSubcategoryRenameValues] = useState<Record<string, string>>({});

  const loadMonths = async () => {
    const monthData = await getFeatureData<any[]>("/budgets");
    setMonths(monthData);
  };

  const loadMatrixCategories = async () => {
    const categoryData = await getFeatureData<any[]>("/categories");
    setMatrixCategories(categoryData);
    return categoryData;
  };

  useEffect(() => {
    loadMonths().catch(() => undefined);
    loadMatrixCategories().catch(() => undefined);
  }, []);

  const loadMatrix = async (yearValue?: string) => {
    const year = yearValue || matrixYear;
    const data = await getFeatureData<any>(`/reports/budget-matrix?year=${year}`);
    setBudgetMatrix(data);
    setMatrixDrilldown(null);
    setMatrixBaseCurrency(data.base_currency || "USD");
    const edits: Record<string, Record<string, string>> = {};
    (data.categories || []).forEach((category: any) => {
      const monthMap: Record<string, string> = {};
      (data.months || []).forEach((month: string) => {
        const plannedEntered = Boolean(category.budget_entered?.[month]);
        const plannedAmount = Number(category.budget?.[month] || 0);
        const actualAmount =
          category.type === "income"
            ? Number(category.income?.[month] || 0)
            : Number(category.expense?.[month] || 0);
        if (plannedEntered) {
          monthMap[month] = String(plannedAmount);
        } else if (actualAmount > 0) {
          monthMap[month] = actualAmount.toFixed(2);
        } else {
          monthMap[month] = "";
        }
      });
      edits[String(category.id)] = monthMap;
    });
    setMatrixEdits(edits);
    return data;
  };

  useEffect(() => {
    loadMatrix().catch(() => undefined);
  }, [matrixYear]);

  useEffect(() => {
    if (!matrixDrilldown) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMatrixDrilldown(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [matrixDrilldown]);

  const ensureMonthId = async (month: string) => {
    const existing = months.find((row) => row.month === month);
    if (existing) return existing.id;
    const created = await sendFeatureCommand<any>("/budgets/months", { month, rollover_enabled: false });
    setMonths((prev) => [...prev, created]);
    return created.id;
  };

  const updateMatrixCell = (bucketKey: string, month: string, value: string) => {
    setMatrixEdits((prev) => ({
      ...prev,
      [bucketKey]: {
        ...(prev[bucketKey] || {}),
        [month]: value
      }
    }));
  };

  const {
    budgetCurrency,
    balanceSummary,
    currentBudgetMonth,
    currentMonthChartGradient,
    currentMonthExpenseBreakdown,
    currentMonthOverrun,
    currentMonthRemaining,
    expenseRows,
    expenseSummary,
    getCellInputValue,
    getEffectiveCellAmount,
    incomeRows,
    incomeSummary,
    invalidMonths,
    isMonthEditable,
    liveCashflowSummary,
    matrixColSpan,
    matrixMonths,
    plannedClosingBalance,
    plannedIncomeExpansion,
    remainingActualIncome,
    saveBlocked
  } = buildBudgetMatrixModel({ budgetMatrix, matrixEdits });

  const getBucketRow = (bucketKey: string) =>
    (budgetMatrix?.categories || []).find((row: any) => String(row.id) === bucketKey);
  const getMatrixCategoryForRow = (row: any) =>
    (matrixCategories || []).find((category: any) => category.name === row.name);
  const matrixSubcategoriesForBucket = (bucketName: string) =>
    ((matrixCategories || []).find((category: any) => category.name === bucketName)?.subcategories || []);

  const hasSubcategoryRows = (row: any) => (row?.subcategories || []).length > 0;
  const isMatrixRowExpanded = (rowId: string) => Boolean(expandedMatrixRows[rowId]);
  const toggleMatrixRowExpanded = (rowId: string) => {
    setExpandedMatrixRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };
  const startAddingMatrixSubcategory = (rowId: string) => {
    setAddingMatrixSubcategoryFor(rowId);
    setMatrixSubcategoryDrafts((prev) => ({ ...prev, [rowId]: prev[rowId] || "" }));
  };

  const loadMatrixDrilldownData = async ({
    left,
    top,
    row,
    month,
    subcategory
  }: {
    left: number;
    top: number;
    row: any;
    month: string;
    subcategory?: any | null;
  }) => {
    const actual =
      row.type === "income" ? Number(row.income?.[month] || 0) : Number(row.expense?.[month] || 0);
    const nextSubcategory = subcategory || null;
    const rowName = nextSubcategory ? `${row.name} / ${nextSubcategory.name}` : row.name;
    setMatrixDrilldownAssignments({});
    setMatrixDrilldown({
      left,
      top,
      month,
      rowName,
      bucket_key: String(row.id),
      bucket_type: row.type,
      bucket_name: row.name,
      subcategory_name: nextSubcategory?.name || null,
      subcategory_id: nextSubcategory?.subcategory_id || null,
      unassigned: Boolean(nextSubcategory?.is_unassigned),
      actual_total: actual,
      transactions: [],
      loading: true,
      error: null
    });
    try {
      const query = new URLSearchParams({
        month,
        bucket: String(row.id)
      });
      if (nextSubcategory?.subcategory_id) {
        query.set("subcategory_id", String(nextSubcategory.subcategory_id));
      } else if (nextSubcategory?.is_unassigned) {
        query.set("unassigned", "true");
      }
      const data = await getFeatureData<any>(`/reports/budget-cell-transactions?${query.toString()}`);
      setMatrixDrilldown({
        ...data,
        left,
        top,
        rowName,
        bucket_key: String(row.id),
        bucket_type: row.type,
        subcategory_name: nextSubcategory?.name || null,
        subcategory_id: nextSubcategory?.subcategory_id || null,
        unassigned: Boolean(nextSubcategory?.is_unassigned),
        loading: false,
        error: null
      });
    } catch (err) {
      setMatrixDrilldown({
        left,
        top,
        month,
        rowName,
        bucket_key: String(row.id),
        bucket_type: row.type,
        bucket_name: row.name,
        subcategory_name: nextSubcategory?.name || null,
        subcategory_id: nextSubcategory?.subcategory_id || null,
        unassigned: Boolean(nextSubcategory?.is_unassigned),
        actual_total: actual,
        transactions: [],
        loading: false,
        error: err instanceof Error ? err.message : "Unable to load transactions."
      });
    }
  };

  const openMatrixDrilldown = async (
    event: MouseEvent,
    row: any,
    month: string,
    options?: { subcategory?: any }
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const panelWidth = 360;
    const panelHeight = 420;
    const gutter = 16;
    const left =
      typeof window !== "undefined"
        ? Math.max(gutter, Math.min(event.clientX, window.innerWidth - panelWidth - gutter))
        : event.clientX;
    const top =
      typeof window !== "undefined"
        ? Math.max(gutter, Math.min(event.clientY, window.innerHeight - panelHeight - gutter))
        : event.clientY;
    await loadMatrixDrilldownData({ left, top, row, month, subcategory: options?.subcategory || null });
  };

  const applyMatrixDrilldownSubcategory = async (txn: any) => {
    const splitId = Number(txn.split_id || 0);
    const selectedValue = matrixDrilldownAssignments[String(splitId)] ?? (txn.subcategory_id ? String(txn.subcategory_id) : "");
    const subcategoryId = Number(selectedValue || 0);
    const rowCategory = matrixDrilldown ? (matrixCategories || []).find((category: any) => category.name === matrixDrilldown.bucket_name) : null;
    if (!splitId || !subcategoryId || !rowCategory?.id || !matrixDrilldown) {
      setMatrixError("Select a subcategory before applying it.");
      return;
    }
    setMatrixError(null);
    setMatrixBusy(true);
    setMatrixDrilldownBusySplitId(splitId);
    try {
      const result = await sendFeatureCommand<any>(`/transactions/splits/${splitId}`, {
        category_id: rowCategory.id,
        subcategory_id: subcategoryId,
        classification: "Personal",
        cascade_matching_merchant: true
      });
      await loadMatrixCategories();
      const nextMatrix = await loadMatrix(matrixYear);
      const refreshedRow =
        (nextMatrix?.categories || []).find((row: any) => String(row.id) === String(matrixDrilldown.bucket_key)) ||
        {
          id: matrixDrilldown.bucket_key,
          name: matrixDrilldown.bucket_name,
          type: matrixDrilldown.bucket_type,
          income: {},
          expense: {},
        };
      const refreshSubcategory =
        matrixDrilldown.subcategory_id
          ? { subcategory_id: matrixDrilldown.subcategory_id, name: matrixDrilldown.subcategory_name }
          : matrixDrilldown.unassigned
            ? { is_unassigned: true, name: matrixDrilldown.subcategory_name || "Unassigned" }
            : null;
      await loadMatrixDrilldownData({
        left: matrixDrilldown.left,
        top: matrixDrilldown.top,
        row: refreshedRow,
        month: matrixDrilldown.month,
        subcategory: refreshSubcategory,
      });
      const cascaded = Number(result?.updated || 0);
      setMatrixBaseCurrencyStatus(
        cascaded > 0
          ? `Subcategory applied and cascaded to ${formatCount(cascaded)} matching transactions.`
          : "Subcategory applied."
      );
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to apply subcategory.");
    } finally {
      setMatrixBusy(false);
      setMatrixDrilldownBusySplitId(null);
    }
  };

  const assertMatrixBudgetable = () => {
    const invalid = invalidMonths.filter((row) => row.state !== "past");
    if (!invalid.length) return;
    const first = invalid[0];
    throw new Error(
      `${formatMonthLabel(first.month)} projected closing checking balance would be ${formatCurrency(
        first.plannedClosingBalance,
        budgetCurrency
      )}, below the allowed buffer of ${formatCurrency(-50, budgetCurrency)}.`
    );
  };

  const persistMatrixBucket = async (
    row: any,
    monthIds: Record<string, number>
  ) => {
    const bucketKey = String(row.id);
    for (const month of budgetMatrix?.months || []) {
      if (!isMonthEditable(month)) continue;
      const raw = matrixEdits[bucketKey]?.[month] ?? "";
      const targetId = row.budget_target_id?.[month];
      if (raw === "") {
        if (targetId) {
          await removeFeatureRecord(`/budgets/bucket-targets/${targetId}`);
        }
        continue;
      }
      const amount = Number(raw);
      if (!Number.isFinite(amount)) {
        throw new Error(`Invalid amount for ${row.name} ${formatMonthLabel(month)}`);
      }
      if (!monthIds[month]) {
        monthIds[month] = await ensureMonthId(month);
      }
      await sendFeatureCommand("/budgets/bucket-targets", {
        budget_month_id: Number(monthIds[month]),
        budget_bucket: bucketKey,
        amount,
        rollover_amount: 0
      });
    }
  };

  const saveMatrixRow = async (bucketKey: string) => {
    if (!budgetMatrix) return;
    const row = getBucketRow(bucketKey);
    if (!row) return;
    setMatrixError(null);
    setMatrixBusy(true);
    try {
      await persistMatrixBucket(row, {});
      await loadMonths();
      await loadMatrix();
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to save row.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const saveMatrixAll = async () => {
    if (!budgetMatrix) return;
    setMatrixError(null);
    setMatrixBusy(true);
    try {
      assertMatrixBudgetable();
      const operations: Array<{
        kind: "upsert" | "delete";
        row: any;
        month: string;
        amount: number;
        currentAmount: number;
        targetId?: number;
      }> = [];
      for (const row of budgetMatrix.categories || []) {
        const bucketKey = String(row.id);
        for (const month of budgetMatrix.months || []) {
          if (!isMonthEditable(month)) continue;
          const raw = matrixEdits[bucketKey]?.[month] ?? "";
          const targetId = row.budget_target_id?.[month];
          const currentAmount = row.budget_entered?.[month] ? Number(row.budget?.[month] || 0) : 0;
          if (raw === "") {
            if (targetId) {
              operations.push({ kind: "delete", row, month, amount: 0, currentAmount, targetId });
            }
            continue;
          }
          const amount = Number(raw);
          if (!Number.isFinite(amount)) {
            throw new Error(`Invalid amount for ${row.name} ${formatMonthLabel(month)}`);
          }
          if (targetId && Math.abs(amount - currentAmount) < 0.00001) {
            continue;
          }
          operations.push({ kind: "upsert", row, month, amount, currentAmount, targetId });
        }
      }
      const stageForOperation = (operation: (typeof operations)[number]) => {
        if (operation.row.type === "income") {
          return operation.amount >= operation.currentAmount ? 1 : 4;
        }
        return operation.amount <= operation.currentAmount ? 2 : 3;
      };
      operations.sort((left, right) => stageForOperation(left) - stageForOperation(right));
      const monthIds: Record<string, number> = {};
      for (const operation of operations) {
        if (operation.kind === "delete") {
          await removeFeatureRecord(`/budgets/bucket-targets/${operation.targetId}`);
          continue;
        }
        if (!monthIds[operation.month]) {
          monthIds[operation.month] = await ensureMonthId(operation.month);
        }
        await sendFeatureCommand("/budgets/bucket-targets", {
          budget_month_id: Number(monthIds[operation.month]),
          budget_bucket: String(operation.row.id),
          amount: operation.amount,
          rollover_amount: 0
        });
      }
      await loadMonths();
      await loadMatrix();
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to save matrix.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const autofillMatrixFromActuals = () => {
    if (!budgetMatrix) return;
    const next: Record<string, Record<string, string>> = { ...matrixEdits };
    for (const category of budgetMatrix.categories || []) {
      const bucketKey = String(category.id);
      const monthsMap: Record<string, string> = { ...(next[bucketKey] || {}) };
      for (const month of budgetMatrix.months || []) {
        if (!isMonthEditable(month)) continue;
        const actual =
          category.type === "income"
            ? Number(category.income?.[month] || 0)
            : Number(category.expense?.[month] || 0);
        monthsMap[month] = actual > 0 ? actual.toFixed(2) : "";
      }
      next[bucketKey] = monthsMap;
    }
    setMatrixEdits(next);
  };

  const matrixDrilldownSubcategories = matrixDrilldown ? matrixSubcategoriesForBucket(matrixDrilldown.bucket_name || "") : [];

  const createMatrixSubcategory = async (row: any) => {
    const rowId = String(row.id);
    const name = (matrixSubcategoryDrafts[rowId] || "").trim();
    if (!name) {
      setMatrixError("Subcategory name is required.");
      return;
    }
    const category = getMatrixCategoryForRow(row);
    if (!category?.id) {
      setMatrixError(`Unable to map ${row.name} to a category for subcategory creation.`);
      return;
    }
    setMatrixError(null);
    setMatrixBusy(true);
    try {
      await sendFeatureCommand(`/categories/${category.id}/subcategories`, { name, is_active: true });
      await loadMatrixCategories();
      await loadMatrix(matrixYear);
      setExpandedMatrixRows((prev) => ({ ...prev, [rowId]: true }));
      setAddingMatrixSubcategoryFor(null);
      setMatrixSubcategoryDrafts((prev) => ({ ...prev, [rowId]: "" }));
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to create subcategory.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const saveMatrixSubcategoryRename = async (row: any, subcategory: any) => {
    const renameKey = String(subcategory.subcategory_id || "");
    const name = (matrixSubcategoryRenameValues[renameKey] || "").trim();
    if (!name || !subcategory.subcategory_id) {
      setMatrixError("Subcategory name is required.");
      return;
    }
    setMatrixError(null);
    setMatrixBusy(true);
    try {
      await sendFeatureCommand(`/categories/subcategories/${subcategory.subcategory_id}`, { name, is_active: true });
      await loadMatrixCategories();
      await loadMatrix(matrixYear);
      setExpandedMatrixRows((prev) => ({ ...prev, [String(row.id)]: true }));
      setEditingMatrixSubcategoryId(null);
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to rename subcategory.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const deleteMatrixSubcategory = async (row: any, subcategory: any) => {
    if (!subcategory?.subcategory_id || subcategory?.is_unassigned) return;
    const confirmed = window.confirm(
      `Delete subcategory "${subcategory.name}"? Existing transactions will become unassigned in ${row.name}.`
    );
    if (!confirmed) return;
    setMatrixError(null);
    setMatrixBusy(true);
    try {
      const result = await removeFeatureRecord<{ cleared_splits?: number; cleared_profiles?: number }>(
        `/categories/subcategories/${subcategory.subcategory_id}`
      );
      await loadMatrixCategories();
      await loadMatrix(matrixYear);
      setExpandedMatrixRows((prev) => ({ ...prev, [String(row.id)]: true }));
      setMatrixBaseCurrencyStatus(
        `Deleted ${subcategory.name}. Cleared ${formatCount(result?.cleared_splits || 0)} transaction links and ${formatCount(result?.cleared_profiles || 0)} merchant profiles.`
      );
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to delete subcategory.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const { renderInlineSubcategoryEditor, renderSubcategoryRows } = createBudgetSubcategoryRenderers({
    addingMatrixSubcategoryFor,
    budgetCurrency,
    createMatrixSubcategory,
    deleteMatrixSubcategory,
    editingMatrixSubcategoryId,
    hasSubcategoryRows,
    isMatrixRowExpanded,
    matrixBusy,
    matrixMonths,
    matrixSubcategoryDrafts,
    matrixSubcategoryRenameValues,
    openMatrixDrilldown,
    renderMatrixMoney,
    saveMatrixSubcategoryRename,
    setAddingMatrixSubcategoryFor,
    setEditingMatrixSubcategoryId,
    setMatrixSubcategoryDrafts,
    setMatrixSubcategoryRenameValues
  });

  const saveMatrixBaseCurrency = async () => {
    setMatrixError(null);
    setMatrixBaseCurrencyStatus(null);
    setMatrixBusy(true);
    try {
      await sendFeatureCommand("/settings", { base_currency: matrixBaseCurrency });
      await loadMonths();
      await loadMatrix(matrixYear);
      setMatrixBaseCurrencyStatus(`Budget matrix base currency updated to ${matrixBaseCurrency}.`);
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to update base currency.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const refreshBudgetTransactions = async () => {
    setMatrixError(null);
    setMatrixBaseCurrencyStatus(null);
    setMatrixBusy(true);
    try {
      const [plaidStatus, upStatus] = await Promise.all([
        getFeatureData<any>("/plaid/status").catch(() => ({ configured: false })),
        getFeatureData<any>("/up/status").catch(() => ({ configured: false }))
      ]);
      const syncMessages: string[] = [];
      const syncErrors: string[] = [];
      if (plaidStatus?.configured) {
        try {
          const result = await sendFeatureCommand<any>("/plaid/sync");
          syncMessages.push(
            `Plaid refreshed (${formatCount(result?.added || 0)} new, ${formatCount(result?.modified || 0)} updated)`
          );
        } catch (err) {
          syncErrors.push(err instanceof Error ? `Plaid: ${err.message}` : "Plaid refresh failed");
        }
      }
      if (upStatus?.configured) {
        try {
          const result = await sendFeatureCommand<any>("/up/sync-transactions");
          const tx = result?.transactions || result || {};
          syncMessages.push(
            `Up refreshed (${formatCount(tx?.added || 0)} new, ${formatCount(tx?.updated || 0)} updated)`
          );
        } catch (err) {
          syncErrors.push(err instanceof Error ? `Up: ${err.message}` : "Up refresh failed");
        }
      }
      await loadMonths();
      await loadMatrix(matrixYear);
      if (syncErrors.length > 0) {
        setMatrixError(syncErrors.join(" · "));
      }
      setMatrixBaseCurrencyStatus(
        syncMessages.length > 0
          ? `${syncMessages.join(" · ")} · Matrix refreshed.`
          : syncErrors.length > 0
            ? "Matrix refreshed, but no linked feed sync succeeded."
            : "No linked bank feeds were available to refresh."
      );
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to refresh linked bank feeds.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const viewModel = {
    Fragment,
    BoxTitle,
    SectionHeader,
    formatCompactCurrency,
    formatCurrency,
    formatMonthLabel,
    formatMonthYearLabel,
    renderMatrixMoney,
    months,
    matrixYear,
    setMatrixYear,
    budgetMatrix,
    matrixError,
    matrixBusy,
    matrixBaseCurrency,
    setMatrixBaseCurrency,
    matrixBaseCurrencyStatus,
    setMatrixBaseCurrencyStatus,
    matrixDrilldown,
    setMatrixDrilldown,
    matrixDrilldownAssignments,
    setMatrixDrilldownAssignments,
    matrixDrilldownBusySplitId,
    updateMatrixCell,
    currentBudgetMonth,
    isMonthEditable,
    getCellInputValue,
    getEffectiveCellAmount,
    getMatrixCategoryForRow,
    hasSubcategoryRows,
    isMatrixRowExpanded,
    toggleMatrixRowExpanded,
    startAddingMatrixSubcategory,
    openMatrixDrilldown,
    applyMatrixDrilldownSubcategory,
    saveMatrixRow,
    saveMatrixAll,
    autofillMatrixFromActuals,
    incomeRows,
    expenseRows,
    matrixColSpan,
    budgetCurrency,
    plannedClosingBalance,
    invalidMonths,
    saveBlocked,
    incomeSummary,
    expenseSummary,
    balanceSummary,
    liveCashflowSummary,
    plannedIncomeExpansion,
    remainingActualIncome,
    currentMonthOverrun,
    currentMonthRemaining,
    currentMonthExpenseBreakdown,
    currentMonthChartGradient,
    matrixDrilldownSubcategories,
    renderSubcategoryRows,
    renderInlineSubcategoryEditor,
    saveMatrixBaseCurrency,
    refreshBudgetTransactions
  };

  return viewModel;
}

import { Fragment, useEffect, useState } from "react";
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
import { useBudgetMatrixDrilldown } from "./useBudgetMatrixDrilldown";

function loadErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

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
    loadMonths().catch((err) =>
      setMatrixError((current) => current || loadErrorMessage(err, "Unable to load budget months."))
    );
    loadMatrixCategories().catch((err) =>
      setMatrixError((current) => current || loadErrorMessage(err, "Unable to load budget categories."))
    );
  }, []);

  const loadMatrix = async (yearValue?: string) => {
    const year = yearValue || matrixYear;
    const data = await getFeatureData<any>(`/reports/budget-matrix?year=${year}`);
    setBudgetMatrix(data);
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
    let cancelled = false;
    setMatrixError(null);
    loadMatrix().catch((err) => {
      if (!cancelled) setMatrixError(loadErrorMessage(err, `Unable to load budget matrix for ${matrixYear}.`));
    });
    return () => {
      cancelled = true;
    };
  }, [matrixYear]);

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

  const hasSubcategoryRows = (row: any) => (row?.subcategories || []).length > 0;
  const isMatrixRowExpanded = (rowId: string) => Boolean(expandedMatrixRows[rowId]);
  const toggleMatrixRowExpanded = (rowId: string) => {
    setExpandedMatrixRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };
  const startAddingMatrixSubcategory = (rowId: string) => {
    setAddingMatrixSubcategoryFor(rowId);
    setMatrixSubcategoryDrafts((prev) => ({ ...prev, [rowId]: prev[rowId] || "" }));
  };

  const {
    applyMatrixDrilldownSubcategory,
    matrixDrilldown,
    matrixDrilldownAssignments,
    matrixDrilldownBusySplitId,
    matrixDrilldownSubcategories,
    openMatrixDrilldown,
    setMatrixDrilldown,
    setMatrixDrilldownAssignments
  } = useBudgetMatrixDrilldown({
    loadMatrix,
    loadMatrixCategories,
    matrixCategories,
    matrixYear,
    setMatrixBaseCurrencyStatus,
    setMatrixBusy,
    setMatrixError
  });

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
      setMatrixDrilldown(null);
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
      setMatrixDrilldown(null);
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
      setMatrixDrilldown(null);
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
      setMatrixDrilldown(null);
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
      setMatrixDrilldown(null);
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
      setMatrixDrilldown(null);
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
      setMatrixDrilldown(null);
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
    matrixMonths,
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

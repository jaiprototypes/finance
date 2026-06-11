import React, { Fragment, useEffect, useRef, useState } from "react";
import { removeFeatureRecord, getFeatureData, sendFeatureCommand } from "../api";
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
import { BudgetsView } from "./BudgetsView";

export function Budgets() {
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

  const monthMeta = budgetMatrix?.month_meta || {};
  const currentBudgetMonth = budgetMatrix?.current_month || currentMonthLabel();
  const getMonthState = (month: string) => String(monthMeta?.[month]?.state || monthStateLabel(month, currentBudgetMonth));
  const isMonthEditable = (month: string) => getMonthState(month) !== "past";
  const getRowActual = (row: any, month: string) =>
    Number(row[row.type === "income" ? "income" : "expense"]?.[month] || 0);
  const getCellInputValue = (row: any, month: string) => {
    const raw = matrixEdits[String(row.id)]?.[month];
    if (getMonthState(month) === "past") {
      const actual = getRowActual(row, month);
      return actual > 0 ? actual.toFixed(2) : "";
    }
    if (raw !== undefined) return raw;
    const actual = getRowActual(row, month);
    return actual > 0 ? actual.toFixed(2) : "";
  };
  const getEffectiveCellAmount = (row: any, month: string) => {
    const actual = getRowActual(row, month);
    if (getMonthState(month) === "past") {
      return actual;
    }
    const raw = matrixEdits[String(row.id)]?.[month];
    if (raw !== undefined && raw !== "") {
      const amount = Number(raw);
      if (Number.isFinite(amount)) return amount;
    }
    return actual;
  };

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
    event: React.MouseEvent,
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

  const matrixMonths: string[] = budgetMatrix?.months || [];
  const incomeRows = (budgetMatrix?.categories || [])
    .filter((row: any) => row.type === "income")
    .sort((a: any, b: any) => (b.total_income || 0) - (a.total_income || 0));
  const expenseRows = (budgetMatrix?.categories || [])
    .filter((row: any) => row.type !== "income")
    .sort((a: any, b: any) => (b.total_expense || 0) - (a.total_expense || 0));
  const matrixColSpan = matrixMonths.length + 5;
  const budgetCurrency = budgetMatrix?.base_currency || "USD";
  const openingLiquidBalance = Number(budgetMatrix?.totals?.opening_liquid_balance || 0);
  const cashTolerance = 50;
  const monthPlanning = matrixMonths.map((month) => {
    const state = getMonthState(month);
    const incomeActual = incomeRows.reduce((sum: number, row: any) => sum + Number(row.income?.[month] || 0), 0);
    const expenseActual = expenseRows.reduce((sum: number, row: any) => sum + Number(row.expense?.[month] || 0), 0);
    const plannedIncome = incomeRows.reduce((sum: number, row: any) => sum + getEffectiveCellAmount(row, month), 0);
    const plannedExpense = expenseRows.reduce((sum: number, row: any) => sum + getEffectiveCellAmount(row, month), 0);
    const remaining = plannedIncome - plannedExpense;
    return {
      month,
      state,
      editable: isMonthEditable(month),
      incomeActual,
      expenseActual,
      plannedIncome,
      plannedExpense,
      remaining
    };
  });
  let plannedClosingBalance = openingLiquidBalance;
  let actualClosingBalance = openingLiquidBalance;
  const monthPlanningWithBalances = monthPlanning.map((row) => {
    plannedClosingBalance += row.remaining;
    actualClosingBalance += row.incomeActual - row.expenseActual;
    return {
      ...row,
      plannedClosingBalance,
      actualClosingBalance
    };
  });
  const invalidMonths = monthPlanningWithBalances.filter(
    (row) => row.state !== "past" && row.plannedClosingBalance < -cashTolerance - 0.005
  );
  const saveBlocked = invalidMonths.length > 0;
  const summarizeMatrixSection = (rows: any[], field: "income" | "expense") => {
    let plannedTotal = 0;
    let actualTotal = 0;
    const byMonth = matrixMonths.map((month) => {
      const planned = rows.reduce((sum, row) => sum + getEffectiveCellAmount(row, month), 0);
      const actual = rows.reduce((sum, row) => sum + Number(row[field]?.[month] || 0), 0);
      plannedTotal += planned;
      actualTotal += actual;
      return { month, planned, actual };
    });
    return {
      byMonth,
      plannedTotal,
      actualTotal,
      variance: plannedTotal - actualTotal
    };
  };
  const incomeSummary = summarizeMatrixSection(incomeRows, "income");
  const expenseSummary = summarizeMatrixSection(expenseRows, "expense");
  const balanceSummary = {
    byMonth: monthPlanningWithBalances.map(({ month, state, actualClosingBalance }) => ({
      month,
      actual: state === "future" ? null : actualClosingBalance
    })),
    actualTotal:
      [...monthPlanningWithBalances]
        .reverse()
        .find((row) => row.state !== "future")?.actualClosingBalance ?? null
  };
  const liveCashflowSummary = {
    byMonth: monthPlanning.map(({ month, remaining }) => ({
      month,
      actual: remaining
    }))
  };
  const currentMonthPlan = monthPlanning.find((row) => row.month === currentBudgetMonth) || null;
  const currentMonthActualIncome = Number(currentMonthPlan?.incomeActual || 0);
  const currentMonthActualExpense = Number(currentMonthPlan?.expenseActual || 0);
  const currentMonthPlannedIncome = Number(currentMonthPlan?.plannedIncome || 0);
  const plannedIncomeExpansion = Math.max(currentMonthPlannedIncome - currentMonthActualIncome, 0);
  const chartAvailableIncome = currentMonthActualIncome + plannedIncomeExpansion;
  const chartUsedAmount = Math.min(currentMonthActualExpense, chartAvailableIncome);
  const remainingActualIncome = Math.max(currentMonthActualIncome - chartUsedAmount, 0);
  const remainingPlannedIncome = Math.max(chartAvailableIncome - chartUsedAmount - remainingActualIncome, 0);
  const currentMonthOverrun = Math.max(currentMonthActualExpense - chartAvailableIncome, 0);
  const currentMonthRemaining = Math.max(chartAvailableIncome - currentMonthActualExpense, 0);
  const currentMonthExpenseBreakdown = expenseRows
    .map((row: any, index: number) => ({
      id: String(row.id),
      name: row.name,
      actual: Number(row.expense?.[currentBudgetMonth] || 0),
      color: MATRIX_BREAKDOWN_COLORS[index % MATRIX_BREAKDOWN_COLORS.length]
    }))
    .filter((row: any) => row.actual > 0)
    .sort((a: any, b: any) => b.actual - a.actual)
    .map((row: any, index: number) => ({
      ...row,
      color: MATRIX_BREAKDOWN_COLORS[index % MATRIX_BREAKDOWN_COLORS.length],
      share: currentMonthActualExpense > 0 ? row.actual / currentMonthActualExpense : 0
    }));
  const currentMonthChartGradient = buildConicGradient([
    ...currentMonthExpenseBreakdown.map((row: any) => ({
      value: currentMonthActualExpense > 0 ? chartUsedAmount * row.share : 0,
      color: row.color
    })),
    { value: remainingActualIncome, color: "#2a9d8f" },
    { value: remainingPlannedIncome, color: "#8ecae6" }
  ]);
  const matrixDrilldownSubcategories = matrixDrilldown ? matrixSubcategoriesForBucket(matrixDrilldown.bucket_name || "") : [];

  const renderSubcategoryRows = (row: any) => {
    if (!hasSubcategoryRows(row) || !isMatrixRowExpanded(String(row.id))) return null;
    return (row.subcategories || []).map((subcategory: any) => {
      const renameKey = String(subcategory.subcategory_id || "");
      const isRenaming = Boolean(subcategory.subcategory_id) && editingMatrixSubcategoryId === renameKey;
      const actualTotal = matrixMonths.reduce(
        (sum, month) =>
          sum + Number((subcategory.type === "income" ? subcategory.income?.[month] : subcategory.expense?.[month]) || 0),
        0
      );
      return (
        <tr key={`subcategory-${row.id}-${subcategory.id}`} className="matrix-subrow">
          <td className="matrix-label-cell matrix-subcategory-label-cell">
            <div className="matrix-label-main">
              <span className="matrix-subcategory-indent">↳</span>
              {isRenaming ? (
                <>
                  <input
                    className="matrix-subcategory-input"
                    value={matrixSubcategoryRenameValues[renameKey] || ""}
                    onChange={(event) =>
                      setMatrixSubcategoryRenameValues((prev) => ({ ...prev, [renameKey]: event.target.value }))
                    }
                  />
                  <button
                    className="matrix-subcategory-action"
                    onClick={() => saveMatrixSubcategoryRename(row, subcategory)}
                    disabled={matrixBusy}
                  >
                    Save
                  </button>
                  <button
                    className="matrix-subcategory-action"
                    onClick={() => {
                      setEditingMatrixSubcategoryId(null);
                      setMatrixSubcategoryRenameValues((prev) => ({ ...prev, [renameKey]: subcategory.name || "" }));
                    }}
                    disabled={matrixBusy}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span>{subcategory.name}</span>
                  {subcategory.subcategory_id && !subcategory.is_unassigned && (
                    <>
                      <button
                        className="matrix-subcategory-action"
                        onClick={() => {
                          setEditingMatrixSubcategoryId(renameKey);
                          setMatrixSubcategoryRenameValues((prev) => ({
                            ...prev,
                            [renameKey]: subcategory.name || ""
                          }));
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="matrix-subcategory-action"
                        onClick={() => deleteMatrixSubcategory(row, subcategory)}
                        disabled={matrixBusy}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </td>
          {matrixMonths.map((month) => {
            const actual = Number(
              (subcategory.type === "income" ? subcategory.income?.[month] : subcategory.expense?.[month]) || 0
            );
            return (
              <td
                key={`subcategory-${row.id}-${subcategory.id}-${month}`}
                className="matrix-cell matrix-cell-drillable matrix-subcategory-cell"
                onContextMenu={(event) => openMatrixDrilldown(event, row, month, { subcategory })}
                title="Right-click to inspect transactions behind this subcategory actual"
              >
                {actual > 0 ? renderMatrixMoney(actual, budgetCurrency) : "—"}
              </td>
            );
          })}
          <td className="matrix-total-cell">—</td>
          <td className="matrix-total-cell">{renderMatrixMoney(actualTotal, budgetCurrency)}</td>
          <td className="matrix-total-cell">—</td>
          <td className="matrix-action-cell">—</td>
        </tr>
      );
    });
  };

  const renderInlineSubcategoryEditor = (row: any) => {
    if (addingMatrixSubcategoryFor !== String(row.id)) return null;
    return (
      <div className="matrix-inline-subcategory-editor">
        <input
          className="matrix-subcategory-input"
          placeholder={`Add ${row.name} subcategory`}
          value={matrixSubcategoryDrafts[String(row.id)] || ""}
          onChange={(event) =>
            setMatrixSubcategoryDrafts((prev) => ({ ...prev, [String(row.id)]: event.target.value }))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              createMatrixSubcategory(row);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setAddingMatrixSubcategoryFor(null);
            }
          }}
        />
        <button className="matrix-subcategory-action" onClick={() => createMatrixSubcategory(row)} disabled={matrixBusy}>
          Add
        </button>
        <button
          className="matrix-subcategory-action"
          onClick={() => {
            setAddingMatrixSubcategoryFor(null);
          }}
          disabled={matrixBusy}
        >
          Cancel
        </button>
      </div>
    );
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

  return <BudgetsView model={viewModel} />;
}

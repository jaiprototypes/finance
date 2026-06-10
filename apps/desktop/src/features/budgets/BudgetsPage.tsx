import React, { Fragment, useEffect, useRef, useState } from "react";
import { API_BASE, apiDelete, apiGet, apiGetBlob, apiPost, apiPostForm, apiUrl, downloadDiagnostics, saveBlob } from "./api";
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
    const monthData = await apiGet<any[]>("/budgets");
    setMonths(monthData);
  };

  const loadMatrixCategories = async () => {
    const categoryData = await apiGet<any[]>("/categories");
    setMatrixCategories(categoryData);
    return categoryData;
  };

  useEffect(() => {
    loadMonths().catch(() => undefined);
    loadMatrixCategories().catch(() => undefined);
  }, []);

  const loadMatrix = async (yearValue?: string) => {
    const year = yearValue || matrixYear;
    const data = await apiGet<any>(`/reports/budget-matrix?year=${year}`);
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
    const created = await apiPost<any>("/budgets/months", { month, rollover_enabled: false });
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
      const data = await apiGet<any>(`/reports/budget-cell-transactions?${query.toString()}`);
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
      const result = await apiPost<any>(`/transactions/splits/${splitId}`, {
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
          await apiDelete(`/budgets/bucket-targets/${targetId}`);
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
      await apiPost("/budgets/bucket-targets", {
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
          await apiDelete(`/budgets/bucket-targets/${operation.targetId}`);
          continue;
        }
        if (!monthIds[operation.month]) {
          monthIds[operation.month] = await ensureMonthId(operation.month);
        }
        await apiPost("/budgets/bucket-targets", {
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
      await apiPost(`/categories/${category.id}/subcategories`, { name, is_active: true });
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
      await apiPost(`/categories/subcategories/${subcategory.subcategory_id}`, { name, is_active: true });
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
      const result = await apiDelete<{ cleared_splits?: number; cleared_profiles?: number }>(
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
      await apiPost("/settings", { base_currency: matrixBaseCurrency });
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
        apiGet<any>("/plaid/status").catch(() => ({ configured: false })),
        apiGet<any>("/up/status").catch(() => ({ configured: false }))
      ]);
      const syncMessages: string[] = [];
      const syncErrors: string[] = [];
      if (plaidStatus?.configured) {
        try {
          const result = await apiPost<any>("/plaid/sync");
          syncMessages.push(
            `Plaid refreshed (${formatCount(result?.added || 0)} new, ${formatCount(result?.modified || 0)} updated)`
          );
        } catch (err) {
          syncErrors.push(err instanceof Error ? `Plaid: ${err.message}` : "Plaid refresh failed");
        }
      }
      if (upStatus?.configured) {
        try {
          const result = await apiPost<any>("/up/sync-transactions");
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

  return (
    <div className="section-stack">
      <SectionHeader title="Budgets" subtitle="Yearly forecast buckets with actuals and variance." />
      <div className="panel">
        <BoxTitle title="Yearly budget matrix" />
        {matrixError && <p className="form-error">{matrixError}</p>}
        {matrixBaseCurrencyStatus && <p className="muted">{matrixBaseCurrencyStatus}</p>}
        <div className="row">
          <label className="row">
            <span>Base currency</span>
            <select
              value={matrixBaseCurrency}
              onChange={(e) => {
                setMatrixBaseCurrency(e.target.value);
                setMatrixBaseCurrencyStatus(null);
              }}
            >
              <option value="AUD">AUD</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <button onClick={saveMatrixBaseCurrency} disabled={matrixBusy || matrixBaseCurrency === budgetCurrency}>
            Save base currency
          </button>
          <input
            type="number"
            min="2000"
            max="2100"
            value={matrixYear}
            onChange={(e) => setMatrixYear(e.target.value)}
          />
          <button onClick={refreshBudgetTransactions} disabled={matrixBusy}>
            Refresh
          </button>
          <button onClick={autofillMatrixFromActuals} disabled={matrixBusy || !budgetMatrix}>
            Autofill from actuals
          </button>
          <button onClick={saveMatrixAll} disabled={matrixBusy || !budgetMatrix || saveBlocked}>
            Save all
          </button>
          <span className="muted">Past months lock to actuals. Open months must keep projected closing personal checking balance above the cash buffer.</span>
        </div>
        <p className="muted">
          Matrix values are displayed in {budgetCurrency}. Blank open cells fall back to actuals until you enter a plan.
        </p>
        <p className="muted">Refresh pulls new Plaid and Up transactions, updates linked balances, then refreshes the matrix. Expand a bucket to inspect subcategories.</p>
        {matrixMonths.includes(currentBudgetMonth) && (
          <div className="matrix-chart-card">
            <div
              className="matrix-chart-visual"
              style={{ backgroundImage: currentMonthChartGradient }}
              aria-label={`Current month budget chart for ${formatMonthYearLabel(currentBudgetMonth)}`}
            >
              <div className="matrix-chart-center">
                <span className="matrix-chart-caption">{formatMonthYearLabel(currentBudgetMonth)}</span>
                <strong>
                  {currentMonthOverrun > 0
                    ? formatCompactCurrency(currentMonthOverrun, budgetCurrency)
                    : formatCompactCurrency(currentMonthRemaining, budgetCurrency)}
                </strong>
                <span className="matrix-chart-caption">
                  {currentMonthOverrun > 0 ? "Over current income" : "Remaining"}
                </span>
              </div>
            </div>
            <div className="matrix-chart-copy">
              <strong>Current month income use</strong>
              <p className="muted">
                Actual income sets the base, planned income expands it temporarily, and current expense shows what has already been used.
              </p>
              <div className="matrix-chart-legend">
                <div className="matrix-chart-legend-item">
                  <span className="matrix-chart-swatch matrix-chart-swatch-actual" />
                  <span>Actual income remaining</span>
                  <strong>{formatCurrency(remainingActualIncome, budgetCurrency)}</strong>
                </div>
                <div className="matrix-chart-legend-item">
                  <span className="matrix-chart-swatch matrix-chart-swatch-planned" />
                  <span>Planned income</span>
                  <strong>{formatCurrency(plannedIncomeExpansion, budgetCurrency)}</strong>
                </div>
              </div>
              <div className="matrix-chart-breakdown">
                <strong>Current expense categories</strong>
                {currentMonthExpenseBreakdown.length > 0 ? (
                  <div className="matrix-chart-breakdown-list">
                    {currentMonthExpenseBreakdown.map((row: any) => (
                      <div key={`breakdown-${row.id}`} className="matrix-chart-breakdown-item">
                        <span className="matrix-chart-swatch" style={{ background: row.color }} />
                        <span>{row.name}</span>
                        <span className="muted">{Math.round(row.share * 100)}%</span>
                        <strong>{formatCurrency(row.actual, budgetCurrency)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No current month expense categories yet.</p>
                )}
              </div>
              {currentMonthOverrun > 0 && (
                <p className="form-error">
                  Current expense is {formatCurrency(currentMonthOverrun, budgetCurrency)} above actual plus planned income for{" "}
                  {formatMonthYearLabel(currentBudgetMonth)}.
                </p>
              )}
            </div>
          </div>
        )}
        {invalidMonths.length > 0 && (
          <p className="form-error">
            {invalidMonths.map((row) => `${formatMonthLabel(row.month)} ${formatCurrency(row.plannedClosingBalance, budgetCurrency)}`).join(" · ")}
          </p>
        )}
        {budgetMatrix ? (
          <div className="matrix-scroll">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th>Bucket</th>
                  {matrixMonths.map((month) => (
                    <th key={`head-${month}`}>{formatMonthLabel(month)}</th>
                  ))}
                  <th>Plan total</th>
                  <th>Actual total</th>
                  <th>Variance</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="matrix-label-cell"><strong>Live personal cashflow</strong></td>
                  {liveCashflowSummary.byMonth.map(({ month, actual }) => (
                    <td key={`live-working-cashflow-${month}`} className="matrix-cell">
                      {actual === null ? "—" : renderMatrixMoney(actual, budgetCurrency)}
                    </td>
                  ))}
                  <td className="matrix-total-cell">—</td>
                  <td className="matrix-total-cell">—</td>
                  <td className="matrix-total-cell">—</td>
                  <td className="matrix-action-cell">—</td>
                </tr>
                <tr>
                  <td className="matrix-label-cell"><strong>Closing personal checking balance</strong></td>
                  {balanceSummary.byMonth.map(({ month, actual }) => (
                    <td key={`headroom-${month}`} className="matrix-cell">
                      {actual === null ? "—" : renderMatrixMoney(actual, budgetCurrency)}
                    </td>
                  ))}
                  <td className="matrix-total-cell">—</td>
                  <td className="matrix-total-cell">{renderMatrixMoney(balanceSummary.actualTotal, budgetCurrency)}</td>
                  <td className="matrix-total-cell">—</td>
                  <td className="matrix-action-cell">—</td>
                </tr>
                <tr>
                  <td className="matrix-label-cell"><strong>Operating income total</strong></td>
                  {incomeSummary.byMonth.map(({ month, planned }) => (
                    <td key={`income-summary-top-${month}`} className="matrix-cell">
                      {renderMatrixMoney(planned, budgetCurrency)}
                    </td>
                  ))}
                  <td className="matrix-total-cell">{renderMatrixMoney(incomeSummary.plannedTotal, budgetCurrency)}</td>
                  <td className="matrix-total-cell">{renderMatrixMoney(incomeSummary.actualTotal, budgetCurrency)}</td>
                  <td className="matrix-total-cell">{renderMatrixMoney(incomeSummary.variance, budgetCurrency)}</td>
                  <td className="matrix-action-cell">—</td>
                </tr>
                <tr>
                  <td className="matrix-label-cell"><strong>Operating expense total</strong></td>
                  {expenseSummary.byMonth.map(({ month, planned }) => (
                    <td key={`expense-summary-top-${month}`} className="matrix-cell">
                      {renderMatrixMoney(planned, budgetCurrency)}
                    </td>
                  ))}
                  <td className="matrix-total-cell">{renderMatrixMoney(expenseSummary.plannedTotal, budgetCurrency)}</td>
                  <td className="matrix-total-cell">{renderMatrixMoney(expenseSummary.actualTotal, budgetCurrency)}</td>
                  <td className="matrix-total-cell">{renderMatrixMoney(expenseSummary.variance, budgetCurrency)}</td>
                  <td className="matrix-action-cell">—</td>
                </tr>
                {incomeRows.length > 0 && (
                  <tr className="matrix-section-row">
                    <td colSpan={matrixColSpan}>
                      <strong>Operating income</strong>
                    </td>
                  </tr>
                )}
                {incomeRows.map((row: any) => {
                  const budgetTotal = matrixMonths.reduce(
                    (sum, month) => sum + getEffectiveCellAmount(row, month),
                    0
                  );
                  const actualTotal = matrixMonths.reduce(
                    (sum, month) => sum + Number(row.income?.[month] || 0),
                    0
                  );
                  const variance = budgetTotal - actualTotal;
                  return (
                    <Fragment key={`income-${row.id}`}>
                      <tr>
                        <td className="matrix-label-cell">
                          <div className="matrix-label-stack">
                            <div className="matrix-label-main">
                              {hasSubcategoryRows(row) ? (
                                <button
                                  className="matrix-expand-button"
                                  onClick={() => toggleMatrixRowExpanded(String(row.id))}
                                  title={isMatrixRowExpanded(String(row.id)) ? "Hide subcategories" : "Show subcategories"}
                                >
                                  {isMatrixRowExpanded(String(row.id)) ? "Subs ▾" : "Subs ▸"}
                                </button>
                              ) : (
                                <span className="matrix-expand-spacer" />
                              )}
                              <span>{row.name}</span>
                              {hasSubcategoryRows(row) && (
                                <span className="matrix-subcategory-count">{row.subcategories.length}</span>
                              )}
                              {getMatrixCategoryForRow(row)?.id && (
                                <button
                                  className="matrix-subcategory-action"
                                  onClick={() => startAddingMatrixSubcategory(String(row.id))}
                                >
                                  Add
                                </button>
                              )}
                            </div>
                            {renderInlineSubcategoryEditor(row)}
                          </div>
                        </td>
                        {matrixMonths.map((month) => {
                          const actual = Number(row.income?.[month] || 0);
                          const locked = !isMonthEditable(month);
                          return (
                            <td
                              key={`${row.id}-${month}`}
                              className="matrix-cell matrix-cell-drillable"
                              onContextMenu={(event) => openMatrixDrilldown(event, row, month)}
                              title="Right-click to inspect transactions behind the actual value"
                            >
                              {locked ? (
                                <div>{actual > 0 ? renderMatrixMoney(actual, budgetCurrency) : "—"}</div>
                              ) : (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={getCellInputValue(row, month)}
                                  placeholder={actual > 0 ? actual.toFixed(2) : "0.00"}
                                  onChange={(e) => updateMatrixCell(String(row.id), month, e.target.value)}
                                />
                              )}
                              {actual > 0 && <div className="muted">Act {formatCompactCurrency(actual, budgetCurrency)}</div>}
                            </td>
                          );
                        })}
                        <td className="matrix-total-cell">{renderMatrixMoney(budgetTotal, budgetCurrency)}</td>
                        <td className="matrix-total-cell">{renderMatrixMoney(actualTotal, budgetCurrency)}</td>
                        <td className="matrix-total-cell">{renderMatrixMoney(variance, budgetCurrency)}</td>
                        <td className="matrix-action-cell">
                          <button onClick={() => saveMatrixRow(String(row.id))} disabled={matrixBusy}>
                            Save row
                          </button>
                        </td>
                      </tr>
                      {renderSubcategoryRows(row)}
                    </Fragment>
                  );
                })}
                {expenseRows.length > 0 && (
                  <tr className="matrix-section-row">
                    <td colSpan={matrixColSpan}>
                      <strong>Operating expense</strong>
                    </td>
                  </tr>
                )}
                {expenseRows.map((row: any) => {
                  const budgetTotal = matrixMonths.reduce(
                    (sum, month) => sum + getEffectiveCellAmount(row, month),
                    0
                  );
                  const actualTotal = matrixMonths.reduce(
                    (sum, month) => sum + Number(row.expense?.[month] || 0),
                    0
                  );
                  const variance = budgetTotal - actualTotal;
                  return (
                    <Fragment key={`expense-${row.id}`}>
                      <tr>
                        <td className="matrix-label-cell">
                          <div className="matrix-label-stack">
                            <div className="matrix-label-main">
                              {hasSubcategoryRows(row) ? (
                                <button
                                  className="matrix-expand-button"
                                  onClick={() => toggleMatrixRowExpanded(String(row.id))}
                                  title={isMatrixRowExpanded(String(row.id)) ? "Hide subcategories" : "Show subcategories"}
                                >
                                  {isMatrixRowExpanded(String(row.id)) ? "Subs ▾" : "Subs ▸"}
                                </button>
                              ) : (
                                <span className="matrix-expand-spacer" />
                              )}
                              <span>{row.name}</span>
                              {hasSubcategoryRows(row) && (
                                <span className="matrix-subcategory-count">{row.subcategories.length}</span>
                              )}
                              {getMatrixCategoryForRow(row)?.id && (
                                <button
                                  className="matrix-subcategory-action"
                                  onClick={() => startAddingMatrixSubcategory(String(row.id))}
                                >
                                  Add
                                </button>
                              )}
                            </div>
                            {renderInlineSubcategoryEditor(row)}
                          </div>
                        </td>
                        {matrixMonths.map((month) => {
                          const actual = Number(row.expense?.[month] || 0);
                          const rawValue = getCellInputValue(row, month);
                          const locked = !isMonthEditable(month);
                          return (
                            <td
                              key={`${row.id}-${month}`}
                              className="matrix-cell matrix-cell-drillable"
                              onContextMenu={(event) => openMatrixDrilldown(event, row, month)}
                              title="Right-click to inspect transactions behind the actual value"
                            >
                              {locked ? (
                                <div>{actual > 0 ? renderMatrixMoney(actual, budgetCurrency) : "—"}</div>
                              ) : (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={rawValue}
                                  placeholder={actual > 0 ? actual.toFixed(2) : "0.00"}
                                  onChange={(e) => updateMatrixCell(String(row.id), month, e.target.value)}
                                />
                              )}
                              {actual > 0 && <div className="muted">Act {formatCompactCurrency(actual, budgetCurrency)}</div>}
                            </td>
                          );
                        })}
                        <td className="matrix-total-cell">{renderMatrixMoney(budgetTotal, budgetCurrency)}</td>
                        <td className="matrix-total-cell">{renderMatrixMoney(actualTotal, budgetCurrency)}</td>
                        <td className="matrix-total-cell">{renderMatrixMoney(variance, budgetCurrency)}</td>
                        <td className="matrix-action-cell">
                          <button onClick={() => saveMatrixRow(String(row.id))} disabled={matrixBusy}>
                            Save row
                          </button>
                        </td>
                      </tr>
                      {renderSubcategoryRows(row)}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Loading matrix…</p>
        )}
        {matrixDrilldown && (
          <div className="matrix-drilldown-backdrop" onClick={() => setMatrixDrilldown(null)}>
            <div
              className="matrix-drilldown-card"
              style={{ left: matrixDrilldown.left, top: matrixDrilldown.top }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className="matrix-drilldown-header">
                <div>
                  <strong>{matrixDrilldown.rowName || matrixDrilldown.bucket_name}</strong>
                  <div className="muted">{formatMonthYearLabel(matrixDrilldown.month)} actual contributors</div>
                </div>
                <button onClick={() => setMatrixDrilldown(null)}>Close</button>
              </div>
              <p className="muted">
                {matrixDrilldown.subcategory_name ? `${matrixDrilldown.subcategory_name} · ` : ""}
                Act {formatCurrency(matrixDrilldown.actual_total, budgetCurrency)}
              </p>
              {matrixDrilldown.loading ? (
                <p className="muted">Loading transactions…</p>
              ) : matrixDrilldown.error ? (
                <p className="form-error">{matrixDrilldown.error}</p>
              ) : (matrixDrilldown.transactions || []).length === 0 ? (
                <p className="muted">No synced transactions contributed to this actual value.</p>
              ) : (
                <div className="matrix-drilldown-list">
                  {(matrixDrilldown.transactions || []).map((txn: any) => (
                    <div key={`drilldown-${txn.split_id || txn.transaction_id}`} className="matrix-drilldown-item">
                      <div className="matrix-drilldown-item-top">
                        <strong>{txn.payee || txn.description || `Transaction ${txn.transaction_id}`}</strong>
                        <span
                          className={`matrix-drilldown-amount ${
                            Number(txn.effect_on_actual || 0) < 0 ? "matrix-drilldown-credit" : ""
                          }`}
                        >
                          {formatCurrency(txn.effect_on_actual, budgetCurrency)}
                        </span>
                      </div>
                      <div className="muted">
                        {txn.date} · {txn.account_name}
                      </div>
                      {txn.description && txn.payee && txn.description !== txn.payee && (
                        <div className="muted">{txn.description}</div>
                      )}
                      <div className="muted">
                        {formatCurrency(txn.native_amount, txn.native_currency)} native
                        {Number(txn.effect_on_actual || 0) < 0 ? " · Credit/refund" : " · Expense/income"}
                      </div>
                      {matrixDrilldownSubcategories.length > 0 && txn.split_id && (
                        <div className="matrix-drilldown-subcategory-row">
                          <select
                            value={
                              matrixDrilldownAssignments[String(txn.split_id)] ??
                              (txn.subcategory_id ? String(txn.subcategory_id) : "")
                            }
                            onChange={(event) =>
                              setMatrixDrilldownAssignments((prev) => ({
                                ...prev,
                                [String(txn.split_id)]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Subcategory</option>
                            {matrixDrilldownSubcategories.map((subcategory: any) => (
                              <option key={`drilldown-subcategory-${txn.split_id}-${subcategory.id}`} value={subcategory.id}>
                                {subcategory.name}
                              </option>
                            ))}
                          </select>
                          <button
                            className="matrix-subcategory-action"
                            onClick={() => applyMatrixDrilldownSubcategory(txn)}
                            disabled={
                              matrixBusy ||
                              matrixDrilldownBusySplitId === Number(txn.split_id) ||
                              !(
                                matrixDrilldownAssignments[String(txn.split_id)] ??
                                (txn.subcategory_id ? String(txn.subcategory_id) : "")
                              ) ||
                              Number(
                                matrixDrilldownAssignments[String(txn.split_id)] ??
                                  (txn.subcategory_id ? String(txn.subcategory_id) : "0")
                              ) === Number(txn.subcategory_id || 0)
                            }
                          >
                            {matrixDrilldownBusySplitId === Number(txn.split_id) ? "Applying" : "Apply"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

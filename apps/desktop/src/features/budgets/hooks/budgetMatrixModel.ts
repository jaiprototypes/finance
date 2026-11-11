import {
  MATRIX_BREAKDOWN_COLORS,
  buildConicGradient,
  currentMonthLabel,
  monthStateLabel
} from "../../../shared/financeUi";
import { BudgetCashTimeline, BudgetCashSchedule } from "../domain/BudgetCashTimeline";
import { BudgetMonthWindow } from "../domain/BudgetMonthWindow";
import { BudgetPlanContext } from "../domain/BudgetPlanContext";
import { BudgetSuggestions } from "../domain/BudgetSuggestions";
import { BudgetDraftRefresh } from "../domain/BudgetDraftRefresh";
import { BudgetMatrixPeriod } from "../domain/BudgetMatrixPeriod";

type MatrixEdits = Record<string, Record<string, string>>;

export function buildBudgetMatrixModel({
  budgetMatrix,
  followingMatrix,
  matrixEdits,
  today,
  windowStart,
  priorMatrices = [],
  priorDrafts = {}
}: {
  budgetMatrix: any | null;
  followingMatrix?: any | null;
  matrixEdits: MatrixEdits;
  today?: string;
  windowStart?: number | null;
  priorMatrices?: any[];
  priorDrafts?: Record<string, Record<string, Record<string, string>>>;
}) {
  const period = new BudgetMatrixPeriod(budgetMatrix, followingMatrix);
  budgetMatrix = period.matrix;
  const matrixMonths: string[] = budgetMatrix?.months || [];
  const planningMonths: string[] = period.months;
  const monthMeta = budgetMatrix?.month_meta || {};
  const currentBudgetMonth = budgetMatrix?.current_month || currentMonthLabel();
  const suggestionHistory = budgetMatrix?.suggestion_history || [];
  // Visible trends are sliced; cash carry still uses the complete loaded period.
  const monthWindow = new BudgetMonthWindow(matrixMonths,
    windowStart ?? BudgetMonthWindow.defaultStart(matrixMonths, currentBudgetMonth));
  const visibleMatrixMonths = monthWindow.months;
  const getMonthState = (month: string) => String(monthMeta?.[month]?.state || monthStateLabel(month, currentBudgetMonth));
  const isMonthEditable = (month: string) => getMonthState(month) !== "past";
  const getRowActual = (row: any, month: string) =>
    Number(row[row.type === "income" ? "income" : "expense"]?.[month] || 0);
  const getCellInputValue = (row: any, month: string) => {
    const raw = matrixEdits[String(row.id)]?.[month];
    if (getMonthState(month) === "past") {
      const actual = getRowActual(row, month);
      return actual !== 0 ? actual.toFixed(2) : "";
    }
    if (raw !== undefined) return raw;
    if (row.budget_entered?.[month]) return String(row.budget?.[month] || 0);
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
    if (raw === undefined && row.budget_entered?.[month]) return Number(row.budget?.[month] || 0);
    return actual;
  };
  // A blank cell removes its target; actuals remain the fallback.
  const getTargetAmount = (row: any, month: string): number | undefined => {
    const raw = matrixEdits[String(row.id)]?.[month];
    if (raw === "") return undefined;
    if (raw !== undefined) return Number.isFinite(Number(raw)) ? Number(raw) : undefined;
    return row.budget_entered?.[month] ? Number(row.budget?.[month] || 0) : undefined;
  };
  const incomeRows = (budgetMatrix?.categories || [])
    .filter((row: any) => row.type === "income")
    .sort((a: any, b: any) => (b.total_income || 0) - (a.total_income || 0));
  const expenseRows = (budgetMatrix?.categories || [])
    .filter((row: any) => row.type !== "income")
    .sort((a: any, b: any) => (b.total_expense || 0) - (a.total_expense || 0));
  const matrixColSpan = visibleMatrixMonths.length + 2;
  const budgetCurrency = budgetMatrix?.base_currency || "USD";
  const cashFlow = budgetMatrix?.cash_flow || null;
  // Cached years retain only unsaved changes; the fresh report owns saved plans and actuals.
  const baselines = new Map(priorMatrices.map((matrix) => [`${matrix.year}:${matrix.base_currency}`, matrix]));
  const draftChanges = Object.fromEntries(Object.entries(priorDrafts).map(([key, edits]) =>
    [key, BudgetDraftRefresh.changes(baselines.get(key), edits, currentBudgetMonth)]));
  const cachedContexts = priorMatrices.filter((matrix) => matrix.base_currency === budgetCurrency)
    .map((matrix) => ({ ...matrix, categories: (matrix.categories || []).map((row: any) =>
      ({ ...row, budget: {}, budget_entered: {}, income: {}, expense: {},
        pending_income: {}, pending_expense: {} })) }));
  const priorPlans = new BudgetPlanContext([
    ...cachedContexts,
    budgetMatrix?.prior_plan_context || { months: [], categories: [] }
  ], draftChanges, budgetCurrency, currentBudgetMonth, matrixMonths[0] || "");
  const cashInputs = planningMonths.map((month) => ({
    month,
    state: getMonthState(month),
    snapshot: cashFlow?.months?.[month],
    entries: [...incomeRows, ...expenseRows].map((row: any) => ({
      type: row.type === "income" ? "income" as const : "expense" as const,
      actual: getRowActual(row, month),
      reserved: Number(row[row.type === "income" ? "pending_income" : "pending_expense"]?.[month] || 0),
      target: getTargetAmount(row, month),
      cashNeutral: Boolean(row.cash_neutral),
      dueDate: row.due_date?.[month] || null
    }))
  }));
  const cashTimeline = new BudgetCashTimeline([...priorPlans.inputs, ...cashInputs]).months;
  const cashPositions = Object.fromEntries(planningMonths.map((month) => [month, cashTimeline[month]]));
  const localToday = new Date();
  const scheduleToday = today || `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, "0")}-${String(localToday.getDate()).padStart(2, "0")}`;
  const datedCashCheckpoints = new BudgetCashSchedule(cashInputs, cashPositions, scheduleToday).checkpoints;
  // Reserve known costs before suggesting new plans; each accepted edit recalculates this headroom.
  const invalidFuturePlan = [...incomeRows, ...expenseRows].some((row: any) => planningMonths.some(month => {
    if (month < currentBudgetMonth) return false;
    const raw = matrixEdits[String(row.id)]?.[month];
    return raw !== undefined && raw.trim() !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0);
  }));
  const cashAllowance = invalidFuturePlan ? Object.fromEntries(planningMonths.map(month => [month, null]))
    : BudgetCashTimeline.spendingAllowances(cashPositions, datedCashCheckpoints);
  const spendingSuggestions = new BudgetSuggestions({
    months: planningMonths, currentMonth: currentBudgetMonth,
    rows: [...incomeRows, ...expenseRows], edits: matrixEdits, history: suggestionHistory,
    cashAllowance
  }).months;
  // Summarize through this month, or through the selected period's last month.
  const summaryMonth = matrixMonths.filter((month) => month <= currentBudgetMonth).slice(-1)[0]
    || matrixMonths[matrixMonths.length - 1];
  const actualMonthsToDate = matrixMonths.filter((month) => month <= summaryMonth);
  const summaryCash = cashPositions[summaryMonth];
  const cashSummary = summaryCash ? {
    opening: cashPositions[matrixMonths[0]]?.opening ?? null,
    received: actualMonthsToDate.reduce((sum, month) => sum + cashPositions[month].received, 0),
    paid: actualMonthsToDate.reduce((sum, month) => sum + cashPositions[month].paid, 0),
    pending: actualMonthsToDate.reduce((sum, month) => sum + cashPositions[month].pending, 0),
    transferAdjustment: actualMonthsToDate.reduce((sum, month) => sum + cashPositions[month].transferAdjustment, 0),
    closing: summaryCash.closing,
    projectedClosing: summaryCash.cashLeft,
    reservedSavings: summaryCash.reservedSavings,
    planChange: summaryCash.planChange,
    asOf: cashFlow?.as_of,
    latestAsOf: cashFlow?.latest_as_of
  } : null;
  const periodExpenseBreakdown = expenseRows
    // Saving is a budget allocation, while the chart represents spending outside these accounts.
    .filter((row: any) => !row.cash_neutral)
    .map((row: any, index: number) => ({
      id: String(row.id),
      name: row.name,
      actual: actualMonthsToDate.reduce((sum, month) => sum + Number(row.expense?.[month] || 0), 0),
      color: MATRIX_BREAKDOWN_COLORS[index % MATRIX_BREAKDOWN_COLORS.length]
    }))
    .filter((row: any) => row.actual > 0)
    .sort((a: any, b: any) => b.actual - a.actual);
  const positiveExpenseTotal = periodExpenseBreakdown.reduce((sum: number, row: any) => sum + row.actual, 0);
  const periodExpenseShares = periodExpenseBreakdown.map((row: any, index: number) => ({
    ...row,
    color: MATRIX_BREAKDOWN_COLORS[index % MATRIX_BREAKDOWN_COLORS.length],
    share: positiveExpenseTotal > 0 ? row.actual / positiveExpenseTotal : 0
  }));
  const summaryChartGradient = buildConicGradient([
    ...periodExpenseShares.map((row: any) => ({
      value: row.actual,
      color: row.color
    })),
    { value: Math.max(cashSummary?.closing || 0, 0), color: "#2a9d8f" }
  ]);

  return {
    budgetCurrency,
    currentBudgetMonth,
    summaryMonth,
    cashFlow,
    cashSummary,
    cashPositions,
    datedCashCheckpoints,
    planningMinimumCash: BudgetCashTimeline.minimumBalances(cashPositions, datedCashCheckpoints),
    summaryChartGradient,
    periodExpenseBreakdown: periodExpenseShares,
    expenseRows,
    getCellInputValue,
    getEffectiveCellAmount,
    incomeRows,
    spendingSuggestions,
    suggestionHistory,
    isMonthEditable,
    matrixColSpan,
    matrixMonths,
    planningMonths,
    hasFollowingPeriod: period.hasFollowing,
    visibleMatrixMonths,
    matrixWindowStart: monthWindow.startIndex,
    matrixWindowMax: monthWindow.maxStartIndex
  };
}

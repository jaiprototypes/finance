import {
  MATRIX_BREAKDOWN_COLORS,
  buildConicGradient,
  currentMonthLabel,
  monthStateLabel
} from "../../../shared/financeUi";

type MatrixEdits = Record<string, Record<string, string>>;

export function buildBudgetMatrixModel({
  budgetMatrix,
  matrixEdits
}: {
  budgetMatrix: any | null;
  matrixEdits: MatrixEdits;
}) {
  const matrixMonths: string[] = budgetMatrix?.months || [];
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

  return {
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
  };
}

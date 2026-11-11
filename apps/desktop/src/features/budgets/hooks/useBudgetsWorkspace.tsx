import { FinanceDataRevision } from "../../../shared/FinanceDataRevision";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { BudgetCellLimit, type CellLimitResult } from "../domain/BudgetCellLimit";
import { BudgetSavedPlans, type SavedCell } from "../domain/BudgetSavedPlans";
import { BudgetDraftRefresh } from "../domain/BudgetDraftRefresh";
import { BudgetMatrixPeriod } from "../domain/BudgetMatrixPeriod";
import { BudgetMonthWindow } from "../domain/BudgetMonthWindow";
import { createBudgetSubcategoryRenderers } from "./budgetSubcategoryRenderers";
import { useBudgetMatrixDrilldown } from "./useBudgetMatrixDrilldown";
import { useBudgetSavingDate } from "./useBudgetSavingDate";
import { useBudgetMonthRefresh } from "./useBudgetMonthRefresh";

function loadErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function useBudgetsWorkspace(active = true) {
  const planningToday = useBudgetSavingDate(active);
  const [months, setMonths] = useState<any[]>([]);
  const [matrixCategories, setMatrixCategories] = useState<any[]>([]);
  const [matrixYear, setMatrixYear] = useState(String(new Date().getFullYear()));
  const [matrixWindowStart, setMatrixWindowStart] = useState<number | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixSaveStatus, setMatrixSaveStatus] = useState<string | null>(null);
  const [budgetMatrix, setBudgetMatrix] = useState<any | null>(null);
  const [followingMatrix, setFollowingMatrix] = useState<any | null>(null);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [matrixEdits, setMatrixEdits] = useState<Record<string, Record<string, string>>>({});
  const [cellSchedule, setCellSchedule] = useState<{ rowId: string; month: string } | null>(null);
  const [cellLimitNotice, setCellLimitNotice] = useState<(CellLimitResult & {
    rowId: string; month: string; name: string;
  }) | null>(null);
  const cellBaselines = useRef<Record<string, string>>({});
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrixBusy, setMatrixBusy] = useState(false);
  const [matrixBaseCurrency, setMatrixBaseCurrency] = useState("USD");
  const [matrixBaseCurrencyStatus, setMatrixBaseCurrencyStatus] = useState<string | null>(null);
  const [expandedMatrixRows, setExpandedMatrixRows] = useState<Record<string, boolean>>({});
  const [addingMatrixSubcategoryFor, setAddingMatrixSubcategoryFor] = useState<string | null>(null);
  const [matrixSubcategoryDrafts, setMatrixSubcategoryDrafts] = useState<Record<string, string>>({});
  const [editingMatrixSubcategoryId, setEditingMatrixSubcategoryId] = useState<string | null>(null);
  const [matrixSubcategoryRenameValues, setMatrixSubcategoryRenameValues] = useState<Record<string, string>>({});
  const matrixRequest = useRef(0);
  const matrixDrafts = useRef<Record<string, Record<string, Record<string, string>>>>({});
  const matrixReports = useRef<Record<string, any>>({});
  const reportRevisions = useRef<Record<string, number>>({});
  const observedRevision = useRef(FinanceDataRevision.current);
  const followingRequest = useRef(0);
  const followingAttempt = useRef<any | null>(null);
  const pairRetries = useRef(0);
  const observedMonth = useRef<string | null>(null);
  const latestMatrix = useRef(budgetMatrix);
  latestMatrix.current = budgetMatrix;

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

  /** A loaded year is reusable until financial data or the calendar month changes. */
  const cachedMatrix = (year: string, currency: string) => {
    const key = `${year}:${currency}`;
    const report = matrixReports.current[key];
    return report && report.current_month === planningToday.slice(0, 7)
      && reportRevisions.current[key] === FinanceDataRevision.current ? report : null;
  };

  const loadMatrix = async (yearValue?: string, restoreDraft = false, preserveEdits = false, reuseLoaded = false) => {
    const year = yearValue || matrixYear;
    const request = ++matrixRequest.current;
    const cached = reuseLoaded ? cachedMatrix(year, latestMatrix.current?.base_currency || matrixBaseCurrency) : null;
    const revision = FinanceDataRevision.current;
    setMatrixLoading(!cached);
    let data: any;
    try {
      data = cached || await getFeatureData<any>(`/reports/budget-matrix?year=${year}`);
    } finally {
      if (request === matrixRequest.current) setMatrixLoading(false);
    }
    // A slower previous year must never replace the selected year's matrix.
    if (request !== matrixRequest.current) return data;
    const previousMatrix = latestMatrix.current;
    latestMatrix.current = data;
    setBudgetMatrix(data);
    observedRevision.current = revision;
    cellBaselines.current = {};
    setMatrixBaseCurrency(data.base_currency || "USD");
    const edits: Record<string, Record<string, string>> = {};
    (data.categories || []).forEach((category: any) => {
      const monthMap: Record<string, string> = {};
      (data.months || []).forEach((month: string) => {
        const plannedEntered = Boolean(category.budget_entered?.[month]);
        const plannedAmount = Number(category.budget?.[month] || 0);
        if (plannedEntered) {
          monthMap[month] = String(plannedAmount);
        } else {
          // Keep actual fallbacks distinct from explicitly entered plan targets.
          monthMap[month] = "";
        }
      });
      edits[String(category.id)] = monthMap;
    });
    const draftKey = `${year}:${data.base_currency || "USD"}`;
    const draftBaseline = matrixReports.current[draftKey];
    const cachedDraft = matrixDrafts.current[draftKey];
    matrixReports.current[draftKey] = data;
    reportRevisions.current[draftKey] = revision;
    setMatrixEdits((previous) => {
      const refreshed = preserveEdits ? BudgetDraftRefresh.merge(previousMatrix, previous, data)
        : restoreDraft && cachedDraft ? BudgetDraftRefresh.merge(draftBaseline, cachedDraft, data) : edits;
      if (previousMatrix?.year !== data.year || previousMatrix?.base_currency !== data.base_currency) return refreshed;
      // Updating the primary calendar must retain drafts in visible months of the following year.
      return Object.fromEntries(Object.entries(refreshed).map(([id, values]) =>
        [id, { ...previous[id], ...values }]));
    });
    if (!restoreDraft) delete matrixDrafts.current[draftKey];
    return data;
  };

  // Future purchase guidance needs the next calendar even when its months are off screen.
  const loadFollowingMatrix = async (primaryYear: string, preserveEdits = true) => {
    const year = String(Number(primaryYear) + 1);
    const request = ++followingRequest.current;
    const revision = FinanceDataRevision.current;
    const candidate = cachedMatrix(year, latestMatrix.current?.base_currency || matrixBaseCurrency);
    const cached = candidate && BudgetMatrixPeriod.cashMatches(latestMatrix.current, candidate) ? candidate : null;
    setFollowingLoading(!cached);
    try {
      const data = cached || await getFeatureData<any>(`/reports/budget-matrix?year=${year}`);
      if (request !== followingRequest.current || String(latestMatrix.current?.year) !== primaryYear) return;
      if (data.base_currency !== latestMatrix.current.base_currency
        || data.current_month !== latestMatrix.current.current_month) return;
      if (!BudgetMatrixPeriod.cashMatches(latestMatrix.current, data)) {
        if (pairRetries.current >= 1) throw new Error("Bank data changed while loading the next year. Refresh to load a matching period.");
        pairRetries.current += 1;
        await loadMatrix(primaryYear, false, true);
        return;
      }
      pairRetries.current = 0;
      const key = `${year}:${data.base_currency || "USD"}`;
      const baseline = matrixReports.current[key];
      const cachedDraft = matrixDrafts.current[key];
      const wasLoaded = followingMatrix?.year === data.year;
      matrixReports.current[key] = data;
      reportRevisions.current[key] = revision;
      setFollowingMatrix(data);
      setMatrixEdits((previous) => {
        const fresh = BudgetDraftRefresh.merge(baseline, preserveEdits ? wasLoaded ? previous : cachedDraft || {} : {}, data);
        return Object.fromEntries(Object.entries(fresh).map(([id, values]) => [id, { ...previous[id], ...values }]));
      });
      if (!preserveEdits) delete matrixDrafts.current[key];
    } catch (err) {
      if (request === followingRequest.current && String(latestMatrix.current?.year) === primaryYear) throw err;
    } finally {
      if (request === followingRequest.current) setFollowingLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setMatrixError(null);
    loadMatrix(matrixYear, true, false, true).catch((err) => {
      if (!cancelled) setMatrixError(loadErrorMessage(err, `Unable to load budget matrix for ${matrixYear}.`));
    });
    return () => {
      cancelled = true;
      matrixRequest.current += 1;
    };
  }, [matrixYear]);

  useBudgetMonthRefresh({
    month: budgetMatrix?.current_month,
    busy: !active || matrixBusy || matrixLoading || followingLoading,
    onRefresh: async () => {
      if (!latestMatrix.current || String(latestMatrix.current.year) !== matrixYear) return;
      const pending = loadMatrix(matrixYear, false, true);
      const request = matrixRequest.current;
      try {
        await pending;
        if (request === matrixRequest.current) setMatrixError(null);
      } catch (err) {
        if (request === matrixRequest.current) {
          setMatrixError(loadErrorMessage(err, "Unable to refresh the budget for the new month."));
        }
      }
    }
  });

  // Returning from another feature only refreshes when that feature changed finance data.
  useEffect(() => {
    if (!active || !latestMatrix.current || observedRevision.current === FinanceDataRevision.current) return;
    void Promise.all([loadMonths(), loadMatrixCategories(), loadMatrix(matrixYear, false, true)])
      .catch(reason => setMatrixError(loadErrorMessage(reason, "Could not refresh changed budget data.")));
  }, [active]);

  const ensureMonthId = async (month: string) => {
    const existing = months.find((row) => row.month === month);
    if (existing) return existing.id;
    const created = await sendFeatureCommand<any>("/budgets/months", { month, rollover_enabled: false });
    setMonths((prev) => [...prev, created]);
    return created.id;
  };

  const updateMatrixCell = (bucketKey: string, month: string, value: string) => {
    setMatrixSaveStatus(null);
    const key = `${bucketKey}:${month}`;
    if (!(key in cellBaselines.current)) {
      const row = [...incomeRows, ...expenseRows].find(item => String(item.id) === bucketKey);
      cellBaselines.current[key] = row ? getCellInputValue(row, month) : "";
    }
    setMatrixEdits((prev) => ({
      ...prev,
      [bucketKey]: {
        ...(prev[bucketKey] || {}),
        [month]: value
      }
    }));
  };

  // Recalculate from the cached bank snapshot only when forecast inputs change.
  const matrixModel = useMemo(() => buildBudgetMatrixModel({
    budgetMatrix, followingMatrix, matrixEdits, today: planningToday, windowStart: matrixWindowStart,
    priorMatrices: Object.values(matrixReports.current), priorDrafts: matrixDrafts.current
  }), [budgetMatrix, followingMatrix, matrixEdits, planningToday, matrixWindowStart]);
  const {
    budgetCurrency,
    currentBudgetMonth,
    summaryMonth,
    cashFlow,
    cashSummary,
    cashPositions,
    datedCashCheckpoints,
    summaryChartGradient,
    periodExpenseBreakdown,
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
    hasFollowingPeriod,
    visibleMatrixMonths,
    matrixWindowStart: effectiveWindowStart,
    matrixWindowMax
  } = matrixModel;

  /** Review the same cached forecast used for the visible draft totals. */
  const reviewCell = (row: any, month: string, raw: string, previous: string, model = matrixModel) => {
    const minimum = model.planningMinimumCash[month] ?? null;
    const recorded = Number(row.expense?.[month] || 0) + Number(row.pending_expense?.[month] || 0);
    const committed = row.cash_neutral ? 0 : recorded;
    const headroom = minimum === null ? null : Math.max(0, Number(raw) - committed) + minimum;
    const complete = hasFollowingPeriod || Number(matrixYear) >= 2100 || matrixYear < currentBudgetMonth.slice(0, 4);
    return row.type === "income" ? BudgetCellLimit.income(raw, previous, complete ? minimum : null,
      Number(row.income?.[month] || 0) + Number(row.pending_income?.[month] || 0))
      : BudgetCellLimit.expense(raw, committed, complete ? headroom : null);
  };

  /** Persist just one cell and apply its acknowledgement without reloading reports. */
  const persistCell = async (row: any, month: string, raw: string, date: string | null) => {
    const rowId = String(row.id);
    if (raw === "") {
      const targetId = row.budget_target_id?.[month];
      if (targetId) await removeFeatureRecord(`/budgets/bucket-targets/${targetId}`);
      applySavedCells([{ rowId, month, amount: 0, deleted: true }]);
    } else {
      const amount = Number(raw);
      const saved = await sendFeatureCommand<any>("/budgets/bucket-targets", {
        budget_month_id: await ensureMonthId(month), budget_bucket: rowId,
        amount, rollover_amount: 0, due_date: date
      });
      applySavedCells([{ rowId, month, amount, targetId: saved.id, dueDate: date,
        futureCost: Boolean(saved.future_cost), rollover: 0 }]);
    }
    delete cellBaselines.current[`${rowId}:${month}`];
  };

  /** Enter checks affordability locally, then saves only the valid cell. */
  const commitMatrixCell = async (rowId: string, month: string, invalidInput = false) => {
    const row = [...incomeRows, ...expenseRows].find(item => String(item.id) === rowId);
    if (!row || !isMonthEditable(month) || matrixBusy || matrixLoading || followingLoading) return false;
    const raw = getCellInputValue(row, month);
    const key = `${rowId}:${month}`;
    const previous = cellBaselines.current[key] ?? (row.budget_entered?.[month] ? String(row.budget[month]) : "");
    const result: CellLimitResult = invalidInput ? { accepted: false, suggested: null, reason: "invalid" }
      : reviewCell(row, month, raw, previous);
    if (result.accepted) {
      cellBaselines.current[key] = raw;
      setMatrixError(null);
      setMatrixBusy(true);
      try {
        await persistCell(row, month, raw, row.due_date?.[month] || null);
        setMatrixSaveStatus(`${row.name} ${formatMonthYearLabel(month)} cell saved.`);
        return true;
      } catch (reason) {
        setMatrixError(loadErrorMessage(reason, "Could not save this cell. Your amount remains in the draft."));
        setMatrixSaveStatus("Cell not saved. Your amount remains in the draft.");
      } finally { setMatrixBusy(false); }
      return false;
    }
    setMatrixEdits(edits => ({ ...edits, [rowId]: { ...edits[rowId], [month]: previous } }));
    setCellLimitNotice({ ...result, rowId, month, name: row.name });
    return false;
  };

  /** Recheck a suggested replacement against any changes since its popup opened. */
  const applyCellLimitSuggestion = () => {
    if (!cellLimitNotice || cellLimitNotice.suggested === null) return;
    const { rowId, month, suggested } = cellLimitNotice;
    const row = [...incomeRows, ...expenseRows].find(item => String(item.id) === rowId);
    if (!row || !isMonthEditable(month) || matrixBusy || matrixLoading || followingLoading) return;
    const raw = suggested.toFixed(2);
    const edits = { ...matrixEdits, [rowId]: { ...matrixEdits[rowId], [month]: raw } };
    const candidate = buildBudgetMatrixModel({ budgetMatrix, followingMatrix, matrixEdits: edits,
      today: planningToday, windowStart: matrixWindowStart,
      priorMatrices: Object.values(matrixReports.current), priorDrafts: matrixDrafts.current });
    const result = reviewCell(row, month, raw, getCellInputValue(row, month), candidate);
    if (!result.accepted) { setCellLimitNotice({ ...result, rowId, month, name: row.name }); return; }
    cellBaselines.current[`${rowId}:${month}`] = raw;
    setMatrixEdits(edits);
    setCellLimitNotice(null);
    setMatrixSaveStatus("Suggested amount applied to your draft.");
  };

  const crossesYear = visibleMatrixMonths.some((month) => month.slice(0, 4) !== matrixYear);
  useEffect(() => {
    const needsFuturePlans = matrixYear >= currentBudgetMonth.slice(0, 4) && Number(matrixYear) < 2100;
    if (!active || !budgetMatrix || (!needsFuturePlans && !crossesYear && !followingMatrix) || followingLoading || matrixBusy) return;
    if (followingAttempt.current === budgetMatrix) return;
    followingAttempt.current = budgetMatrix;
    loadFollowingMatrix(matrixYear).catch((err) =>
      setMatrixError(loadErrorMessage(err, "Unable to load the following budget year.")));
  }, [active, budgetMatrix, crossesYear, followingLoading, matrixBusy]);

  // Recheck the latest draft so queued edits, including explicit zero, are preserved.
  const acceptSpendingSuggestions = (month: string, bucketKey?: string) => {
    if (!budgetMatrix || matrixBusy || matrixLoading || followingLoading
      || (!hasFollowingPeriod && matrixYear >= currentBudgetMonth.slice(0, 4) && Number(matrixYear) < 2100)
      || !planningMonths.includes(month) || !isMonthEditable(month)) return;
    setMatrixSaveStatus(null);
    setMatrixEdits((previous) => {
      // Recompute cash constraints from the latest edits so rapid accepts cannot reuse headroom.
      const plan = buildBudgetMatrixModel({ budgetMatrix, followingMatrix, matrixEdits: previous, today: planningToday,
        windowStart: matrixWindowStart, priorMatrices: Object.values(matrixReports.current),
        priorDrafts: matrixDrafts.current }).spendingSuggestions[month];
      const next = { ...previous };
      for (const [id, suggestion] of Object.entries(plan?.suggestions || {})) {
        if (bucketKey !== undefined && id !== bucketKey) continue;
        next[id] = { ...previous[id], [month]: suggestion.amount.toFixed(2) };
      }
      return next;
    });
  };

  /** Save one cell's amount and optional calendar date, retaining other unsaved drafts. */
  const saveCellSchedule = async (date: string | null) => {
    if (!cellSchedule || matrixBusy || matrixLoading || followingLoading) return;
    const { rowId, month } = cellSchedule;
    const row = [...incomeRows, ...expenseRows].find((item: any) => String(item.id) === rowId);
    if (!row || !isMonthEditable(month)) throw new Error("This cell is no longer editable.");
    const raw = getCellInputValue(row, month);
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid cell amount first.");
    if (raw === "" && date) throw new Error("Enter an amount before setting a date, or clear the date to remove this plan.");
    if (date && date.slice(0, 7) !== month) throw new Error("Choose a date within this cell's month.");
    setMatrixBusy(true);
    try {
      await persistCell(row, month, raw, date);
      setMatrixSaveStatus(`${row.name} ${formatMonthYearLabel(month)} amount and date saved.`);
      setCellSchedule(null);
    } finally { setMatrixBusy(false); }
  };

  /** Toggle only the saved marker; unrelated amount drafts stay unsaved. */
  const toggleCellFutureCost = async (rowId: string, month: string) => {
    if (matrixBusy || matrixLoading || followingLoading || !isMonthEditable(month)) return;
    const row = [...incomeRows, ...expenseRows].find(item => String(item.id) === rowId);
    if (!row || row.type === "income" || row.cash_neutral) return;
    const raw = getCellInputValue(row, month);
    if (raw === "" || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      setMatrixSaveStatus("Enter an amount before marking a future cost.");
      return;
    }
    setMatrixBusy(true);
    try {
      const marked = !row.future_cost?.[month];
      const saved = await sendFeatureCommand<any>("/budgets/bucket-targets", {
        budget_month_id: await ensureMonthId(month), budget_bucket: rowId,
        amount: row.budget_entered?.[month] ? Number(row.budget[month]) : Number(raw),
        rollover_amount: Number(row.rollover?.[month] || 0),
        future_cost: marked
      });
      applySavedCells([{ rowId, month, amount: saved.amount, targetId: saved.id,
        dueDate: saved.due_date, futureCost: marked, rollover: saved.rollover_amount }]);
      setMatrixSaveStatus(`${row.name} ${formatMonthYearLabel(month)} ${marked ? "marked as a future cost" : "future-cost mark removed"}.`);
    } catch (reason) {
      setMatrixSaveStatus(reason instanceof Error ? reason.message : "Could not update future cost.");
    } finally { setMatrixBusy(false); }
  };

  const acceptSpendingSuggestion = (bucketKey: string, month: string) => acceptSpendingSuggestions(month, bucketKey);
  const acceptMonthSuggestions = (month: string) => acceptSpendingSuggestions(month);

  // Keep unsaved plans when browsing other calendar years in this workspace.
  const selectMatrixYear = (year: string, startIndex: number | null = null) => {
    if (!/^\d{4}$/.test(year) || Number(year) < 2000 || Number(year) > 2100 || year === matrixYear) return;
    for (const report of [budgetMatrix, followingMatrix]) {
      if (report) matrixDrafts.current[`${report.year}:${budgetCurrency}`] = matrixEdits;
    }
    matrixRequest.current += 1;
    followingRequest.current += 1;
    followingAttempt.current = null;
    pairRetries.current = 0;
    const cached = cachedMatrix(year, budgetCurrency);
    latestMatrix.current = cached;
    setBudgetMatrix(cached);
    const next = cachedMatrix(String(Number(year) + 1), budgetCurrency);
    setFollowingMatrix(cached && next && BudgetMatrixPeriod.cashMatches(cached, next) ? next : null);
    setFollowingLoading(false);
    setMatrixWindowStart(startIndex);
    setMatrixSaveStatus(null);
    setMatrixYear(year);
    setMatrixDrilldown(null);
    setCellSchedule(null);
  };

  // Keep a view following the current month visible without moving historical or future browsing.
  useEffect(() => {
    const month = budgetMatrix?.current_month;
    if (!month) return;
    const previous = observedMonth.current;
    observedMonth.current = month;
    if (!previous || month <= previous || !visibleMatrixMonths.includes(previous)
      || month <= visibleMatrixMonths[visibleMatrixMonths.length - 1]) return;
    const next = BudgetMonthWindow.endingAt(month);
    if (next.year === matrixYear) setMatrixWindowStart(next.startIndex);
    else selectMatrixYear(next.year, next.startIndex);
  }, [budgetMatrix?.current_month]);

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

  /** Acknowledged writes update cached plan metadata without querying bank reports. */
  const applySavedCells = (cells: SavedCell[]) => {
    const update = (report: any) => BudgetSavedPlans.apply(report, cells);
    const changedTargets = cells.filter(cell => {
      const row = [...incomeRows, ...expenseRows].find(item => String(item.id) === cell.rowId);
      const entered = Boolean(row?.budget_entered?.[cell.month]);
      return entered !== !cell.deleted || (!cell.deleted && Number(row?.budget?.[cell.month] || 0) !== cell.amount);
    });
    for (const key of Object.keys(matrixReports.current)) {
      const report = matrixReports.current[key];
      matrixReports.current[key] = update(report);
      // Later reports embed earlier plans; refresh that context only after a real target change.
      if (changedTargets.some(cell => cell.month < report.months?.[0])) delete reportRevisions.current[key];
    }
    const primary = update(latestMatrix.current);
    latestMatrix.current = primary;
    followingAttempt.current = primary;
    setBudgetMatrix(primary);
    setFollowingMatrix((current: any) => update(current));
  };

  const saveMatrixAll = async () => {
    if (!budgetMatrix) return;
    setMatrixError(null);
    setMatrixSaveStatus(null);
    setMatrixBusy(true);
    try {
      const operations: Array<{
        kind: "upsert" | "delete";
        row: any;
        month: string;
        amount: number;
        targetId?: number;
      }> = [];
      for (const row of [...incomeRows, ...expenseRows]) {
        const bucketKey = String(row.id);
        for (const month of planningMonths) {
          if (!isMonthEditable(month)) continue;
          const raw = matrixEdits[bucketKey]?.[month] ?? "";
          const targetId = row.budget_target_id?.[month];
          const currentAmount = row.budget_entered?.[month] ? Number(row.budget?.[month] || 0) : 0;
          if (raw === "") {
            if (targetId) {
              operations.push({ kind: "delete", row, month, amount: 0, targetId });
            }
            continue;
          }
          const amount = Number(raw);
          if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(`Invalid amount for ${row.name} ${formatMonthLabel(month)}`);
          }
          if (targetId && Math.abs(amount - currentAmount) < 0.00001) {
            continue;
          }
          operations.push({ kind: "upsert", row, month, amount, targetId });
        }
      }
      const monthIds: Record<string, number> = {};
      for (const operation of operations) {
        if (operation.kind === "delete") {
          await removeFeatureRecord(`/budgets/bucket-targets/${operation.targetId}`);
          applySavedCells([{ rowId: String(operation.row.id), month: operation.month, amount: 0, deleted: true }]);
          continue;
        }
        if (!monthIds[operation.month]) {
          monthIds[operation.month] = await ensureMonthId(operation.month);
        }
        const saved = await sendFeatureCommand<any>("/budgets/bucket-targets", {
          budget_month_id: Number(monthIds[operation.month]),
          budget_bucket: String(operation.row.id),
          amount: operation.amount,
          rollover_amount: 0,
          due_date: operation.row.due_date?.[operation.month] || null
        });
        delete cellBaselines.current[`${operation.row.id}:${operation.month}`];
        applySavedCells([{ rowId: String(operation.row.id), month: operation.month, amount: operation.amount,
          targetId: saved.id, dueDate: saved.due_date, futureCost: Boolean(saved.future_cost), rollover: 0 }]);
      }
      setMatrixDrilldown(null);
      setMatrixSaveStatus(`All ${matrixYear}${followingMatrix ? `–${Number(matrixYear) + 1}` : ""} cells saved.`);
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to save matrix.");
    } finally {
      setMatrixBusy(false);
    }
  };

  const autofillMatrixFromActuals = () => {
    if (!budgetMatrix) return;
    setMatrixSaveStatus(null);
    const next: Record<string, Record<string, string>> = { ...matrixEdits };
    for (const category of [...incomeRows, ...expenseRows]) {
      const bucketKey = String(category.id);
      const monthsMap: Record<string, string> = { ...(next[bucketKey] || {}) };
      for (const month of planningMonths) {
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
    visibleMatrixMonths,
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
    pairRetries.current = 0;
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
    setMatrixYear: selectMatrixYear,
    setMatrixWindowStart,
    matrixWindowStart: effectiveWindowStart,
    matrixWindowMax,
    budgetMatrix,
    matrixError,
    matrixSaveStatus,
    cellSchedule, setCellSchedule, saveCellSchedule, toggleCellFutureCost, planningToday,
    cellLimitNotice, setCellLimitNotice, commitMatrixCell, applyCellLimitSuggestion,
    matrixBusy: matrixBusy || matrixLoading || followingLoading,
    matrixNavigationBusy: matrixBusy || matrixLoading,
    futurePlanningBusy: matrixLoading || followingLoading,
    futurePlanningReady: hasFollowingPeriod || Number(matrixYear) >= 2100
      || matrixYear < currentBudgetMonth.slice(0, 4),
    matrixReady: Boolean(budgetMatrix) && (!crossesYear || hasFollowingPeriod),
    matrixLoading,
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
    acceptSpendingSuggestion,
    acceptMonthSuggestions,
    spendingSuggestions,
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
    saveMatrixAll,
    autofillMatrixFromActuals,
    incomeRows,
    expenseRows,
    matrixColSpan,
    matrixMonths,
    planningMonths,
    visibleMatrixMonths,
    budgetCurrency,
    summaryMonth,
    cashFlow,
    cashSummary,
    cashPositions,
    datedCashCheckpoints,
    periodExpenseBreakdown,
    summaryChartGradient,
    matrixDrilldownSubcategories,
    renderSubcategoryRows,
    renderInlineSubcategoryEditor,
    saveMatrixBaseCurrency,
    refreshBudgetTransactions
  };

  return viewModel;
}

import { BudgetTargetPace as CashPlan, type FutureCost } from "../../domain/BudgetTargetPace";
import { BudgetFutureCosts } from "../BudgetFutureCosts";
import { BudgetTargetPace } from "../BudgetTargetPace";
import { BudgetMonthNavigation } from "../BudgetMonthNavigation";
import { BudgetNetSavings } from "../BudgetNetSavings";
import { BudgetMonthBattery } from "../BudgetMonthBattery";
import { BudgetTotalsChart } from "../BudgetTotalsChart";
import { BudgetMonthSuggestionControl, BudgetSpendingSuggestion } from "../BudgetSpendingSuggestion";

export function BudgetMatrixTableSection({ model }: { model: any }) {
  const savingDate = model.planningToday;
  const {
    budgetCurrency,
    budgetMatrix,
    expenseRows,
    formatCurrency,
    formatMonthLabel,
    formatMonthYearLabel,
    incomeRows,
    getEffectiveCellAmount,
    planningMonths,
    matrixReady,
    matrixYear,
    visibleMatrixMonths,
    cashPositions,
    renderMatrixMoney,
    saveMatrixAll,
    spendingSuggestions,
    acceptMonthSuggestions,
    matrixBusy,
    matrixSaveStatus
  } = model;
  // Keep the scale stable while sliding through the loaded calendars.
  const monthCash = (month: string): number | null => {
    const position = cashPositions[month];
    return position?.cashLeft ?? null;
  };
  const batteryScale = Math.max(0, ...planningMonths.map((month: string) => monthCash(month) ?? 0));
  const mixedYears = visibleMatrixMonths.some((month: string) => month.slice(0, 4) !== matrixYear);

  // Use the same draft targets and actual/pending offsets as the monthly cash batteries.
  let invalidPlans = false;
  let planningThrough = savingDate.slice(0, 7);
  const futureCosts: FutureCost[] = [];
  for (const row of [...incomeRows, ...expenseRows]) {
    for (const month of planningMonths) {
      if (month < savingDate.slice(0, 7)) continue;
      const raw = model.getCellInputValue(row, month);
      if (raw === "") continue;
      const target = Number(raw);
      if (!Number.isFinite(target) || target < 0) { invalidPlans = true; continue; }
      if (month > planningThrough) planningThrough = month;
      if (row.type === "income" || row.cash_neutral || month < savingDate.slice(0, 7)) continue;
      const recorded = Number(row.expense?.[month] || 0) + Number(row.pending_expense?.[month] || 0);
      const amount = Math.max(0, target - recorded);
      if (amount > 0) futureCosts.push({ month, amount, name: row.name, rowId: String(row.id), marked: Boolean(row.future_cost?.[month]) });
    }
  }
  const futurePlan = new CashPlan(futureCosts, cashPositions, savingDate, model.futurePlanningReady && !invalidPlans, model.datedCashCheckpoints, planningThrough);

  return (
    <>
      {budgetMatrix ? (
        <>
        <BudgetFutureCosts plan={futurePlan} invalid={invalidPlans}
          loading={model.futurePlanningBusy} currency={budgetCurrency} formatCurrency={formatCurrency}
          formatMonth={formatMonthYearLabel} />
        <p className="muted budget-live-note">Updates as you type. Cash left excludes planned Savings reserved for you. Enter checks and saves one cell; Save all cells keeps all drafts.</p>
        <div className="matrix-table-actions">
          <span className="muted" role="status">{matrixSaveStatus}</span>
          <button onClick={saveMatrixAll} disabled={matrixBusy || !matrixReady}
            title="Save plans for all loaded months, including months outside this window">Save all cells</button>
        </div>
        <BudgetMonthNavigation model={model} />
        <div className="matrix-scroll">
          <table className="matrix-table">
            <colgroup>
              <col className="matrix-label-column" />
              {visibleMatrixMonths.map((month: string) => <col key={month} />)}
              <col className="matrix-annual-column" />
            </colgroup>
            <thead>
              <tr>
                <th>Month</th>
                {visibleMatrixMonths.map((month: string) => {
                  const rawBalance = monthCash(month);
                  const balance = rawBalance !== null && Math.abs(rawBalance) < 0.005 ? 0 : rawBalance;
                  const amountLabel = balance === null ? "—" : formatCurrency(balance, budgetCurrency);
                  const projected = cashPositions[month]?.state !== "past";
                  return (
                    <th key={`head-${month}`} scope="col">
                      <div className="matrix-month-heading">
                        <BudgetMonthBattery
                          balance={balance}
                          scale={batteryScale}
                          amountLabel={amountLabel}
                          description={balance === null
                            ? `${formatMonthYearLabel(month)}: cash history unavailable for the linked account coverage`
                            : `${formatMonthYearLabel(month)}: ${amountLabel} ${projected ? "estimated spendable cash after plans and reserved Savings" : "cash left after all recorded receipts, payments and reservations"}`}
                          projected={projected}
                        />
                        <span>{formatMonthLabel(month)}{mixedYears ? ` ${month.slice(2, 4)}` : ""}</span>
                        <BudgetMonthSuggestionControl plan={spendingSuggestions[month]}
                          monthLabel={formatMonthYearLabel(month)} currency={budgetCurrency}
                          onAcceptAll={() => acceptMonthSuggestions(month)} disabled={matrixBusy || !model.futurePlanningReady} />
                      </div>
                    </th>
                  );
                })}
                <th className="matrix-annual-heading" scope="col">Monthly average <span>Visible months · actuals / plans</span></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="matrix-label-cell"><strong>Operating income total</strong></td>
                {visibleMatrixMonths.map((month: string) => (
                  <td key={`income-summary-top-${month}`} className="matrix-cell">
                    {renderMatrixMoney(incomeRows.reduce((sum: number, row: any) =>
                      sum + getEffectiveCellAmount(row, month), 0), budgetCurrency)}
                  </td>
                ))}
                <td className="matrix-total-cell"><BudgetTotalsChart values={visibleMatrixMonths.map((month: string) => incomeRows.reduce(
                  (sum: number, row: any) => sum + getEffectiveCellAmount(row, month), 0))} currency={budgetCurrency} formatCurrency={formatCurrency} /></td>
              </tr>
              <BudgetMatrixBucketRows
                model={{ ...model, futurePlan }}
                rows={incomeRows}
                rowType="income"
                sectionTitle="Operating income"
              />
              <BudgetMatrixBucketRows
                model={{ ...model, futurePlan }}
                rows={expenseRows}
                rowType="expense"
                sectionTitle="Operating expense"
              />
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <p className="muted">Loading matrix...</p>
      )}
    </>
  );
}

function BudgetMatrixBucketRows({
  model,
  rows,
  rowType,
  sectionTitle
}: {
  model: any;
  rows: any[];
  rowType: "income" | "expense";
  sectionTitle: string;
}) {
  const {
    Fragment,
    budgetCurrency,
    formatCompactCurrency,
    formatCurrency,
    formatMonthYearLabel,
    getCellInputValue,
    getEffectiveCellAmount,
    getMatrixCategoryForRow,
    hasSubcategoryRows,
    isMatrixRowExpanded,
    isMonthEditable,
    matrixColSpan,
    planningMonths,
    visibleMatrixMonths,
    openMatrixDrilldown,
    renderInlineSubcategoryEditor,
    renderMatrixMoney,
    renderSubcategoryRows,
    startAddingMatrixSubcategory,
    spendingSuggestions,
    matrixBusy,
    toggleMatrixRowExpanded
  } = model;

  if (rows.length === 0) {
    return null;
  }

  return (
    <>
      <tr className="matrix-section-row">
        <td colSpan={matrixColSpan}>
          <strong>{sectionTitle}</strong>
        </td>
      </tr>
      {rows.map((row: any) => {
        const actualField = rowType === "income" ? "income" : "expense";
        // Trend and average use exactly the same amounts as the visible cells.
        const values = visibleMatrixMonths.map((month: string) => getEffectiveCellAmount(row, month));
        return (
          <Fragment key={`${rowType}-${row.id}`}>
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
                    {!row.read_only && getMatrixCategoryForRow(row)?.id && (
                      <button
                        className="matrix-subcategory-action"
                        onClick={() => startAddingMatrixSubcategory(String(row.id))}
                      >
                        Add
                      </button>
                    )}
                  </div>
                  {row.cash_neutral && <span className="muted">Net saved</span>}
                  {rowType === "expense" && !row.cash_neutral && <BudgetTargetPace
                    rowId={String(row.id)} plan={model.futurePlan} currency={budgetCurrency}
                    formatCurrency={formatCurrency} formatMonth={formatMonthYearLabel} />}
                  {renderInlineSubcategoryEditor(row)}
                </div>
              </td>
              {visibleMatrixMonths.map((month: string) => {
                const actual = Number(row[actualField]?.[month] || 0);
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
                      <div>{actual !== 0 ? renderMatrixMoney(actual, budgetCurrency) : "—"}</div>
                    ) : (
                      <div className="budget-cell-field"
                        data-future-cost={Boolean(row.future_cost?.[month])}
                        style={{
                        "--cell-control-width": rowType === "expense" && !row.cash_neutral ? "64px" : "38px",
                        "--cell-expanded-width": `${Math.max(7, rawValue.length + 1)}ch`
                      } as import("react").CSSProperties}>
                        <input aria-label={`${row.name} plan for ${month}`} type="number" step="0.01"
                          value={rawValue} disabled={!planningMonths.includes(month)}
                          placeholder={actual !== 0 ? actual.toFixed(2) : "0.00"}
                          onKeyDown={async event => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            const input = event.currentTarget;
                            const submitted = input.value;
                            const saved = await model.commitMatrixCell(String(row.id), month, input.validity.badInput);
                            // Collapse only this saved edit; do not interrupt a newer edit or moved focus.
                            if (saved && document.activeElement === input && input.value === submitted) input.blur();
                          }}
                          onChange={event => model.updateMatrixCell(String(row.id), month, event.target.value)} />
                        <button type="button" className="budget-cell-date" aria-haspopup="dialog"
                          data-has-date={Boolean(row.due_date?.[month])}
                          title={row.due_date?.[month] || "Set date (enter an amount first)"}
                          disabled={matrixBusy || rawValue === "" || !Number.isFinite(Number(rawValue)) || Number(rawValue) < 0}
                          aria-label={`Set date for ${row.name} ${formatMonthYearLabel(month)}`}
                          onClick={() => model.setCellSchedule({ rowId: String(row.id), month })}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <rect x="4" y="5" width="16" height="16" rx="2" />
                            <path d="M8 3v4m8-4v4M4 10h16" />
                            <path d="M8 14h3v3H8z" fill="currentColor" stroke="none" />
                          </svg>
                        </button>
                        {rowType === "expense" && !row.cash_neutral && <button type="button"
                          className="budget-cell-mark"
                          aria-label={`${row.future_cost?.[month] ? "Unmark" : "Mark"} ${row.name} ${formatMonthYearLabel(month)} as a future cost`}
                          aria-pressed={Boolean(row.future_cost?.[month])}
                          aria-disabled={matrixBusy || rawValue === "" || !Number.isFinite(Number(rawValue)) || Number(rawValue) < 0}
                          title={row.future_cost?.[month] ? "Unmark future cost" : "Mark as future cost"}
                          onClick={() => model.toggleCellFutureCost(String(row.id), month)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="m5 12 4 4L19 6" />
                          </svg>
                        </button>}
                      </div>
                    )}
                    {rowType === "expense" && !locked && spendingSuggestions[month]?.suggestions[String(row.id)] &&
                      <BudgetSpendingSuggestion {...spendingSuggestions[month].suggestions[String(row.id)]}
                        bucketName={row.name} monthLabel={formatMonthYearLabel(month)} currency={budgetCurrency}
                        onAccept={() => model.acceptSpendingSuggestion(String(row.id), month)}
                        disabled={matrixBusy || !model.futurePlanningReady} />}
                    {row.cash_neutral && <BudgetNetSavings month={month}
                      currentMonth={model.currentBudgetMonth} cashFlow={model.cashFlow}
                      currency={budgetCurrency} formatCurrency={formatCurrency} />}
                    {!row.cash_neutral && actual !== 0 && <div className="muted">Act {formatCompactCurrency(actual, budgetCurrency)}</div>}
                  </td>
                );
              })}
              <td className="matrix-total-cell"><BudgetTotalsChart values={values} currency={budgetCurrency} formatCurrency={formatCurrency} />
                {row.cash_neutral && <BudgetNetSavings
                  month={visibleMatrixMonths.filter((month: string) => month <= model.currentBudgetMonth).slice(-1)[0]}
                  currentMonth={model.currentBudgetMonth} cashFlow={model.cashFlow}
                  currency={budgetCurrency} formatCurrency={formatCurrency} label="Latest saved " />}
              </td>
            </tr>
            {renderSubcategoryRows(row)}
          </Fragment>
        );
      })}
    </>
  );
}

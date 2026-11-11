import { useEffect, useState } from "react";
import { BudgetMonthWindow } from "../domain/BudgetMonthWindow";

/** Select the first month of a six-month window with one native slider. */
export function BudgetMonthNavigation({ model }: { model: any }) {
  const { matrixYear, setMatrixYear, matrixBusy, matrixMonths, visibleMatrixMonths,
    matrixWindowStart, matrixWindowMax, setMatrixWindowStart, formatMonthLabel } = model;
  const navigationBusy = model.matrixNavigationBusy ?? matrixBusy;
  const [yearDraft, setYearDraft] = useState(matrixYear);
  useEffect(() => setYearDraft(matrixYear), [matrixYear]);
  const commitYear = () => {
    if (/^\d{4}$/.test(yearDraft) && Number(yearDraft) >= 2000 && Number(yearDraft) <= 2100) {
      setMatrixYear(yearDraft);
    } else setYearDraft(matrixYear);
  };
  const first = visibleMatrixMonths[0];
  const last = visibleMatrixMonths[visibleMatrixMonths.length - 1];
  const windowLabel = !first ? String(matrixYear) : first.slice(0, 4) === last.slice(0, 4)
    ? `${formatMonthLabel(first)} – ${formatMonthLabel(last)} ${first.slice(0, 4)}`
    : `${formatMonthLabel(first)} ${first.slice(0, 4)} – ${formatMonthLabel(last)} ${last.slice(0, 4)}`;
  // Native range controls emit input while dragging; change remains the commit fallback.
  const updateWindow = (value: number) => {
    if (Number.isFinite(value)) setMatrixWindowStart(value);
  };

  // Arrow steps preserve a continuous window when moving across January or December.
  const moveMonth = (direction: -1 | 1) => {
    const next = BudgetMonthWindow.move(String(matrixYear), matrixWindowStart, direction);
    if (next.year === String(matrixYear)) setMatrixWindowStart(next.startIndex);
    else setMatrixYear(next.year, next.startIndex);
  };

  return (
    <div className="budget-month-navigation">
      <div className="budget-year-picker" role="group" aria-label="Calendar year">
        <input aria-label="Budget year" type="number" min="2000" max="2100" value={yearDraft}
          disabled={navigationBusy} onChange={(event) => setYearDraft(event.target.value)} onBlur={commitYear}
          onKeyDown={(event) => {
            if (event.key === "Enter") { commitYear(); event.currentTarget.blur(); }
            if (event.key === "Escape") setYearDraft(matrixYear);
          }} />
      </div>
      <div className="budget-month-slider">
        <div className="budget-month-slider__heading">
          <strong aria-live="polite">{windowLabel}</strong>
        </div>
        <div className="budget-month-slider__controls">
          <button type="button" aria-label="Show one month earlier"
            disabled={navigationBusy || !matrixMonths.length || (Number(matrixYear) <= 2000 && matrixWindowStart === 0)}
            onClick={() => moveMonth(-1)}>‹</button>
        <input type="range" min="0" max={matrixWindowMax} step="1" value={matrixWindowStart}
          disabled={navigationBusy || !matrixWindowMax} aria-label={`First month in the six month window for ${matrixYear}`}
          aria-valuetext={windowLabel} onInput={(event) => updateWindow(event.currentTarget.valueAsNumber)}
          onChange={(event) => updateWindow(event.currentTarget.valueAsNumber)} />
          <button type="button" aria-label="Show one month later"
            disabled={navigationBusy || !matrixMonths.length || (Number(matrixYear) >= 2100 && matrixWindowStart === matrixWindowMax)}
            onClick={() => moveMonth(1)}>›</button>
        </div>
      </div>
      <span className="muted budget-month-navigation__note">6 months shown · trends follow this window</span>
    </div>
  );
}

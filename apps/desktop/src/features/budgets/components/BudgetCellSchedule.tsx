import { useEffect, useRef, useState } from "react";

/** Edit the optional cell date while retaining unrelated amount drafts. */
export function BudgetCellSchedule({ model }: { model: any }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { rowId, month } = model.cellSchedule;
  const row = [...model.incomeRows, ...model.expenseRows].find((item: any) => String(item.id) === rowId);
  const [date, setDate] = useState<string>(row?.due_date?.[month] || "");
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  const close = () => { if (!model.matrixBusy) model.setCellSchedule(null); };
  const [year, number] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  const income = row?.type === "income";
  return <dialog ref={dialog} className="budget-cell-dialog" aria-labelledby="cell-date-title"
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <form onSubmit={async event => {
      event.preventDefault(); setError("");
      try { await model.saveCellSchedule(date || null); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this cell."); }
    }}>
      <h3 id="cell-date-title">{income ? "Expected income date" : "Payment due date"}</h3>
      <p>{row?.name} · {model.formatMonthYearLabel(month)}</p>
      <strong>{model.formatCurrency(Number(model.getCellInputValue(row, month) || 0), model.budgetCurrency)}</strong>
      <label>Optional date<input autoFocus type="date" min={`${month}-01`} max={lastDay}
        value={date} onChange={event => setDate(event.target.value)} disabled={model.matrixBusy} /></label>
      <p className="muted">One date applies to the remaining amount for this cell. Leave blank to use the monthly forecast.</p>
      <p className="muted">Save cell keeps this amount and date. Other unsaved cells remain in your draft.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="budget-cell-dialog__actions">
        <button type="button" disabled={model.matrixBusy} onClick={() => setDate("")}>Clear date</button>
        <button type="button" disabled={model.matrixBusy} onClick={close}>Cancel</button>
        <button type="submit" disabled={model.matrixBusy}>{model.matrixBusy ? "Saving…" : "Save cell"}</button>
      </div>
    </form>
  </dialog>;
}

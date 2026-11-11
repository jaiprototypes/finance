import { useEffect, useRef } from "react";

/** Reject an unaffordable draft and offer a locally computed replacement. */
export function BudgetCellLimitNotice({ model }: { model: any }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const notice = model.cellLimitNotice;
  useEffect(() => { dialog.current?.showModal(); }, []);
  const close = () => model.setCellLimitNotice(null);
  return <dialog ref={dialog} className="budget-cell-dialog" aria-labelledby="cell-limit-title"
    onCancel={event => { event.preventDefault(); close(); }}>
    <h3 id="cell-limit-title">{notice.reason === "unknown" ? "Cannot check this amount yet" : "Check this amount"}</h3>
    <p>{notice.name} · {model.formatMonthYearLabel(notice.month)}</p>
    <p>{notice.reason === "invalid" ? "Enter a valid amount of zero or more."
      : notice.reason === "unknown" ? "Cash coverage or payment timing is incomplete. The previous amount has been restored."
      : notice.reason === "income-too-low" ? "That income would leave a shortfall in your future plan. The previous amount has been restored."
      : "That amount would use cash needed for your future plan. The previous amount has been restored."}</p>
    {notice.suggested !== null && <p>{notice.reason === "income-too-low" ? "Income needed" : "Maximum monthly total"}: <strong>
      {model.formatCurrency(notice.suggested, model.budgetCurrency)}</strong></p>}
    <div className="budget-cell-dialog__actions">
      <button type="button" onClick={close}>Keep previous amount</button>
      {notice.suggested !== null && <button type="button" onClick={() => model.applyCellLimitSuggestion()}>
        Use suggested amount
      </button>}
    </div>
  </dialog>;
}

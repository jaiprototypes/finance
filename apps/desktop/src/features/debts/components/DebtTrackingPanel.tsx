import { formatCurrency } from "../../../shared/financeUi";
import { DebtBalance, debtInterestLabel, formatDebtApr } from "../domain/DebtBalance";

/** Present the observation, cash movement estimate and interest as separate figures. */
export function DebtTrackingPanel({ reports }: { reports: any[] }) {
  if (!reports.length) return null;
  return (
    <div className="debt-tracking-grid">
      {reports.map((report) => <DebtTrackingCard key={report.profile_id} report={report} />)}
    </div>
  );
}

function DebtTrackingCard({ report }: { report: any }) {
  const balance = new DebtBalance({}, undefined, report);
  const money = (amount: number | null) => amount === null ? "—" : formatCurrency(amount, report.currency);
  const confirmed = balance.actual !== null;
  const activity = [...(report.activity || [])].reverse();
  return (
    <article className="debt-tracking-card">
      <div className="debt-tracking-card__heading">
        <div><h3>{report.name}</h3><span className="muted">{report.currency} · {formatDebtApr(report.apr)} APR · {debtInterestLabel(report.compounding)}</span></div>
        <span className={`debt-balance-status ${confirmed ? "is-confirmed" : "is-estimated"}`}>{confirmed ? "Confirmed" : "Estimated"}</span>
      </div>
      <div className="debt-observed-balance"><span>Actual balance · {report.as_of}</span><strong>{money(balance.actual)}</strong></div>
      {report.credit_limit != null && <p className="debt-credit-limit">Credit limit {money(report.credit_limit)}</p>}
      {!confirmed && report.balance_anchor_amount != null && <p className="muted">Last confirmed {money(report.balance_anchor_amount)} on {report.balance_anchor_date}</p>}
      <dl className="debt-estimate-breakdown">
        <div><dt>Cash movement estimate</dt><dd>{money(balance.estimatedPrincipal)}</dd></div>
        <div><dt>Estimated interest</dt><dd>{money(balance.estimatedInterest)}</dd></div>
        <div><dt>Estimate including interest</dt><dd>{money(balance.estimatedTotal)}</dd></div>
      </dl>
      <p className="muted debt-estimate-basis">{report.estimate_start ? `From ${report.estimate_start} to ${report.as_of}. ` : ""}
        {report.estimate_basis === "full_limit_draw_assumption" ? "Assumes the full-limit draw started this balance. " : ""}
        {report.compounding === "daily" ? "Estimate assumes daily compounding using APR ÷ 365." : report.compounding === "monthly"
          ? "Estimate assumes monthly compounding over the elapsed days." : "Estimate assumes simple daily accrual without compounding, using APR ÷ 365."}
      </p>
      {!confirmed && <p className="muted debt-estimate-basis">Checking records do not verify the lender balance or capture all loan-side fees and payment allocation.</p>}
      {report.tracking_account_id && <details className="debt-source-activity">
        <summary>Bank activity · {activity.length} records</summary>
        <p className="muted">Source history {report.source_coverage_start || "start unavailable"} · Matched reference {report.tracking_reference}</p>
        <div className="debt-activity-totals"><span>Drawn {money(report.draw_total)}</span><span>Paid {money(report.payment_total)}</span>
          {(report.pending_draw_total > 0 || report.pending_payment_total > 0) && <span>Pending: drawn {money(report.pending_draw_total)} · paid {money(report.pending_payment_total)}</span>}</div>
        <div className="debt-activity-scroll"><table>
          <thead><tr><th>Date</th><th>Bank record</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>{activity.map((movement: any) => <tr key={movement.transaction_id}>
            <td>{movement.date}</td><td>{movement.description}</td><td>{formatCurrency(movement.amount, report.currency)}</td>
            <td><span className={`debt-activity-status debt-activity-status--${movement.status}`}>{movement.status}</span></td>
          </tr>)}</tbody>
        </table></div>
      </details>}
    </article>
  );
}

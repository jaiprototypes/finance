import { TransactionFormSection } from "./sections/TransactionFormSection";
import { TransactionMergeSection } from "./sections/TransactionMergeSection";
import { TransactionRegisterSection } from "./sections/TransactionRegisterSection";
import { TransactionReviewSection } from "./sections/TransactionReviewSection";

export function TransactionsView({ model }: { model: any }) {
  const {
    SectionHeader,
    autoClassifyAll,
    autoClassifyBusy,
    autoClassifyError,
    autoClassifyStatus,
    formatCount,
    transactions
  } = model;

  return (
    <div className="page">
      <SectionHeader title="Banking Inbox" subtitle="For review, match, categorize, and post transactions." />
      <div className="page-actions">
        <div>
          <strong>Auto-categorize</strong>
          <span className="muted">Run across {formatCount(transactions.length)} transactions.</span>
        </div>
        <button onClick={autoClassifyAll} disabled={autoClassifyBusy}>
          {autoClassifyBusy ? "Auto-categorizing..." : "Auto-categorize all"}
        </button>
      </div>
      {autoClassifyError && <p className="form-error">{autoClassifyError}</p>}
      {autoClassifyStatus && <p className="muted">{autoClassifyStatus}</p>}
      <TransactionReviewSection model={model} />
      <TransactionFormSection model={model} />
      <TransactionRegisterSection model={model} />
      <TransactionMergeSection model={model} />
    </div>
  );
}

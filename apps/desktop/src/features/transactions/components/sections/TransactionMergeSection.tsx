export function TransactionMergeSection({ model }: { model: any }) {
  const { BoxTitle, mergeForm, mergeTransactions, setMergeForm } = model;

  return (
    <div className="panel">
      <BoxTitle title="Merge duplicates" />
      <div className="row">
        <input
          placeholder="Primary transaction ID"
          value={mergeForm.primary_id}
          onChange={(e) => setMergeForm({ ...mergeForm, primary_id: e.target.value })}
        />
        <input
          placeholder="Duplicate transaction ID"
          value={mergeForm.duplicate_id}
          onChange={(e) => setMergeForm({ ...mergeForm, duplicate_id: e.target.value })}
        />
        <button onClick={mergeTransactions}>Merge</button>
      </div>
    </div>
  );
}

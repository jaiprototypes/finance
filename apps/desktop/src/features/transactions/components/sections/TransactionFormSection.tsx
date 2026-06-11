export function TransactionFormSection({ model }: { model: any }) {
  const {
    BoxTitle,
    accounts,
    cancelEdit,
    editingId,
    form,
    saveEdit,
    setForm,
    submit,
    toDateValue,
    txnAttempted,
    txnError
  } = model;

  return (
    <div className="panel">
      <BoxTitle title={editingId ? "Edit transaction" : "Post transaction"} />
      {txnError && <p className="form-error">{txnError}</p>}
      <div className="row">
        <select
          className={txnAttempted && !form.account_id ? "field-error" : ""}
          value={form.account_id}
          onChange={(e) => setForm({ ...form, account_id: e.target.value })}
        >
          <option value="">Select account</option>
          {accounts.map((account: any) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.currency})
            </option>
          ))}
        </select>
        <input
          type="date"
          value={toDateValue(form.date)}
          className={txnAttempted && !form.date ? "field-error" : ""}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
        <input placeholder="Payee" value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} />
        <input
          placeholder="Description"
          value={form.description}
          className={txnAttempted && !form.description.trim() ? "field-error" : ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <input
          placeholder="Amount"
          value={form.amount}
          className={
            txnAttempted && (!form.amount || Number(form.amount) === 0 || Number.isNaN(Number(form.amount)))
              ? "field-error"
              : ""
          }
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          <option value="AUD">AUD</option>
          <option value="USD">USD</option>
        </select>
        <input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        {editingId ? (
          <>
            <button onClick={saveEdit}>Save</button>
            <button onClick={cancelEdit}>Cancel</button>
          </>
        ) : (
          <button onClick={submit}>Create</button>
        )}
      </div>
    </div>
  );
}

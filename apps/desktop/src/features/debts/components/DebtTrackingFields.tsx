export type DebtProfileForm = {
  account_id: string;
  apr: string;
  min_payment: string;
  due_date: string;
  compounding: string;
  credit_limit: string;
  tracking_account_id: string;
  tracking_reference: string;
  balance_anchor_amount: string;
  balance_anchor_date: string;
};

/** Reuse bank tracking and dated loan observations when creating or editing profiles. */
export function DebtTrackingFields({ form, accounts, onChange, disabled }: {
  form: DebtProfileForm;
  accounts: any[];
  onChange: (changes: Partial<DebtProfileForm>) => void;
  disabled: boolean;
}) {
  const debt = accounts.find((account) => String(account.id) === form.account_id);
  const sources = accounts.filter((account) => account.id !== debt?.id && account.currency === debt?.currency
    && ["bank", "checking", "savings"].includes(String(account.account_type || "").toLowerCase()));
  return (
    <fieldset className="debt-tracking-fields" disabled={disabled}>
      <legend>Balance and bank tracking <span className="muted">Optional · {debt?.currency || "native currency"}</span></legend>
      <label>Credit limit
        <input type="number" min="0.01" step="0.01" value={form.credit_limit}
          onChange={(event) => onChange({ credit_limit: event.target.value })} placeholder="Unknown" />
      </label>
      <label>Source bank account
        <select value={form.tracking_account_id} onChange={(event) => onChange({ tracking_account_id: event.target.value })}>
          <option value="">No automatic matching</option>
          {sources.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
      </label>
      <label>Exact loan reference
        <input value={form.tracking_reference} onChange={(event) => onChange({ tracking_reference: event.target.value })}
          placeholder="395654802 or SALLIE MAE" />
      </label>
      <label>Confirmed balance
        <input type="number" min="0" step="0.01" value={form.balance_anchor_amount}
          onChange={(event) => onChange({ balance_anchor_amount: event.target.value })} placeholder="Unknown" />
      </label>
      <label>Balance date
        <input type="date" value={form.balance_anchor_date}
          onChange={(event) => onChange({ balance_anchor_date: event.target.value })} />
      </label>
      <p className="muted">A credit limit is separate from the amount owed. Enter a balance only when you have a dated loan observation.</p>
    </fieldset>
  );
}

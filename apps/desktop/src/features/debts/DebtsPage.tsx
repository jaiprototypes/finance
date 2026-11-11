import { useEffect, useRef, useState } from "react";
import { removeFeatureRecord, getFeatureData, sendFeatureCommand } from "./api";
import { BoxTitle, SectionHeader, formatCurrency, toDateValue } from "../../shared/financeUi";
import { DebtTrackingFields, type DebtProfileForm } from "./components/DebtTrackingFields";
import { DebtTrackingPanel } from "./components/DebtTrackingPanel";
import { DebtBalance, debtInterestLabel, formatDebtApr } from "./domain/DebtBalance";

/** Keep optional loan observations distinct from an entered zero balance. */
function emptyProfile(): DebtProfileForm {
  return { account_id: "", apr: "", min_payment: "", due_date: "", compounding: "daily",
    credit_limit: "", tracking_account_id: "", tracking_reference: "", balance_anchor_amount: "", balance_anchor_date: "" };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to complete the debt request.";
}

/** Manage native-currency loan observations, source activity and explicit payoff scenarios. */
export function Debts() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<number, any>>({});
  const [activity, setActivity] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const [extraPayment, setExtraPayment] = useState("0");
  const [strategy, setStrategy] = useState("avalanche");
  const [includeEstimates, setIncludeEstimates] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [manualLinksOpen, setManualLinksOpen] = useState(false);
  const [manualLoaded, setManualLoaded] = useState(false);
  const [profileForm, setProfileForm] = useState<DebtProfileForm>(emptyProfile);
  const [linkForm, setLinkForm] = useState({ transaction_id: "", account_id: "", amount: "" });
  const request = useRef(0);
  const disabled = busy || loading;
  const updateForm = (changes: Partial<DebtProfileForm>) => setProfileForm((current) => ({ ...current, ...changes }));
  const accountFor = (profile: any) => accounts.find((account) => account.id === profile.account_id);
  const balanceFor = (profile: any) => new DebtBalance(profile, balances[profile.account_id], activity.find((row) => row.profile_id === profile.id));
  const nativeAmount = (amount: number | null, currency?: string) => amount === null ? "—" : formatCurrency(amount, currency);

  /** Fetch small reports together; full transaction history is loaded only for manual links. */
  const load = async () => {
    const sequence = ++request.current;
    setLoading(true);
    try {
      const [profileData, accountData, netWorth, linkData, activityData] = await Promise.all([
        getFeatureData<any[]>("/debts/profiles"), getFeatureData<any[]>("/accounts"),
        getFeatureData<any>("/reports/net-worth"), getFeatureData<any[]>("/debts/links"),
        getFeatureData<any[]>("/debts/activity")
      ]);
      if (sequence !== request.current) return;
      setProfiles(profileData);
      setAccounts(accountData);
      setLinks(linkData);
      setActivity(activityData);
      setBalances(Object.fromEntries((netWorth.accounts || []).map((row: any) => [row.account_id, row])));
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  };

  useEffect(() => {
    load().catch((error) => setWorkspaceError(errorMessage(error)));
    return () => { request.current += 1; };
  }, []);

  const cancelEditProfile = () => {
    setEditingProfileId(null);
    setShowProfileForm(false);
    setProfileError(null);
    setProfileForm(emptyProfile());
  };

  /** Restore every tracking field so editing the APR cannot erase a balance anchor. */
  const startEditProfile = (profile: any) => {
    setEditingProfileId(profile.id);
    setShowProfileForm(true);
    setProfileError(null);
    setProfileForm({ account_id: String(profile.account_id), apr: String(Number(profile.apr) * 100),
      min_payment: String(profile.min_payment ?? ""), due_date: toDateValue(profile.due_date),
      compounding: profile.compounding || "daily", credit_limit: profile.credit_limit == null ? "" : String(profile.credit_limit),
      tracking_account_id: profile.tracking_account_id == null ? "" : String(profile.tracking_account_id),
      tracking_reference: profile.tracking_reference || "",
      balance_anchor_amount: profile.balance_anchor_amount == null ? "" : String(profile.balance_anchor_amount),
      balance_anchor_date: toDateValue(profile.balance_anchor_date) });
  };

  const validateProfile = () => {
    if (!profileForm.account_id) return "Select a debt account.";
    if (profileForm.apr === "" || !Number.isFinite(Number(profileForm.apr)) || Number(profileForm.apr) < 0) return "Enter a nonnegative APR percentage.";
    if (profileForm.min_payment === "" || !Number.isFinite(Number(profileForm.min_payment)) || Number(profileForm.min_payment) < 0) return "Enter a nonnegative minimum payment.";
    if (Boolean(profileForm.tracking_account_id) !== Boolean(profileForm.tracking_reference.trim())) return "Bank tracking needs both a source account and an exact loan reference.";
    if ((profileForm.balance_anchor_amount !== "") !== Boolean(profileForm.balance_anchor_date)) return "A confirmed balance needs both an amount and a date.";
    if (profileForm.credit_limit !== "" && (!Number.isFinite(Number(profileForm.credit_limit)) || Number(profileForm.credit_limit) <= 0)) return "Credit limit must be greater than zero.";
    if (profileForm.balance_anchor_amount !== "" && (!Number.isFinite(Number(profileForm.balance_anchor_amount)) || Number(profileForm.balance_anchor_amount) < 0)) return "Confirmed balance must be nonnegative.";
    const debt = accounts.find((account) => String(account.id) === profileForm.account_id);
    const source = accounts.find((account) => String(account.id) === profileForm.tracking_account_id);
    if (source && (source.id === debt?.id || source.currency !== debt?.currency)) return "Source account must be different from the debt account and use the same currency.";
    return null;
  };

  const saveProfile = async () => {
    const error = validateProfile();
    setProfileError(error);
    if (error) return;
    setBusy(true);
    try {
      const payload = { account_id: Number(profileForm.account_id), apr: Number(profileForm.apr) / 100,
        min_payment: Number(profileForm.min_payment), due_date: profileForm.due_date || null,
        compounding: profileForm.compounding, credit_limit: profileForm.credit_limit === "" ? null : Number(profileForm.credit_limit),
        tracking_account_id: profileForm.tracking_account_id === "" ? null : Number(profileForm.tracking_account_id),
        tracking_reference: profileForm.tracking_reference.trim() || null,
        balance_anchor_amount: profileForm.balance_anchor_amount === "" ? null : Number(profileForm.balance_anchor_amount),
        balance_anchor_date: profileForm.balance_anchor_date || null };
      await sendFeatureCommand(editingProfileId ? `/debts/profiles/${editingProfileId}` : "/debts/profiles", payload);
      await load();
      setResult(null);
      cancelEditProfile();
    } catch (failure) { setProfileError(errorMessage(failure)); }
    finally { setBusy(false); }
  };

  const deleteProfile = async (profile: any) => {
    setBusy(true);
    setWorkspaceError(null);
    try {
      await removeFeatureRecord(`/debts/profiles/${profile.id}`);
      await load();
      if (editingProfileId === profile.id) cancelEditProfile();
      setResult(null);
    } catch (failure) { setWorkspaceError(errorMessage(failure)); }
    finally { setBusy(false); }
  };

  /** Never turn an unknown balance into a zero-dollar payoff scenario. */
  const runPlan = async () => {
    setWorkspaceError(null);
    setResult(null);
    setBusy(true);
    try {
      if (!profiles.length) throw new Error("Add a debt profile before running a payoff plan.");
      const currencies = new Set(profiles.map((profile) => accountFor(profile)?.currency));
      if (currencies.size !== 1 || currencies.has(undefined)) throw new Error("Run payoff scenarios with debt accounts in one currency.");
      if (!Number.isFinite(Number(extraPayment)) || Number(extraPayment) < 0) throw new Error("Extra payment must be a nonnegative amount.");
      const debts = profiles.map((profile) => {
        const balance = balanceFor(profile).payoffAmount(includeEstimates);
        const name = accountFor(profile)?.name || `Account ${profile.account_id}`;
        if (balance === null) throw new Error(`${name} has no current confirmed balance. Enter a dated balance, or explicitly include its available checking estimate.`);
        return { debt_id: String(profile.id), name, balance, apr: profile.apr, min_payment: profile.min_payment, compounding: profile.compounding };
      });
      const data = await sendFeatureCommand<any>("/debts/payoff", { strategy, extra_payment: Number(extraPayment), debts });
      setResult({ ...data, currency: [...currencies][0], includesEstimates: includeEstimates });
    } catch (failure) { setWorkspaceError(errorMessage(failure)); }
    finally { setBusy(false); }
  };

  const loadManualTransactions = async () => {
    if (manualLoaded) return;
    try {
      setTransactions(await getFeatureData<any[]>("/transactions"));
      setManualLoaded(true);
    } catch (failure) { setWorkspaceError(errorMessage(failure)); }
  };

  const linkPayment = async () => {
    setWorkspaceError(null);
    const amount = Number(linkForm.amount);
    if (!linkForm.transaction_id || !linkForm.account_id || !Number.isFinite(amount) || amount <= 0) {
      setWorkspaceError("Select a debt, an existing payment and a positive linked amount.");
      return;
    }
    setBusy(true);
    try {
      await sendFeatureCommand("/debts/link-payment", { transaction_id: Number(linkForm.transaction_id), account_id: Number(linkForm.account_id), amount });
      setLinkForm({ transaction_id: "", account_id: "", amount: "" });
      await load();
    } catch (failure) { setWorkspaceError(errorMessage(failure)); }
    finally { setBusy(false); }
  };

  return (
    <div className="page">
      <SectionHeader title="Debt Lab" subtitle="Track balances and bank activity, then explore payoff scenarios." />
      {workspaceError && <p className="form-error" role="alert">{workspaceError}</p>}
      {loading && <p className="muted" role="status">Loading debt balances and activity…</p>}
      <DebtTrackingPanel reports={activity} />
      <div className="panel">
        <div className="debt-profile-heading"><BoxTitle title="Debt profiles" />
          <button disabled={disabled} onClick={() => { cancelEditProfile(); setShowProfileForm(true); }}>Add debt profile</button></div>
        {showProfileForm && <div className="debt-profile-editor">
          {profileError && <p className="form-error" role="alert">{profileError}</p>}
          <div className="debt-profile-fields">
            <label>Debt account<select value={profileForm.account_id} disabled={disabled} onChange={(event) => updateForm({ account_id: event.target.value })}>
              <option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
            </select></label>
            <label>APR (%)<input type="number" min="0" step="0.01" placeholder="2" value={profileForm.apr} disabled={disabled} onChange={(event) => updateForm({ apr: event.target.value })} /></label>
            <label>Minimum payment<input type="number" min="0" step="0.01" value={profileForm.min_payment} disabled={disabled} onChange={(event) => updateForm({ min_payment: event.target.value })} /></label>
            <label>Due date<input type="date" value={profileForm.due_date} disabled={disabled} onChange={(event) => updateForm({ due_date: event.target.value })} /></label>
            <label>Interest assumption<select value={profileForm.compounding} disabled={disabled} onChange={(event) => updateForm({ compounding: event.target.value })}>
              <option value="daily">Daily compounding</option><option value="monthly">Monthly compounding</option><option value="simple_daily">Simple daily accrual (no compounding)</option>
            </select></label>
          </div>
          <DebtTrackingFields form={profileForm} accounts={accounts} onChange={updateForm} disabled={disabled} />
          <div className="row"><button disabled={disabled} onClick={saveProfile}>{editingProfileId ? "Save profile" : "Add profile"}</button><button className="button-ghost" disabled={disabled} onClick={cancelEditProfile}>Cancel</button></div>
        </div>}
        <div className="debt-table-scroll"><table>
          <thead><tr><th>Account</th><th>Actual balance</th><th>APR / interest basis</th><th>Minimum payment</th><th>Action</th></tr></thead>
          <tbody>{profiles.map((profile) => {
            const account = accountFor(profile);
            const balance = balanceFor(profile);
            return <tr key={profile.id}>
              <td>{account?.name || profile.account_id}</td>
              <td>{nativeAmount(balance.actual, account?.currency)}
                {balance.actual === null && balance.estimatedTotal !== null && <div className="muted">Estimate {nativeAmount(balance.estimatedTotal, account?.currency)}</div>}</td>
              <td>{formatDebtApr(profile.apr)}<div className="muted">{debtInterestLabel(profile.compounding)}</div></td>
              <td>{formatCurrency(profile.min_payment, account?.currency)}</td>
              <td><div className="row"><button className="button-ghost" disabled={disabled} onClick={() => startEditProfile(profile)}>Edit</button>
                <button className="button-ghost" disabled={disabled} onClick={() => deleteProfile(profile)}>Delete</button></div></td>
            </tr>;
          })}</tbody>
        </table></div>
      </div>
      <div className="panel">
        <BoxTitle title="Payoff simulator" />
        <p className="muted">Monthly-payment scenario using an APR ÷ 12 interest approximation. The tracking cards above use each profile’s chosen interest assumption.</p>
        {profiles.some((profile) => balanceFor(profile).actual === null && balanceFor(profile).estimatedTotal !== null) && <label className="row debt-estimate-consent">
          <input type="checkbox" checked={includeEstimates} onChange={(event) => { setIncludeEstimates(event.target.checked); setResult(null); }} />
          Use checking-derived estimates for unknown balances in this scenario
        </label>}
        <div className="row">
          <select aria-label="Payoff strategy" value={strategy} onChange={(event) => { setStrategy(event.target.value); setResult(null); }}><option value="avalanche">Avalanche</option><option value="snowball">Snowball</option></select>
          <label>Extra monthly payment<input type="number" min="0" step="0.01" value={extraPayment} onChange={(event) => { setExtraPayment(event.target.value); setResult(null); }} /></label>
          <button disabled={disabled} onClick={runPlan}>Run payoff plan</button>
        </div>
        {result && <div className="result"><p>Months to payoff: {result.months}</p><p>Total interest: {formatCurrency(result.total_interest, result.currency)}</p>
          {result.includesEstimates && <p className="muted">Scenario includes estimated loan balances.</p>}</div>}
      </div>
      <details className="panel" onToggle={(event) => { const open = event.currentTarget.open; setManualLinksOpen(open); if (open) loadManualTransactions(); }}>
        <summary>Manual payment links</summary>
        <p className="muted">Tag an existing transaction. Automatic bank tracking above uses the original records without creating extra payments.</p>
        {manualLinksOpen && <><div className="row">
          <select aria-label="Linked debt account" value={linkForm.account_id} onChange={(event) => setLinkForm({ ...linkForm, account_id: event.target.value })}><option value="">Debt account</option>
            {profiles.map((profile) => <option key={profile.id} value={profile.account_id}>{accountFor(profile)?.name || profile.account_id}</option>)}</select>
          <select aria-label="Payment transaction" value={linkForm.transaction_id} onChange={(event) => setLinkForm({ ...linkForm, transaction_id: event.target.value })}><option value="">Payment transaction</option>
            {transactions.filter((txn) => txn.amount < 0).map((txn) => <option key={txn.id} value={txn.id}>{txn.date} {txn.description} {formatCurrency(txn.amount, txn.currency)}</option>)}</select>
          <input aria-label="Linked amount" type="number" min="0.01" step="0.01" placeholder="Amount" value={linkForm.amount} onChange={(event) => setLinkForm({ ...linkForm, amount: event.target.value })} />
          <button disabled={disabled} onClick={linkPayment}>Link payment</button>
        </div>
        {links.length > 0 && <div className="debt-table-scroll"><table><thead><tr><th>Transaction</th><th>Account</th><th>Amount</th></tr></thead>
          <tbody>{links.map((link) => {
            const account = accounts.find((row) => row.id === link.account_id);
            const transaction = transactions.find((row) => row.id === link.transaction_id);
            return <tr key={link.id}><td>{transaction ? `${transaction.date} ${transaction.description}` : link.transaction_id}</td><td>{account?.name || link.account_id}</td><td>{formatCurrency(link.amount, account?.currency)}</td></tr>;
          })}</tbody></table></div>}</>}
      </details>
    </div>
  );
}

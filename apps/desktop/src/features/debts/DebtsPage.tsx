import React, { Fragment, useEffect, useRef, useState } from "react";
import { removeFeatureRecord, getFeatureData, sendFeatureCommand } from "./api";
import {
  BoxTitle,
  CollapsibleSection,
  DEFAULT_LOCAL_AI_BASE_URL,
  DEFAULT_LOCAL_AI_MODEL,
  DEFAULT_LOCAL_AI_TIMEOUT_SECONDS,
  EMPTY_INVOICE_PREVIEW_PROFILE,
  InvoiceSheetPreview,
  MATRIX_BREAKDOWN_COLORS,
  PLAID_REFRESH_EVENT_KEY,
  RowDisclosureButton,
  SectionHeader,
  WorkspaceInsightCard,
  buildConicGradient,
  clearPendingPlaidLinkSession,
  currentMonthLabel,
  formatAmount,
  formatCompactCurrency,
  formatCount,
  formatCurrency,
  formatDuration,
  formatFileSize,
  formatHours,
  formatMonthLabel,
  formatMonthYearLabel,
  formatPlaidLinkExitError,
  formatRemainingSummary,
  formatSignedCurrency,
  formatTimestampLabel,
  isClosedReceivableStatus,
  loadPlaidScript,
  monthStateLabel,
  normalizeLlmSettings,
  notifyPlaidRefresh,
  renderMatrixMoney,
  savePendingPlaidLinkSession,
  toDateValue,
  toDatetimeLocal,
  toLogoSrc,
  todayDate,
  weekStartLabel
} from "../../shared/financeUi";
import type { InvoicePreviewProfile, LlmSettings } from "../../shared/financeUi";

export function Debts() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<number, number>>({});
  const [transactions, setTransactions] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const [extraPayment, setExtraPayment] = useState("0");
  const [strategy, setStrategy] = useState("avalanche");
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({
    account_id: "",
    apr: "",
    min_payment: "",
    due_date: "",
    compounding: "daily"
  });
  const [linkForm, setLinkForm] = useState({ transaction_id: "", account_id: "", amount: "" });

  const load = async () => {
    const [profilesData, accountData, netWorth, transactionData, linkData] = await Promise.all([
      getFeatureData<any[]>("/debts/profiles"),
      getFeatureData<any[]>("/accounts"),
      getFeatureData<any>("/reports/net-worth"),
      getFeatureData<any[]>("/transactions"),
      getFeatureData<any[]>("/debts/links")
    ]);
    setProfiles(profilesData);
    setAccounts(accountData);
    setTransactions(transactionData);
    setLinks(linkData);
    const nextBalances: Record<number, number> = {};
    (netWorth.accounts || []).forEach((row: any) => {
      nextBalances[row.account_id] = row.balance;
    });
    setBalances(nextBalances);
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const validateProfile = () => {
    if (!profileForm.account_id) return "Select a debt account.";
    const aprValue = Number(profileForm.apr);
    if (!Number.isFinite(aprValue)) return "APR must be a number.";
    const minValue = Number(profileForm.min_payment);
    if (!Number.isFinite(minValue)) return "Minimum payment must be a number.";
    return null;
  };

  const saveProfile = async () => {
    setProfileError(null);
    const error = validateProfile();
    if (error) {
      setProfileError(error);
      return;
    }
    const payload = {
      account_id: Number(profileForm.account_id),
      apr: Number(profileForm.apr),
      min_payment: Number(profileForm.min_payment),
      due_date: profileForm.due_date || undefined,
      compounding: profileForm.compounding
    };
    if (editingProfileId) {
      await sendFeatureCommand(`/debts/profiles/${editingProfileId}`, payload);
    } else {
      await sendFeatureCommand("/debts/profiles", payload);
    }
    setEditingProfileId(null);
    setProfileForm({ account_id: "", apr: "", min_payment: "", due_date: "", compounding: "daily" });
    load();
  };

  const startEditProfile = (profile: any) => {
    setEditingProfileId(profile.id);
    setProfileError(null);
    setProfileForm({
      account_id: String(profile.account_id),
      apr: String(profile.apr ?? ""),
      min_payment: String(profile.min_payment ?? ""),
      due_date: profile.due_date || "",
      compounding: profile.compounding || "daily"
    });
  };

  const cancelEditProfile = () => {
    setEditingProfileId(null);
    setProfileError(null);
    setProfileForm({ account_id: "", apr: "", min_payment: "", due_date: "", compounding: "daily" });
  };

  const runPlan = async () => {
    const debts = profiles.map((profile) => {
      const account = accounts.find((acc) => acc.id === profile.account_id);
      const balance = Math.abs(balances[profile.account_id] || 0);
      return {
        debt_id: String(profile.id),
        name: account ? account.name : `Account ${profile.account_id}`,
        balance,
        apr: profile.apr,
        min_payment: profile.min_payment
      };
    });
    const data = await sendFeatureCommand("/debts/payoff", {
      strategy,
      extra_payment: Number(extraPayment),
      debts
    });
    setResult(data);
  };

  const linkPayment = async () => {
    if (!linkForm.transaction_id || !linkForm.account_id) return;
    await sendFeatureCommand("/debts/link-payment", {
      transaction_id: Number(linkForm.transaction_id),
      account_id: Number(linkForm.account_id),
      amount: Number(linkForm.amount || 0)
    });
    setLinkForm({ transaction_id: "", account_id: "", amount: "" });
    load();
  };

  return (
    <div className="page">
      <SectionHeader title="Debt Lab" subtitle="Snowball or avalanche payoff scenarios." />
      <div className="panel">
        <BoxTitle title="Debt profiles" />
        {profileError && <p className="form-error">{profileError}</p>}
        <div className="row">
          <select
            value={profileForm.account_id}
            onChange={(e) => setProfileForm({ ...profileForm, account_id: e.target.value })}
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <input
            placeholder="APR (0.05)"
            value={profileForm.apr}
            onChange={(e) => setProfileForm({ ...profileForm, apr: e.target.value })}
          />
          <input
            placeholder="Min payment"
            value={profileForm.min_payment}
            onChange={(e) => setProfileForm({ ...profileForm, min_payment: e.target.value })}
          />
          <input
            type="date"
            value={toDateValue(profileForm.due_date)}
            onChange={(e) => setProfileForm({ ...profileForm, due_date: e.target.value })}
          />
          <select
            value={profileForm.compounding}
            onChange={(e) => setProfileForm({ ...profileForm, compounding: e.target.value })}
          >
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
          </select>
          <button onClick={saveProfile}>{editingProfileId ? "Save profile" : "Add profile"}</button>
          {editingProfileId && <button onClick={cancelEditProfile}>Cancel</button>}
        </div>
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Balance</th>
              <th>APR</th>
              <th>Min payment</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => {
              const account = accounts.find((acc) => acc.id === profile.account_id);
              return (
                <tr key={profile.id}>
                  <td>{account ? account.name : profile.account_id}</td>
                  <td>{formatCurrency(Math.abs(balances[profile.account_id] || 0), account?.currency)}</td>
                  <td>{profile.apr}</td>
                  <td>{formatAmount(profile.min_payment)}</td>
                  <td>
                    <button className="button-ghost" onClick={() => startEditProfile(profile)}>
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        await removeFeatureRecord(`/debts/profiles/${profile.id}`);
                        load();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <BoxTitle title="Link payments" />
        <div className="row">
          <select
            value={linkForm.account_id}
            onChange={(e) => setLinkForm({ ...linkForm, account_id: e.target.value })}
          >
            <option value="">Debt account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <select
            value={linkForm.transaction_id}
            onChange={(e) => setLinkForm({ ...linkForm, transaction_id: e.target.value })}
          >
            <option value="">Payment transaction</option>
            {transactions.map((txn) => (
              <option key={txn.id} value={txn.id}>
                {txn.date} {txn.description} {formatCurrency(txn.amount, txn.currency)}
              </option>
            ))}
          </select>
          <input
            placeholder="Amount"
            value={linkForm.amount}
            onChange={(e) => setLinkForm({ ...linkForm, amount: e.target.value })}
          />
          <button onClick={linkPayment}>Link payment</button>
        </div>
        {links.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Account</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => {
                const account = accounts.find((acc) => acc.id === link.account_id);
                const txn = transactions.find((t) => t.id === link.transaction_id);
                return (
                  <tr key={link.id}>
                    <td>{txn ? `${txn.date} ${txn.description}` : link.transaction_id}</td>
                    <td>{account ? account.name : link.account_id}</td>
                    <td>{formatAmount(link.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="panel">
        <BoxTitle title="Payoff simulator" />
        <div className="row">
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="avalanche">Avalanche</option>
            <option value="snowball">Snowball</option>
          </select>
          <input
            placeholder="Extra payment"
            value={extraPayment}
            onChange={(e) => setExtraPayment(e.target.value)}
          />
          <button onClick={runPlan}>Run payoff plan</button>
        </div>
        {result && (
          <div className="result">
            <p>Months to payoff: {result.months}</p>
            <p>Total interest: {formatAmount(result.total_interest)}</p>
          </div>
        )}
      </div>
      <div className="callout">Not financial advice. Use scenarios to explore options only.</div>
    </div>
  );
}

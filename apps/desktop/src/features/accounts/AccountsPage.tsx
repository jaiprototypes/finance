import React, { Fragment, useEffect, useRef, useState } from "react";
import { API_BASE, apiDelete, apiGet, apiGetBlob, apiPost, apiPostForm, apiUrl, downloadDiagnostics, saveBlob } from "./api";
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

export function Accounts({
  onOpenRegister,
  onOpenReport
}: {
  onOpenRegister: (accountId: number) => void;
  onOpenReport: () => void;
}) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<number, number>>({});
  const [form, setForm] = useState({
    name: "",
    type: "bank",
    currency: "AUD",
    institution: "",
    note: ""
  });
  const [editing, setEditing] = useState<number | null>(null);

  const load = async () => {
    const [accountsData, netWorth] = await Promise.all([
      apiGet<any[]>("/accounts"),
      apiGet<any>("/reports/net-worth")
    ]);
    setAccounts(accountsData);
    const nextBalances: Record<number, number> = {};
    (netWorth.accounts || []).forEach((row: any) => {
      nextBalances[row.account_id] = Number(row.display_balance ?? row.balance ?? 0);
    });
    setBalances(nextBalances);
  };
  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const submit = async () => {
    await apiPost("/accounts", { ...form, is_active: true });
    setForm({ name: "", type: "bank", currency: "AUD", institution: "", note: "" });
    load();
  };

  const startEdit = (account: any) => {
    setEditing(account.id);
    setForm({
      name: account.name,
      type: account.type,
      currency: account.currency,
      institution: account.institution || "",
      note: account.note || ""
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    await apiPost(`/accounts/${editing}`, { ...form, is_active: true });
    setEditing(null);
    setForm({ name: "", type: "bank", currency: "AUD", institution: "", note: "" });
    load();
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({ name: "", type: "bank", currency: "AUD", institution: "", note: "" });
  };

  const deleteAccount = async (accountId: number) => {
    const confirmed = window.confirm("Delete this account? It will be archived and removed from lists.");
    if (!confirmed) return;
    await apiDelete(`/accounts/${accountId}`);
    load();
  };

  return (
    <div className="page">
      <SectionHeader title="Chart of Accounts" subtitle="Central ledger of assets, liabilities, income, and expenses." />
      <div className="panel">
        <BoxTitle title={editing ? "Edit account" : "Add account"} />
        <div className="row">
          <input
            placeholder="Account name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="bank">Bank</option>
            <option value="credit card">Credit card</option>
            <option value="savings">Savings</option>
            <option value="investment">Investment</option>
            <option value="loan">Loan</option>
            <option value="student loan">Student loan</option>
            <option value="cash">Cash</option>
          </select>
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            <option value="AUD">AUD</option>
            <option value="USD">USD</option>
          </select>
          <input
            placeholder="Detail type / Institution"
            value={form.institution}
            onChange={(e) => setForm({ ...form, institution: e.target.value })}
          />
          <input
            placeholder="Notes"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
          {editing ? (
            <>
              <button onClick={saveEdit}>Save</button>
              <button onClick={cancelEdit}>Cancel</button>
            </>
          ) : (
            <button onClick={submit}>Create</button>
          )}
        </div>
      </div>
      <div className="panel">
        <BoxTitle title="Chart of accounts" />
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Detail</th>
              <th>Currency</th>
              <th>Balance</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td>{account.type}</td>
                <td>{account.detail_type || account.institution || account.note || "—"}</td>
                <td>{account.currency}</td>
                <td>{formatCurrency(balances[account.id] ?? 0, account.currency)}</td>
                <td>
                  <button className="button-ghost" onClick={() => onOpenRegister(account.id)}>
                    Open register
                  </button>
                  <button className="button-ghost" onClick={onOpenReport}>
                    View reports
                  </button>
                  <button onClick={() => startEdit(account)}>Edit</button>
                  <button onClick={() => deleteAccount(account.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

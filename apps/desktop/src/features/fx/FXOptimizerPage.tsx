import React, { Fragment, useEffect, useRef, useState } from "react";
import { getFeatureData, sendFeatureCommand } from "./api";
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

export function FXOptimizer() {
  const [form, setForm] = useState({
    aud_cash: "2000",
    usd_cash: "500",
    aud_debt: "5000",
    usd_debt: "3000",
    aud_debt_apr: "0.06",
    usd_debt_apr: "0.08",
    risk_profile: "neutral"
  });
  const [result, setResult] = useState<any | null>(null);
  const [settings, setSettings] = useState({
    target_account_id: "",
    provider: "manual",
    risk_profile: "neutral"
  });
  const [rates, setRates] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  useEffect(() => {
    getFeatureData<any>("/fx/settings")
      .then((data) =>
        setSettings({
          target_account_id: data.target_account_id ? String(data.target_account_id) : "",
          provider: data.provider || "manual",
          risk_profile: data.risk_profile || "neutral"
        })
      )
      .catch(() => undefined);
    getFeatureData<any[]>("/fx/rates").then((data) => setRates(data.slice(-10))).catch(() => undefined);
    getFeatureData<any[]>("/fx/recommendations").then(setRecommendations).catch(() => undefined);
  }, []);

  const ingest = async () => {
    await sendFeatureCommand("/fx/rates/ingest");
    getFeatureData<any[]>("/fx/rates").then((data) => setRates(data.slice(-10))).catch(() => undefined);
  };

  const run = async () => {
    const data = await sendFeatureCommand("/fx/recommendations", {
      ...form,
      aud_cash: Number(form.aud_cash),
      usd_cash: Number(form.usd_cash),
      aud_debt: Number(form.aud_debt),
      usd_debt: Number(form.usd_debt),
      aud_debt_apr: Number(form.aud_debt_apr),
      usd_debt_apr: Number(form.usd_debt_apr)
    });
    setResult(data);
    getFeatureData<any[]>("/fx/recommendations").then(setRecommendations).catch(() => undefined);
  };

  const saveSettings = async () => {
    await sendFeatureCommand("/fx/settings", {
      target_account_id: settings.target_account_id ? Number(settings.target_account_id) : null,
      provider: settings.provider,
      risk_profile: settings.risk_profile
    });
  };

  return (
    <div className="page">
      <SectionHeader title="FX Command" subtitle="AUD/USD timing tied to debt paydown." />
      <div className="panel">
        <BoxTitle title="FX controls" />
        <div className="row">
          <button onClick={ingest}>Ingest RBA rates</button>
          <button onClick={run}>Generate recommendation</button>
          <button onClick={saveSettings}>Save FX settings</button>
        </div>
        <div className="row">
          <input
            placeholder="Target debt account ID"
            value={settings.target_account_id}
            onChange={(e) => setSettings({ ...settings, target_account_id: e.target.value })}
          />
          <select value={settings.provider} onChange={(e) => setSettings({ ...settings, provider: e.target.value })}>
            <option value="manual">Manual</option>
            <option value="api_stub">API key (stub)</option>
          </select>
          <select
            value={settings.risk_profile}
            onChange={(e) => setSettings({ ...settings, risk_profile: e.target.value })}
          >
            <option value="conservative">Conservative</option>
            <option value="neutral">Neutral</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>
        <div className="row">
          <input value={form.aud_cash} onChange={(e) => setForm({ ...form, aud_cash: e.target.value })} />
          <input value={form.usd_cash} onChange={(e) => setForm({ ...form, usd_cash: e.target.value })} />
          <input value={form.aud_debt} onChange={(e) => setForm({ ...form, aud_debt: e.target.value })} />
          <input value={form.usd_debt} onChange={(e) => setForm({ ...form, usd_debt: e.target.value })} />
          <select value={form.risk_profile} onChange={(e) => setForm({ ...form, risk_profile: e.target.value })}>
            <option value="conservative">Conservative</option>
            <option value="neutral">Neutral</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>
        {result && (
          <div className="result">
            <p>Convert AUD now: {formatAmount(result.alloc_aud_to_usd)}</p>
            <p>Repay USD: {formatAmount(result.repay_usd)}</p>
            <p>Repay AUD: {formatAmount(result.repay_aud)}</p>
          </div>
        )}
      </div>
      <div className="callout">Informational only. No financial advice.</div>
      <div className="panel">
        <BoxTitle title="Recent FX rates" />
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>AUD per USD</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => (
              <tr key={rate.id || rate.date}>
                <td>{rate.date}</td>
                <td>{formatAmount(rate.aud_per_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <BoxTitle title="Recommendations" />
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Risk</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {recommendations.map((rec) => (
              <tr key={rec.id}>
                <td>{rec.created_at}</td>
                <td>{rec.risk_profile}</td>
                <td>{rec.note || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

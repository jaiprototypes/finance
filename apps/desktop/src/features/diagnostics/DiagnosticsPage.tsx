import React, { Fragment, useEffect, useRef, useState } from "react";
import { getFeatureData, downloadFeatureDiagnostics } from "./api";
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

export function Diagnostics() {
  const [status, setStatus] = useState<string | null>(null);
  const [info, setInfo] = useState<any | null>(null);

  useEffect(() => {
    getFeatureData<any>("/diagnostics/status").then(setInfo).catch(() => undefined);
  }, []);

  const exportLogs = async () => {
    await downloadFeatureDiagnostics();
    setStatus("Diagnostics exported");
  };

  return (
    <div className="page">
      <SectionHeader title="System Health" subtitle="Export logs and check database health." />
      <div className="panel">
        <BoxTitle title="Export diagnostics" />
        <button onClick={exportLogs}>Export logs + database</button>
        {status && <p className="muted">{status}</p>}
      </div>
      {info && (
        <div className="panel">
          <BoxTitle title="Database" />
          <p className="muted">{info.db_path}</p>
          <table>
            <thead>
              <tr>
                <th>Table</th>
                <th>Rows</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(info.counts || {}).map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{value as any}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

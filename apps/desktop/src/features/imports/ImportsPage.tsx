import React, { Fragment, useEffect, useRef, useState } from "react";
import { getFeatureData, sendFeatureCommand, commitImportFile, previewImportFile } from "./api";
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

export function Imports() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    date: "",
    description: "",
    amount: "",
    currency: "",
    payee: "",
    notes: ""
  });
  const [preview, setPreview] = useState<any[]>([]);
  const [accountId, setAccountId] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("AUD");
  const [source, setSource] = useState("bank_csv");
  const [autoClassify, setAutoClassify] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [importAttempted, setImportAttempted] = useState(false);
  const [expandedBatchId, setExpandedBatchId] = useState<number | null>(null);

  useEffect(() => {
    getFeatureData<any[]>("/accounts").then(setAccounts).catch(() => undefined);
    getFeatureData<any[]>("/imports/batches").then(setBatches).catch(() => undefined);
  }, []);

  const handleFile = (selected: File | null) => {
    setFile(selected);
    setPreview([]);
    if (!selected) {
      setHeaders([]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const [head] = text.split(/\r?\n/);
      const cols = head.split(",").map((c) => c.replace(/^\"|\"$/g, "").trim());
      setHeaders(cols);
    };
    reader.readAsText(selected);
  };

  const requestPreview = async () => {
    setImportAttempted(true);
    setImportError(null);
    if (!file) {
      setImportError("Choose a CSV file first.");
      return;
    }
    if (!mapping.date || !mapping.description || !mapping.amount) {
      setImportError("Map at least date, description, and amount.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mapping_json", JSON.stringify(mapping));
    try {
      const data = await previewImportFile(formData);
      setPreview(data.rows || []);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Unable to preview import.");
    }
  };

  const commitImport = async () => {
    setImportAttempted(true);
    setImportError(null);
    if (!file) {
      setImportError("Choose a CSV file first.");
      return;
    }
    if (!accountId) {
      setImportError("Select an account.");
      return;
    }
    if (!mapping.date || !mapping.description || !mapping.amount) {
      setImportError("Map at least date, description, and amount.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("account_id", accountId);
    formData.append("default_currency", defaultCurrency);
    formData.append("source", source);
    formData.append("auto_classify", autoClassify ? "true" : "false");
    formData.append("mapping_json", JSON.stringify(mapping));
    try {
      await commitImportFile(formData);
      getFeatureData<any[]>("/imports/batches").then(setBatches).catch(() => undefined);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Unable to commit import.");
    }
  };

  const rollback = async (batchId: number) => {
    await sendFeatureCommand(`/imports/batches/${batchId}/rollback`);
    getFeatureData<any[]>("/imports/batches").then(setBatches).catch(() => undefined);
  };

  const selectedAccount = accounts.find((account) => String(account.id) === accountId);
  const requiredMappings = ["date", "description", "amount"];
  const requiredMappedCount = requiredMappings.filter((field) => Boolean(mapping[field])).length;
  const previewRows = preview.slice(0, 8);
  const toggleBatchDetails = (batchId: number) => {
    setExpandedBatchId((current) => (current === batchId ? null : batchId));
  };

  return (
    <div className="page">
      <SectionHeader title="Data Hub" subtitle="CSV mapping, validation, and reconciliation." />
      <div className="panel">
        <BoxTitle title="CSV import wizard" />
        {importError && <p className="form-error">{importError}</p>}
        <CollapsibleSection
          title="Import setup"
          summary={
            file
              ? `${file.name} · ${selectedAccount?.name || "No account selected"} · ${requiredMappedCount}/3 required fields mapped`
              : "Choose a CSV file, account, and import defaults"
          }
          defaultOpen
        >
          <div className="import-summary-grid">
            <div className="card">
              <div className="table-detail-title">File + destination</div>
              <div className="row">
                <input
                  type="file"
                  accept=".csv"
                  className={importAttempted && !file ? "field-error" : ""}
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                />
                <select
                  value={accountId}
                  className={importAttempted && !accountId ? "field-error" : ""}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.currency})
                    </option>
                  ))}
                </select>
              </div>
              <div className="table-detail-copy">
                <div>
                  <strong>File:</strong> {file?.name || "No file selected"}
                </div>
                <div>
                  <strong>Account:</strong> {selectedAccount ? `${selectedAccount.name} (${selectedAccount.currency})` : "Not selected"}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="table-detail-title">Defaults</div>
              <div className="row">
                <select value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)}>
                  <option value="AUD">AUD</option>
                  <option value="USD">USD</option>
                </select>
                <input value={source} onChange={(e) => setSource(e.target.value)} />
                <label className="row">
                  <input type="checkbox" checked={autoClassify} onChange={(e) => setAutoClassify(e.target.checked)} />
                  <span>Auto-classify</span>
                </label>
              </div>
              <div className="table-detail-copy">
                <div>
                  <strong>Default currency:</strong> {defaultCurrency}
                </div>
                <div>
                  <strong>Source tag:</strong> {source}
                </div>
              </div>
            </div>
          </div>
        </CollapsibleSection>
        {headers.length > 0 && (
          <CollapsibleSection
            title="Column mapping"
            summary={`${requiredMappedCount}/3 required fields mapped · ${formatCount(headers.length)} source columns detected`}
            defaultOpen
          >
            <div className="mapping-grid">
              {Object.keys(mapping).map((field) => (
                <div className="mapping-row" key={field}>
                  <span className="mapping-label">{field}</span>
                  <select
                    value={mapping[field]}
                    className={
                      importAttempted && ["date", "description", "amount"].includes(field) && !mapping[field]
                        ? "field-error"
                        : ""
                    }
                    onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                  >
                    <option value="">Select column</option>
                    {headers.map((header) => (
                      <option key={`${field}-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="row">
              <button onClick={requestPreview}>Preview</button>
              <button onClick={commitImport}>Import</button>
            </div>
          </CollapsibleSection>
        )}
        {preview.length > 0 && (
          <CollapsibleSection
            title="Preview rows"
            summary={`Showing ${formatCount(previewRows.length)} of ${formatCount(preview.length)} preview rows`}
            defaultOpen
          >
            <div className="preview-table-wrap">
              <table>
                <thead>
                  <tr>
                    {Object.keys(preview[0] || {}).map((key) => (
                      <th key={`prev-${key}`}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => (
                    <tr key={`row-${idx}`}>
                      {Object.keys(row).map((key) => (
                        <td key={`${idx}-${key}`}>{row[key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > previewRows.length && (
              <p className="muted">Showing the first {formatCount(previewRows.length)} rows to keep review focused.</p>
            )}
          </CollapsibleSection>
        )}
        <p className="muted">Bank-linking connectors are optional and behind feature flags.</p>
      </div>
      <div className="panel">
        <BoxTitle title="Import batches" />
        {batches.length === 0 ? (
          <div className="archive-empty">No import batches yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>File</th>
                <th>Progress</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const isExpanded = expandedBatchId === batch.id;
                const progress = Number(batch.total_rows || 0) > 0
                  ? Math.round((Number(batch.imported_rows || 0) / Number(batch.total_rows || 0)) * 100)
                  : 0;
                return (
                  <Fragment key={batch.id}>
                    <tr>
                      <td>
                        <div className="table-compact-title">Batch #{batch.id}</div>
                        <div className="table-compact-meta">{batch.source || "manual import"}</div>
                      </td>
                      <td>
                        <div className="table-compact-title">{batch.file_name || "Unnamed file"}</div>
                      </td>
                      <td>
                        <div className="table-compact-title">
                          {formatCount(batch.imported_rows)}/{formatCount(batch.total_rows)}
                        </div>
                        <div className="table-compact-meta">{formatCount(progress)}% imported</div>
                      </td>
                      <td>
                        <RowDisclosureButton open={isExpanded} onClick={() => toggleBatchDetails(batch.id)} />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="table-detail-row">
                        <td colSpan={4}>
                          <div className="table-detail-grid">
                            <div className="table-detail-card">
                              <div className="table-detail-title">Batch details</div>
                              <div className="table-detail-copy">
                                <div>
                                  <strong>Source:</strong> {batch.source || "manual import"}
                                </div>
                                <div>
                                  <strong>File:</strong> {batch.file_name || "Unnamed file"}
                                </div>
                                <div>
                                  <strong>Rows imported:</strong> {formatCount(batch.imported_rows)} of {formatCount(batch.total_rows)}
                                </div>
                              </div>
                            </div>
                            <div className="table-detail-card">
                              <div className="table-detail-title">Batch action</div>
                              <div className="row">
                                <button onClick={() => rollback(batch.id)}>Rollback</button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

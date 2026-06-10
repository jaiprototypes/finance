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

export function Settings({ onLogoChange }: { onLogoChange?: (logoPath: string) => void }) {
  const [lockEnabled, setLockEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryForm, setCategoryForm] = useState({ name: "", personal_allowed: true, business_allowed: true, tax_code: "" });
  const [dbPath, setDbPath] = useState("");
  const [backups, setBackups] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<any[]>([]);
  const [plaidStatus, setPlaidStatus] = useState<any | null>(null);
  const [plaidItems, setPlaidItems] = useState<any[]>([]);
  const [plaidAccounts, setPlaidAccounts] = useState<any[]>([]);
  const [plaidError, setPlaidError] = useState<string | null>(null);
  const [plaidSync, setPlaidSync] = useState<any | null>(null);
  const [plaidBusy, setPlaidBusy] = useState(false);
  const [plaidLinkBusy, setPlaidLinkBusy] = useState(false);
  const [upStatus, setUpStatus] = useState<any | null>(null);
  const [upAccounts, setUpAccounts] = useState<any[]>([]);
  const [upError, setUpError] = useState<string | null>(null);
  const [upSync, setUpSync] = useState<any | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [llmSettings, setLlmSettings] = useState<LlmSettings>(() => normalizeLlmSettings());
  const [companyProfile, setCompanyProfile] = useState({
    company_name: "",
    company_legal_name: "",
    company_dba: "",
    company_entity_type: "Sole Proprietor",
    company_tax_id: "",
    company_email: "",
    company_phone: "",
    company_address: "",
    company_city_state: "",
    company_logo_path: ""
  });
  const [emailSettings, setEmailSettings] = useState({
    smtp_host: "smtp.gmail.com",
    smtp_port: "587",
    smtp_username: "",
    smtp_password: "",
    smtp_from_name: "",
    smtp_from_email: "",
    smtp_use_tls: true,
    smtp_use_ssl: false
  });
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [budgetSkipMerchants, setBudgetSkipMerchants] = useState("");
  const [emailTestStatus, setEmailTestStatus] = useState<string | null>(null);
  const [emailTestError, setEmailTestError] = useState<string | null>(null);
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);
  const [logoPickError, setLogoPickError] = useState<string | null>(null);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [merchantForm, setMerchantForm] = useState({
    name: "",
    currency: "",
    default_category_id: "",
    default_classification: "Personal",
    notes: ""
  });
  const [merchantEditingId, setMerchantEditingId] = useState<number | null>(null);
  const [merchantEditForm, setMerchantEditForm] = useState({
    name: "",
    currency: "",
    default_category_id: "",
    default_classification: "Personal",
    notes: ""
  });
  const [merchantApplyExisting, setMerchantApplyExisting] = useState(false);
  const [merchantStatus, setMerchantStatus] = useState<string | null>(null);
  const [merchantError, setMerchantError] = useState<string | null>(null);
  const [merchantPage, setMerchantPage] = useState(1);
  const [merchantPageSize, setMerchantPageSize] = useState(25);
  const [rules, setRules] = useState<any[]>([]);
  const [ruleForm, setRuleForm] = useState({
    name: "",
    field: "description",
    operator: "contains",
    value: "",
    category_id: "",
    is_active: true
  });
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [knowledgeForm, setKnowledgeForm] = useState({
    title: "",
    content: "",
    tags: "",
    is_active: true
  });
  const refreshPlaid = () => {
    apiGet<any>("/plaid/status")
      .then(setPlaidStatus)
      .catch(() => setPlaidStatus({ configured: false, items: 0 }));
    apiGet<any[]>("/plaid/items").then(setPlaidItems).catch(() => setPlaidItems([]));
    apiGet<any[]>("/plaid/accounts").then(setPlaidAccounts).catch(() => setPlaidAccounts([]));
  };

  const refreshUp = () => {
    apiGet<any>("/up/status")
      .then(setUpStatus)
      .catch(() => setUpStatus({ configured: false, accounts: 0 }));
    apiGet<any[]>("/up/accounts").then(setUpAccounts).catch(() => setUpAccounts([]));
  };

  const connectPlaid = async () => {
    setPlaidError(null);
    setPlaidLinkBusy(true);
    try {
      await loadPlaidScript();
      const tokenResponse = await apiPost<any>("/plaid/link-token");
      savePendingPlaidLinkSession({ token: tokenResponse.link_token, mode: "connect" });
      const handler = window.Plaid.create({
        token: tokenResponse.link_token,
        onSuccess: async (publicToken: string, metadata: any) => {
          try {
            await apiPost("/plaid/exchange", { public_token: publicToken, metadata });
            clearPendingPlaidLinkSession();
            notifyPlaidRefresh();
            refreshPlaid();
          } catch (err) {
            setPlaidError(err instanceof Error ? err.message : "Unable to exchange Plaid token.");
          } finally {
            setPlaidLinkBusy(false);
          }
        },
        onExit: (err: any) => {
          if (err) {
            setPlaidError(formatPlaidLinkExitError(err));
          } else {
            clearPendingPlaidLinkSession();
          }
          setPlaidLinkBusy(false);
        }
      });
      handler.open();
    } catch (err) {
      setPlaidError(err instanceof Error ? err.message : "Unable to start Plaid Link.");
      setPlaidLinkBusy(false);
    }
  };

  const updatePlaidItem = async (itemId: string) => {
    setPlaidError(null);
    setPlaidLinkBusy(true);
    try {
      await loadPlaidScript();
      const tokenResponse = await apiPost<any>("/plaid/link-token/update", { item_id: itemId });
      savePendingPlaidLinkSession({ token: tokenResponse.link_token, mode: "update", itemId });
      const handler = window.Plaid.create({
        token: tokenResponse.link_token,
        onSuccess: async () => {
          try {
            const result = await apiPost<any>("/plaid/sync");
            clearPendingPlaidLinkSession();
            notifyPlaidRefresh();
            setPlaidSync(result);
            refreshPlaid();
          } catch (err) {
            setPlaidError(err instanceof Error ? err.message : "Unable to sync Plaid accounts after update.");
          } finally {
            setPlaidLinkBusy(false);
          }
        },
        onExit: (err: any) => {
          if (err) {
            setPlaidError(formatPlaidLinkExitError(err));
          } else {
            clearPendingPlaidLinkSession();
          }
          setPlaidLinkBusy(false);
        }
      });
      handler.open();
    } catch (err) {
      setPlaidError(err instanceof Error ? err.message : "Unable to start Plaid update mode.");
      setPlaidLinkBusy(false);
    }
  };

  const syncPlaid = async () => {
    setPlaidError(null);
    setPlaidBusy(true);
    try {
      const result = await apiPost<any>("/plaid/sync");
      setPlaidSync(result);
      refreshPlaid();
    } catch (err) {
      setPlaidError(err instanceof Error ? err.message : "Plaid sync failed.");
    } finally {
      setPlaidBusy(false);
    }
  };

  const syncUp = async () => {
    setUpError(null);
    setUpBusy(true);
    try {
      const result = await apiPost<any>("/up/sync");
      setUpSync(result);
      refreshUp();
    } catch (err) {
      setUpError(err instanceof Error ? err.message : "Up Bank sync failed.");
    } finally {
      setUpBusy(false);
    }
  };

  const plaidItemNeedsLogin = (item: any) =>
    item?.status === "login_required" ||
    (Array.isArray(plaidSync?.errors) &&
      plaidSync.errors.some(
        (error: any) => error?.item_id === item?.item_id && error?.error_code === "ITEM_LOGIN_REQUIRED"
      ));

  useEffect(() => {
    const handlePlaidRefresh = (event: StorageEvent) => {
      if (event.key === PLAID_REFRESH_EVENT_KEY) {
        refreshPlaid();
      }
    };
    window.addEventListener("storage", handlePlaidRefresh);
    return () => window.removeEventListener("storage", handlePlaidRefresh);
  }, []);

  useEffect(() => {
    apiGet<any>("/settings")
      .then((data) => {
        setLockEnabled(Boolean(data.lock_enabled));
        setLlmSettings(normalizeLlmSettings(data));
        setCompanyProfile({
          company_name: data.company_name || "",
          company_legal_name: data.company_legal_name || "",
          company_dba: data.company_dba || "",
          company_entity_type: data.company_entity_type || "Sole Proprietor",
          company_tax_id: data.company_tax_id || "",
          company_email: data.company_email || "",
          company_phone: data.company_phone || "",
          company_address: data.company_address || "",
          company_city_state: data.company_city_state || "",
          company_logo_path: data.company_logo_path || ""
        });
        setEmailSettings({
          smtp_host: data.smtp_host || "smtp.gmail.com",
          smtp_port: data.smtp_port || "587",
          smtp_username: data.smtp_username || "",
          smtp_password: data.smtp_password || "",
          smtp_from_name: data.smtp_from_name || "",
          smtp_from_email: data.smtp_from_email || "",
          smtp_use_tls: data.smtp_use_tls !== false,
          smtp_use_ssl: Boolean(data.smtp_use_ssl)
        });
        setBaseCurrency(data.base_currency || "USD");
        setBudgetSkipMerchants(data.budget_skip_merchants || "");
      })
      .catch(() => undefined);
    apiGet<any[]>("/categories").then(setCategories).catch(() => undefined);
    apiGet<any[]>("/classify/merchants").then(setMerchants).catch(() => undefined);
    apiGet<any[]>("/rules").then(setRules).catch(() => undefined);
    apiGet<any[]>("/knowledge").then(setKnowledge).catch(() => undefined);
    apiGet<any[]>("/connectors").then(setConnectors).catch(() => undefined);
    apiGet<any>("/diagnostics/status")
      .then((data) => setDbPath(data.db_path || ""))
      .catch(() => undefined);
    apiGet<any[]>("/diagnostics/backups").then(setBackups).catch(() => undefined);
    refreshPlaid();
    refreshUp();
  }, []);

  useEffect(() => {
    setLogoPreviewFailed(false);
  }, [companyProfile.company_logo_path]);

  const save = async () => {
    await apiPost("/settings", {
      lock_enabled: lockEnabled,
      password: password || undefined,
      base_currency: baseCurrency,
      local_ai_enabled: llmSettings.local_ai_enabled,
      local_ai_base_url: llmSettings.local_ai_base_url,
      local_ai_model: llmSettings.local_ai_model,
      local_ai_timeout_seconds: Number(llmSettings.local_ai_timeout_seconds) || DEFAULT_LOCAL_AI_TIMEOUT_SECONDS,
      embedding_model: llmSettings.embedding_model,
      personal_context: llmSettings.personal_context,
      company_name: companyProfile.company_name,
      company_legal_name: companyProfile.company_legal_name,
      company_dba: companyProfile.company_dba,
      company_entity_type: companyProfile.company_entity_type,
      company_tax_id: companyProfile.company_tax_id,
      company_email: companyProfile.company_email,
      company_phone: companyProfile.company_phone,
      company_address: companyProfile.company_address,
      company_city_state: companyProfile.company_city_state,
      company_logo_path: companyProfile.company_logo_path,
      smtp_host: emailSettings.smtp_host,
      smtp_port: emailSettings.smtp_port,
      smtp_username: emailSettings.smtp_username,
      smtp_password: emailSettings.smtp_password,
      smtp_from_name: emailSettings.smtp_from_name,
      smtp_from_email: emailSettings.smtp_from_email,
      smtp_use_tls: emailSettings.smtp_use_tls,
      smtp_use_ssl: emailSettings.smtp_use_ssl,
      budget_skip_merchants: budgetSkipMerchants
    });
    onLogoChange?.(companyProfile.company_logo_path);
    setPassword("");
    setStatus("Saved");
  };

  const sendEmailTest = async () => {
    setEmailTestStatus(null);
    setEmailTestError(null);
    try {
      const toEmail = emailSettings.smtp_from_email || emailSettings.smtp_username;
      await apiPost("/settings/email-test", { to_email: toEmail });
      setEmailTestStatus(`Sent test email to ${toEmail}.`);
    } catch (err) {
      setEmailTestError(err instanceof Error ? err.message : "Unable to send test email.");
    }
  };

  const pickLogo = async () => {
    setLogoPickError(null);
    try {
      if (!(window as any).__TAURI__) {
        setLogoPickError("File picker works in the desktop app only. Paste a local file path instead.");
        return;
      }
      const dialog = await import("@tauri-apps/plugin-dialog");
      const selected = await dialog.open({
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp"]
          }
        ]
      });
      if (typeof selected === "string") {
        setCompanyProfile({ ...companyProfile, company_logo_path: selected });
      }
    } catch (err) {
      setLogoPickError("Unable to open file picker. Paste a local file path instead.");
    }
  };

  const seed = async () => {
    await apiPost("/demo/seed");
    setStatus("Demo data created");
  };

  const reset = async () => {
    await apiPost("/demo/reset");
    setStatus("Demo data reset");
  };

  const createCategory = async () => {
    await apiPost("/categories", {
      name: categoryForm.name,
      personal_allowed: categoryForm.personal_allowed,
      business_allowed: categoryForm.business_allowed,
      tax_code: categoryForm.tax_code || undefined,
      is_active: true
    });
    setCategoryForm({ name: "", personal_allowed: true, business_allowed: true, tax_code: "" });
    apiGet<any[]>("/categories").then(setCategories).catch(() => undefined);
  };

  const resetMerchantForm = () => {
    setMerchantForm({ name: "", currency: "", default_category_id: "", default_classification: "Personal", notes: "" });
  };

  const resetMerchantEdit = () => {
    setMerchantEditingId(null);
    setMerchantEditForm({
      name: "",
      currency: "",
      default_category_id: "",
      default_classification: "Personal",
      notes: ""
    });
    setMerchantApplyExisting(false);
  };

  const createMerchant = async () => {
    setMerchantError(null);
    setMerchantStatus(null);
    if (!merchantForm.name.trim()) {
      setMerchantError("Merchant name is required.");
      return;
    }
    if (!merchantForm.currency.trim()) {
      setMerchantError("Currency is required.");
      return;
    }
    const payload = {
      name: merchantForm.name,
      currency: merchantForm.currency || undefined,
      default_category_id: merchantForm.default_category_id ? Number(merchantForm.default_category_id) : null,
      default_classification: merchantForm.default_classification,
      notes: merchantForm.notes || undefined
    };
    try {
      await apiPost("/classify/merchants", payload);
      setMerchantStatus("Merchant profile created.");
      resetMerchantForm();
      apiGet<any[]>("/classify/merchants").then(setMerchants).catch(() => undefined);
    } catch (err) {
      setMerchantError(err instanceof Error ? err.message : "Unable to create merchant profile.");
    }
  };

  const saveMerchantEdit = async () => {
    if (!merchantEditingId) return;
    setMerchantError(null);
    setMerchantStatus(null);
    if (!merchantEditForm.name.trim()) {
      setMerchantError("Merchant name is required.");
      return;
    }
    if (!merchantEditForm.currency.trim()) {
      setMerchantError("Currency is required.");
      return;
    }
    const payload = {
      name: merchantEditForm.name,
      currency: merchantEditForm.currency || undefined,
      default_category_id: merchantEditForm.default_category_id
        ? Number(merchantEditForm.default_category_id)
        : null,
      default_classification: merchantEditForm.default_classification,
      notes: merchantEditForm.notes || undefined
    };
    try {
      const result = await apiPost<any>(`/classify/merchants/${merchantEditingId}`, {
        ...payload,
        apply_to_transactions: merchantApplyExisting
      });
      if (Number(result?.updated || 0) > 0) {
        setMerchantStatus(`Updated ${formatCount(result.updated)} matching transactions.`);
      } else {
        setMerchantStatus("Merchant profile updated.");
      }
      resetMerchantEdit();
      apiGet<any[]>("/classify/merchants").then(setMerchants).catch(() => undefined);
    } catch (err) {
      setMerchantError(err instanceof Error ? err.message : "Unable to update merchant profile.");
    }
  };

  const startMerchantEdit = (merchant: any) => {
    if (merchantEditingId === merchant.id) {
      cancelMerchantEdit();
      return;
    }
    setMerchantEditingId(merchant.id);
    setMerchantEditForm({
      name: merchant.name || "",
      currency: merchant.currency || "",
      default_category_id: merchant.default_category_id ? String(merchant.default_category_id) : "",
      default_classification: merchant.default_classification || "Personal",
      notes: merchant.notes || ""
    });
    setMerchantApplyExisting(false);
    setMerchantError(null);
    setMerchantStatus(null);
  };

  const cancelMerchantEdit = () => {
    resetMerchantEdit();
    setMerchantError(null);
    setMerchantStatus(null);
  };

  const deleteMerchant = async (merchantId: number) => {
    const confirmed = window.confirm("Delete this merchant profile?");
    if (!confirmed) return;
    await apiDelete(`/classify/merchants/${merchantId}`);
    if (merchantEditingId === merchantId) {
      resetMerchantEdit();
    }
    setMerchantStatus("Merchant profile deleted.");
    apiGet<any[]>("/classify/merchants").then(setMerchants).catch(() => undefined);
  };

  useEffect(() => {
    setMerchantPage(1);
  }, [merchantPageSize, merchants.length]);

  const sortedMerchants = [...merchants].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
  );
  const merchantTotalPages = Math.max(1, Math.ceil(sortedMerchants.length / merchantPageSize));
  useEffect(() => {
    if (merchantPage > merchantTotalPages) {
      setMerchantPage(merchantTotalPages);
    }
  }, [merchantPage, merchantTotalPages]);
  const merchantStartIndex =
    sortedMerchants.length === 0 ? 0 : (merchantPage - 1) * merchantPageSize + 1;
  const merchantEndIndex = Math.min(merchantPage * merchantPageSize, sortedMerchants.length);
  const pagedMerchants = sortedMerchants.slice(
    (merchantPage - 1) * merchantPageSize,
    merchantPage * merchantPageSize
  );

  const createBackup = async () => {
    await apiPost("/diagnostics/backup");
    setStatus("Backup created");
    apiGet<any[]>("/diagnostics/backups").then(setBackups).catch(() => undefined);
  };

  const restoreBackup = async (backupName: string) => {
    await apiPost(`/diagnostics/restore?backup_name=${encodeURIComponent(backupName)}`);
    setStatus(`Restored ${backupName}. Restart the app to reload data.`);
  };

  const createRule = async () => {
    await apiPost("/rules", {
      name: ruleForm.name,
      field: ruleForm.field,
      operator: ruleForm.operator,
      value: ruleForm.value,
      category_id: ruleForm.category_id ? Number(ruleForm.category_id) : null,
      is_active: ruleForm.is_active
    });
    setRuleForm({ name: "", field: "description", operator: "contains", value: "", category_id: "", is_active: true });
    apiGet<any[]>("/rules").then(setRules).catch(() => undefined);
  };

  const toggleRule = async (rule: any) => {
    await apiPost(`/rules/${rule.id}`, {
      name: rule.name,
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      category_id: rule.category_id,
      payee: rule.payee,
      memo_contains: rule.memo_contains,
      is_active: !rule.is_active
    });
    apiGet<any[]>("/rules").then(setRules).catch(() => undefined);
  };

  const deleteRule = async (ruleId: number) => {
    await apiDelete(`/rules/${ruleId}`);
    apiGet<any[]>("/rules").then(setRules).catch(() => undefined);
  };

  const createKnowledge = async () => {
    await apiPost("/knowledge", {
      title: knowledgeForm.title,
      content: knowledgeForm.content,
      tags: knowledgeForm.tags || undefined,
      is_active: knowledgeForm.is_active
    });
    setKnowledgeForm({ title: "", content: "", tags: "", is_active: true });
    apiGet<any[]>("/knowledge").then(setKnowledge).catch(() => undefined);
  };

  const toggleKnowledge = async (entry: any) => {
    await apiPost(`/knowledge/${entry.id}`, {
      title: entry.title,
      content: entry.content,
      tags: entry.tags,
      is_active: !entry.is_active
    });
    apiGet<any[]>("/knowledge").then(setKnowledge).catch(() => undefined);
  };

  const deleteKnowledge = async (entryId: number) => {
    await apiDelete(`/knowledge/${entryId}`);
    apiGet<any[]>("/knowledge").then(setKnowledge).catch(() => undefined);
  };

  const customPreviewSrc = companyProfile.company_logo_path ? toLogoSrc(companyProfile.company_logo_path) : "";
  const usingDefaultLogo = !customPreviewSrc || logoPreviewFailed;
  const logoPreviewSrc = usingDefaultLogo ? defaultLogo : customPreviewSrc;
  const enabledConnectorCount = connectors.filter((connector) => connector.enabled).length;
  const configuredFeedCount = [Boolean(plaidStatus?.configured), Boolean(upStatus?.configured)].filter(Boolean).length;
  const activeRuleCount = rules.filter((rule) => rule.is_active).length;
  const activeKnowledgeCount = knowledge.filter((entry) => entry.is_active).length;
  const backupSummary = backups[0]
    ? `${formatCount(backups.length)} backups · latest ${formatFileSize(backups[0].size)}`
    : "No backups created yet";
  const bankFeedSummary = `${formatCount(configuredFeedCount)} configured feeds · ${formatCount(
    enabledConnectorCount
  )} enabled connectors`;
  const automationSummary = `${
    llmSettings.local_ai_enabled ? "Local AI on" : "Local AI off"
  } · ${formatCount(activeRuleCount)} active rules · ${formatCount(activeKnowledgeCount)} knowledge notes · ${formatCount(
    merchants.length
  )} merchants`;
  const adminSummary = `${formatCount(categories.length)} categories · lock and demo tools`;

  return (
    <div className="page">
      <SectionHeader title="Control Room" subtitle="Security, categories, data location, and backups." />
      {status && (
        <div className="callout compact-callout">
          <strong>{status}</strong>
        </div>
      )}
      <div className="panel">
        <BoxTitle title="Base currency + Budget filters" />
        <div className="row">
          <select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
            <option value="USD">USD</option>
            <option value="AUD">AUD</option>
          </select>
          <textarea
            placeholder="Skip merchants (comma or new line separated)"
            value={budgetSkipMerchants}
            onChange={(e) => setBudgetSkipMerchants(e.target.value)}
            rows={2}
          />
        </div>
        <p className="muted">
          Reports and budget actuals rebalance to this base using the latest trailing fortnight
          AUD/USD average.
        </p>
        <p className="muted">Transactions classified as Transfers or Friends & Family are excluded from budget actuals.</p>
        <div className="row">
          <button onClick={save}>Save base currency</button>
        </div>
      </div>
      <div className="panel">
        <BoxTitle title="Data location + backups" />
        <p className="muted">{dbPath || "Database not available"}</p>
        <div className="row">
          <button onClick={createBackup}>Create backup</button>
        </div>
        <p className="muted">{backupSummary}</p>
        {backups.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Backup</th>
                <th>Size</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr key={backup.name}>
                  <td>{backup.name}</td>
                  <td>{formatFileSize(backup.size)}</td>
                  <td>
                    <button onClick={() => restoreBackup(backup.name)}>Restore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="panel">
        <BoxTitle title="Company profile (invoices)" />
        <div className="row">
          <input
            placeholder="Company name"
            value={companyProfile.company_name}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_name: e.target.value })}
          />
          <input
            placeholder="Legal name"
            value={companyProfile.company_legal_name}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_legal_name: e.target.value })}
          />
          <input
            placeholder="DBA / Trade name"
            value={companyProfile.company_dba}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_dba: e.target.value })}
          />
          <input
            placeholder="Email"
            value={companyProfile.company_email}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_email: e.target.value })}
          />
          <input
            placeholder="Phone"
            value={companyProfile.company_phone}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_phone: e.target.value })}
          />
        </div>
        <div className="row">
          <input
            placeholder="Business type (e.g., Sole Proprietor)"
            value={companyProfile.company_entity_type}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_entity_type: e.target.value })}
          />
          <input
            placeholder="Tax ID (EIN or Sales Tax #)"
            value={companyProfile.company_tax_id}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_tax_id: e.target.value })}
          />
          <input
            placeholder="City/State"
            value={companyProfile.company_city_state}
            onChange={(e) => setCompanyProfile({ ...companyProfile, company_city_state: e.target.value })}
          />
        </div>
        <textarea
          placeholder="Address"
          value={companyProfile.company_address}
          onChange={(e) => setCompanyProfile({ ...companyProfile, company_address: e.target.value })}
          rows={2}
        />
        <input
          placeholder="Logo file path (PNG/JPG)"
          value={companyProfile.company_logo_path}
          onChange={(e) => setCompanyProfile({ ...companyProfile, company_logo_path: e.target.value })}
        />
        <div className="row">
          <button className="button-ghost" onClick={pickLogo}>
            Choose logo image
          </button>
          <button onClick={save}>Save company profile</button>
        </div>
        {logoPickError && <p className="form-error">{logoPickError}</p>}
        <div className="logo-preview">
          <img
            src={logoPreviewSrc}
            alt="Logo preview"
            onError={() => {
              if (customPreviewSrc) setLogoPreviewFailed(true);
            }}
          />
          <div>
            <div className="logo-preview-title">
              {usingDefaultLogo ? "Default logo preview" : "Custom logo preview"}
            </div>
            <div className="muted">
              {usingDefaultLogo
                ? "Using the bundled logo until a custom path is saved."
                : "Loaded from your local file path."}
            </div>
          </div>
        </div>
        <p className="muted">Use a local file path, e.g. /Users/you/Downloads/logo.png</p>
      </div>
      <CollapsibleSection
        title="Invoice delivery"
        summary="SMTP configuration for invoice sending and test emails."
        defaultOpen={Boolean(emailSettings.smtp_username || emailTestError || emailTestStatus)}
      >
        <div className="panel">
          <BoxTitle title="Invoice email (SMTP)" />
          {emailTestStatus && <p className="muted">{emailTestStatus}</p>}
          {emailTestError && <p className="form-error">{emailTestError}</p>}
          <div className="row">
            <input
              placeholder="SMTP host"
              value={emailSettings.smtp_host}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_host: e.target.value })}
            />
            <input
              placeholder="Port"
              value={emailSettings.smtp_port}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_port: e.target.value })}
            />
            <input
              placeholder="Username"
              value={emailSettings.smtp_username}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_username: e.target.value })}
            />
          </div>
          <div className="row">
            <input
              type="password"
              placeholder="Password (App Password)"
              value={emailSettings.smtp_password}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_password: e.target.value })}
            />
            <input
              placeholder="From name"
              value={emailSettings.smtp_from_name}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_from_name: e.target.value })}
            />
            <input
              placeholder="From email"
              value={emailSettings.smtp_from_email}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtp_from_email: e.target.value })}
            />
          </div>
          <div className="row">
            <label className="row">
              <input
                type="checkbox"
                checked={emailSettings.smtp_use_tls}
                onChange={(e) =>
                  setEmailSettings({
                    ...emailSettings,
                    smtp_use_tls: e.target.checked,
                    smtp_use_ssl: e.target.checked ? false : emailSettings.smtp_use_ssl
                  })
                }
              />
              <span>Use STARTTLS</span>
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={emailSettings.smtp_use_ssl}
                onChange={(e) =>
                  setEmailSettings({
                    ...emailSettings,
                    smtp_use_ssl: e.target.checked,
                    smtp_use_tls: e.target.checked ? false : emailSettings.smtp_use_tls
                  })
                }
              />
              <span>Use SSL (port 465)</span>
            </label>
            <button onClick={save}>Save email settings</button>
            <button className="button-ghost" onClick={sendEmailTest}>
              Send test email
            </button>
          </div>
          <p className="muted">For Gmail: smtp.gmail.com · port 587 · STARTTLS · App Password required.</p>
        </div>
      </CollapsibleSection>
      <CollapsibleSection
        title="Bank feeds"
        summary={bankFeedSummary}
        defaultOpen={Boolean(plaidStatus?.configured || upStatus?.configured || plaidError || upError)}
      >
        {(!plaidStatus?.configured || !upStatus?.configured) && (
          <div className="form-notice">
            Public builds do not include bank connector credentials. Add private Plaid or Up Bank env files in the
            Finances app data folder, or export the matching environment variables before launching the app.
          </div>
        )}
        <div className="panel">
          <BoxTitle title="Bank feed (Plaid)" />
          {plaidError && <p className="form-error">{plaidError}</p>}
          {plaidStatus?.env && (
            <p className="muted">
              Environment: <strong>{String(plaidStatus.env)}</strong>
            </p>
          )}
          {!plaidStatus?.configured && (
            <p className="muted">
              Plaid is not configured. Add a plaid.env file to the app data folder with PLAID_CLIENT_ID, PLAID_SECRET,
              PLAID_ENV, and PLAID_REDIRECT_URI.
            </p>
          )}
          {plaidStatus?.configured && !plaidStatus?.redirect_uri_configured && (
            <p className="form-error">
              Plaid OAuth redirect is not configured. Set PLAID_REDIRECT_URI to reconnect OAuth institutions in the
              desktop app.
            </p>
          )}
          <div className="row">
            <button onClick={connectPlaid} disabled={!plaidStatus?.configured || plaidLinkBusy} type="button">
              {plaidLinkBusy ? "Connecting…" : plaidItems.length > 0 ? "Connect new institution" : "Connect checking account"}
            </button>
            <button
              className="button-ghost"
              onClick={syncPlaid}
              disabled={!plaidStatus?.configured || plaidBusy || plaidItems.length === 0}
              type="button"
            >
              {plaidBusy ? "Syncing…" : "Sync now"}
            </button>
            {plaidSync && (
              <span className="muted">
                Synced {plaidSync.added} added · {plaidSync.modified} updated · {plaidSync.removed} removed
                {plaidSync.accounts_created ? ` · ${formatCount(plaidSync.accounts_created)} account mapped` : ""}
              </span>
            )}
          </div>
          {Array.isArray(plaidSync?.errors) && plaidSync.errors.length > 0 && (
            <div className="form-notice">
              {plaidSync.errors.map((error: any, index: number) => (
                <div key={`${error.item_id || "plaid"}-${error.endpoint || index}`}>
                  {error.institution_name || "Plaid item"} {error.endpoint || "sync"}:{" "}
                  {error.message || "Plaid returned an error."}
                  {error.request_id ? ` (${error.request_id})` : ""}
                  {error.error_code === "ITEM_LOGIN_REQUIRED" && error.item_id ? (
                    <>
                      {" "}
                      <button
                        className="button-ghost button-small"
                        onClick={() => updatePlaidItem(error.item_id)}
                        disabled={!plaidStatus?.configured || plaidLinkBusy}
                        type="button"
                      >
                        Reconnect
                      </button>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {plaidItems.length > 0 && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h4>Connected items</h4>
              <table>
                <thead>
                  <tr>
                    <th>Institution</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {plaidItems.map((item) => (
                    <tr key={item.item_id}>
                      <td>{item.institution_name || item.item_id}</td>
                      <td>{item.status === "login_required" ? "login required" : item.status}</td>
                      <td>{item.updated_at || ""}</td>
                      <td>
                        {item.status === "duplicate" ? (
                          <span className="muted">Inactive duplicate</span>
                        ) : (
                          <button
                            className="button-ghost button-small"
                            onClick={() => updatePlaidItem(item.item_id)}
                            disabled={!plaidStatus?.configured || plaidLinkBusy}
                            type="button"
                          >
                            {plaidItemNeedsLogin(item) ? "Reconnect" : "Add accounts"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {plaidAccounts.length > 0 && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h4>Checking accounts</h4>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Mask</th>
                    <th>Type</th>
                    <th>Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {plaidAccounts.map((account) => (
                    <tr key={account.plaid_account_id}>
                      <td>{account.name}</td>
                      <td>{account.mask}</td>
                      <td>{account.subtype || account.type}</td>
                      <td>{account.currency || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="panel">
          <BoxTitle title="Bank feed (Up Bank)" />
          {upError && <p className="form-error">{upError}</p>}
          {!upStatus?.configured && (
            <p className="muted">Up Bank is not configured. Add an up.env file to the app data folder with UP_API_KEY.</p>
          )}
          <div className="row">
            <button onClick={syncUp} disabled={!upStatus?.configured || upBusy}>
              {upBusy ? "Syncing…" : "Sync Up Bank"}
            </button>
            {upSync && (
              <span className="muted">
                Accounts {upSync.accounts?.accounts ?? 0} · Transactions +{upSync.transactions?.added ?? 0}
              </span>
            )}
          </div>
          {upAccounts.length > 0 && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h4>Connected accounts</h4>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Currency</th>
                    <th>Last sync</th>
                  </tr>
                </thead>
                <tbody>
                  {upAccounts.map((account) => (
                    <tr key={account.up_account_id}>
                      <td>{account.name || account.up_account_id}</td>
                      <td>{account.account_type || ""}</td>
                      <td>{account.currency || ""}</td>
                      <td>{account.last_synced_at || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted">Up Bank API is AUD-only. Transactions will import into your chart of accounts.</p>
        </div>
        <div className="panel">
          <BoxTitle title="Connectors" />
          <p className="muted">Optional bank-linking connectors are disabled by default.</p>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((connector) => (
                <tr key={connector.name}>
                  <td>{connector.name}</td>
                  <td>{connector.enabled ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
      <CollapsibleSection
        title="Automation + rules"
        summary={automationSummary}
        defaultOpen={llmSettings.local_ai_enabled}
      >
        <div className="panel">
          <BoxTitle title="Local AI assistant" />
          <label className="row">
            <input
              type="checkbox"
              checked={llmSettings.local_ai_enabled}
              onChange={(e) => setLlmSettings({ ...llmSettings, local_ai_enabled: e.target.checked })}
            />
            <span>Enable local assistant commentary and categorization support</span>
          </label>
          <div className="row">
            <input
              placeholder="Local AI base URL"
              value={llmSettings.local_ai_base_url}
              onChange={(e) => setLlmSettings({ ...llmSettings, local_ai_base_url: e.target.value })}
            />
            <input
              placeholder="Local AI model"
              value={llmSettings.local_ai_model}
              onChange={(e) => setLlmSettings({ ...llmSettings, local_ai_model: e.target.value })}
            />
          </div>
          <div className="row">
            <input
              type="number"
              min={1}
              placeholder="Timeout seconds"
              value={String(llmSettings.local_ai_timeout_seconds)}
              onChange={(e) =>
                setLlmSettings({
                  ...llmSettings,
                  local_ai_timeout_seconds: Math.max(1, Number(e.target.value) || DEFAULT_LOCAL_AI_TIMEOUT_SECONDS)
                })
              }
            />
            <input
              placeholder="Retrieval backend"
              value={llmSettings.embedding_model}
              onChange={(e) => setLlmSettings({ ...llmSettings, embedding_model: e.target.value })}
            />
          </div>
          <p className="muted">
            Local AI must point to a loopback service such as Ollama or LM Studio running on this machine.
            It never becomes the source of truth for balances, budgets, debt math, or invoice totals.
          </p>
          <textarea
            placeholder="Private context for merchant aliases, category preferences, and budgeting guidance"
            value={llmSettings.personal_context}
            onChange={(e) => setLlmSettings({ ...llmSettings, personal_context: e.target.value })}
            rows={4}
          />
        </div>
        <div className="panel">
          <BoxTitle title="Classification rules" />
          <div className="row">
            <input
              placeholder="Rule name"
              value={ruleForm.name}
              onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
            />
            <select value={ruleForm.field} onChange={(e) => setRuleForm({ ...ruleForm, field: e.target.value })}>
              <option value="description">Description</option>
              <option value="payee">Payee</option>
              <option value="notes">Notes</option>
            </select>
            <select
              value={ruleForm.operator}
              onChange={(e) => setRuleForm({ ...ruleForm, operator: e.target.value })}
            >
              <option value="contains">Contains</option>
              <option value="equals">Equals</option>
              <option value="starts_with">Starts with</option>
              <option value="ends_with">Ends with</option>
            </select>
            <input
              placeholder="Match value"
              value={ruleForm.value}
              onChange={(e) => setRuleForm({ ...ruleForm, value: e.target.value })}
            />
            <select
              value={ruleForm.category_id}
              onChange={(e) => setRuleForm({ ...ruleForm, category_id: e.target.value })}
            >
              <option value="">Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <label className="row">
              <input
                type="checkbox"
                checked={ruleForm.is_active}
                onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })}
              />
              <span>Active</span>
            </label>
            <button onClick={createRule}>Add rule</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Field</th>
                <th>Op</th>
                <th>Value</th>
                <th>Category</th>
                <th>Active</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const category = categories.find((cat) => cat.id === rule.category_id);
                return (
                  <tr key={rule.id}>
                    <td>{rule.name}</td>
                    <td>{rule.field}</td>
                    <td>{rule.operator}</td>
                    <td>{rule.value}</td>
                    <td>{category ? category.name : ""}</td>
                    <td>{rule.is_active ? "Yes" : "No"}</td>
                    <td>
                      <button onClick={() => toggleRule(rule)}>{rule.is_active ? "Disable" : "Enable"}</button>
                      <button onClick={() => deleteRule(rule.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <BoxTitle title="Knowledge base (RAG)" />
          <div className="row">
            <input
              placeholder="Title"
              value={knowledgeForm.title}
              onChange={(e) => setKnowledgeForm({ ...knowledgeForm, title: e.target.value })}
            />
            <input
              placeholder="Tags"
              value={knowledgeForm.tags}
              onChange={(e) => setKnowledgeForm({ ...knowledgeForm, tags: e.target.value })}
            />
            <label className="row">
              <input
                type="checkbox"
                checked={knowledgeForm.is_active}
                onChange={(e) => setKnowledgeForm({ ...knowledgeForm, is_active: e.target.checked })}
              />
              <span>Active</span>
            </label>
            <button onClick={createKnowledge}>Add entry</button>
          </div>
          <textarea
            placeholder="Notes to guide classification and reporting"
            value={knowledgeForm.content}
            onChange={(e) => setKnowledgeForm({ ...knowledgeForm, content: e.target.value })}
            rows={3}
          />
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Tags</th>
                <th>Active</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {knowledge.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.title}</td>
                  <td>{entry.tags || ""}</td>
                  <td>{entry.is_active ? "Yes" : "No"}</td>
                  <td>
                    <button onClick={() => toggleKnowledge(entry)}>{entry.is_active ? "Disable" : "Enable"}</button>
                    <button onClick={() => deleteKnowledge(entry.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <BoxTitle title="Merchant profiles" />
        <div className="row">
          <input
            placeholder="Merchant name"
            value={merchantForm.name}
            onChange={(e) => setMerchantForm({ ...merchantForm, name: e.target.value })}
          />
          <input
            placeholder="Currency (USD)"
            value={merchantForm.currency}
            onChange={(e) => setMerchantForm({ ...merchantForm, currency: e.target.value.toUpperCase() })}
          />
          <select
            value={merchantForm.default_category_id}
            onChange={(e) => setMerchantForm({ ...merchantForm, default_category_id: e.target.value })}
          >
            <option value="">Category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <select
            value={merchantForm.default_classification}
            onChange={(e) => setMerchantForm({ ...merchantForm, default_classification: e.target.value })}
          >
            <option value="Personal">Personal</option>
            <option value="Business">Business</option>
          </select>
          <input
            placeholder="Notes"
            value={merchantForm.notes}
            onChange={(e) => setMerchantForm({ ...merchantForm, notes: e.target.value })}
          />
          <button onClick={createMerchant}>Add merchant</button>
        </div>
        {merchantError && <p className="form-error">{merchantError}</p>}
        {merchantStatus && <p className="muted">{merchantStatus}</p>}
        <div className="row">
          <span className="muted">
            Showing {formatCount(merchantStartIndex)}-{formatCount(merchantEndIndex)} of {formatCount(sortedMerchants.length)}
          </span>
          <div className="row">
            <span className="muted">Rows</span>
            <select value={merchantPageSize} onChange={(e) => setMerchantPageSize(Number(e.target.value))}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="row">
            <button
              className="button-ghost button-small"
              onClick={() => setMerchantPage((page) => Math.max(1, page - 1))}
              disabled={merchantPage <= 1}
            >
              Prev
            </button>
            <span className="muted">
              Page {formatCount(merchantPage)} of {formatCount(merchantTotalPages)}
            </span>
            <button
              className="button-ghost button-small"
              onClick={() => setMerchantPage((page) => Math.min(merchantTotalPages, page + 1))}
              disabled={merchantPage >= merchantTotalPages}
            >
              Next
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Merchant</th>
              <th>Currency</th>
              <th>Category</th>
              <th>Classification</th>
              <th>Notes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pagedMerchants.map((merchant) => (
              <React.Fragment key={`merchant-${merchant.id}`}>
                <tr>
                  <td>{merchant.name}</td>
                  <td>{merchant.currency || ""}</td>
                  <td>{categories.find((cat) => cat.id === merchant.default_category_id)?.name || ""}</td>
                  <td>{merchant.default_classification}</td>
                  <td>{merchant.notes || ""}</td>
                  <td>
                    <button className="button-ghost button-small" onClick={() => startMerchantEdit(merchant)}>
                      {merchantEditingId === merchant.id ? "Close" : "Edit"}
                    </button>
                    <button className="button-ghost button-small" onClick={() => deleteMerchant(merchant.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
                {merchantEditingId === merchant.id && (
                  <tr className="table-inline">
                    <td colSpan={6}>
                      <div className="row">
                        <input
                          placeholder="Merchant name"
                          value={merchantEditForm.name}
                          onChange={(e) => setMerchantEditForm({ ...merchantEditForm, name: e.target.value })}
                        />
                        <input
                          placeholder="Currency (USD)"
                          value={merchantEditForm.currency}
                          onChange={(e) =>
                            setMerchantEditForm({ ...merchantEditForm, currency: e.target.value.toUpperCase() })
                          }
                        />
                        <select
                          value={merchantEditForm.default_category_id}
                          onChange={(e) =>
                            setMerchantEditForm({ ...merchantEditForm, default_category_id: e.target.value })
                          }
                        >
                          <option value="">Category</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={merchantEditForm.default_classification}
                          onChange={(e) =>
                            setMerchantEditForm({ ...merchantEditForm, default_classification: e.target.value })
                          }
                        >
                          <option value="Personal">Personal</option>
                          <option value="Business">Business</option>
                        </select>
                        <input
                          placeholder="Notes"
                          value={merchantEditForm.notes}
                          onChange={(e) => setMerchantEditForm({ ...merchantEditForm, notes: e.target.value })}
                        />
                        <label className="row">
                          <input
                            type="checkbox"
                            checked={merchantApplyExisting}
                            onChange={(e) => setMerchantApplyExisting(e.target.checked)}
                          />
                          <span>Apply changes to existing transactions</span>
                        </label>
                        <button onClick={saveMerchantEdit}>Save</button>
                        <button className="button-ghost button-small" onClick={cancelMerchantEdit}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      </CollapsibleSection>
      <CollapsibleSection
        title="Admin tools"
        summary={adminSummary}
        defaultOpen={false}
      >
        <div className="panel">
          <BoxTitle title="Security & demo data" />
          <label className="row">
            <input type="checkbox" checked={lockEnabled} onChange={(e) => setLockEnabled(e.target.checked)} />
            <span>Enable app lock</span>
          </label>
          <input
            type="password"
            placeholder="Set/replace password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="row">
            <button onClick={save}>Save settings</button>
            <button onClick={seed}>Seed demo data</button>
            <button onClick={reset}>Reset demo data</button>
          </div>
        </div>
        <div className="panel">
          <BoxTitle title="Categories" />
          <div className="row">
            <input
              placeholder="Category name"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
            />
            <label className="row">
              <input
                type="checkbox"
                checked={categoryForm.personal_allowed}
                onChange={(e) => setCategoryForm({ ...categoryForm, personal_allowed: e.target.checked })}
              />
              <span>Personal</span>
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={categoryForm.business_allowed}
                onChange={(e) => setCategoryForm({ ...categoryForm, business_allowed: e.target.checked })}
              />
              <span>Business</span>
            </label>
            <input
              placeholder="Tax code"
              value={categoryForm.tax_code}
              onChange={(e) => setCategoryForm({ ...categoryForm, tax_code: e.target.value })}
            />
            <button onClick={createCategory}>Add category</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Personal</th>
                <th>Business</th>
                <th>Tax code</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td>{cat.name}</td>
                  <td>{cat.personal_allowed ? "Yes" : "No"}</td>
                  <td>{cat.business_allowed ? "Yes" : "No"}</td>
                  <td>{cat.tax_code || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    </div>
  );
}

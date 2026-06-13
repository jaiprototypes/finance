import { Fragment, useEffect, useState } from "react";
import { getFeatureData, sendFeatureCommand } from "../api";
import defaultLogo from "../../../assets/logo.png";
import {
  BoxTitle,
  CollapsibleSection,
  DEFAULT_LOCAL_AI_TIMEOUT_SECONDS,
  SectionHeader,
  formatCount,
  formatFileSize,
  normalizeLlmSettings,
  toLogoSrc,
} from "../../../shared/financeUi";
import type { LlmSettings } from "../../../shared/financeUi";
import { useAutomationSettings } from "./useAutomationSettings";
import { useBankFeedSettings } from "./useBankFeedSettings";
import { useMerchantProfileSettings } from "./useMerchantProfileSettings";

export type SettingsWorkspaceProps = {
  onLogoChange?: (logoPath: string) => void;
};

export function useSettingsWorkspace({ onLogoChange }: SettingsWorkspaceProps) {
  const [lockEnabled, setLockEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryForm, setCategoryForm] = useState({ name: "", personal_allowed: true, business_allowed: true, tax_code: "" });
  const [dbPath, setDbPath] = useState("");
  const [backups, setBackups] = useState<any[]>([]);
  const {
    connectPlaid,
    connectors,
    plaidAccounts,
    plaidBusy,
    plaidError,
    plaidItemNeedsLogin,
    plaidItems,
    plaidLinkBusy,
    plaidStatus,
    plaidSync,
    syncPlaid,
    syncUp,
    updatePlaidItem,
    upAccounts,
    upBusy,
    upError,
    upStatus,
    upSync
  } = useBankFeedSettings();
  const {
    cancelMerchantEdit,
    createMerchant,
    deleteMerchant,
    merchantApplyExisting,
    merchantEditForm,
    merchantEditingId,
    merchantEndIndex,
    merchantError,
    merchantForm,
    merchantPage,
    merchantPageSize,
    merchantStartIndex,
    merchantStatus,
    merchantTotalPages,
    merchants,
    pagedMerchants,
    saveMerchantEdit,
    setMerchantApplyExisting,
    setMerchantEditForm,
    setMerchantForm,
    setMerchantPage,
    setMerchantPageSize,
    sortedMerchants,
    startMerchantEdit
  } = useMerchantProfileSettings();
  const {
    activeKnowledgeCount,
    activeRuleCount,
    createKnowledge,
    createRule,
    deleteKnowledge,
    deleteRule,
    knowledge,
    knowledgeForm,
    ruleForm,
    rules,
    setKnowledgeForm,
    setRuleForm,
    toggleKnowledge,
    toggleRule
  } = useAutomationSettings();
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
  useEffect(() => {
    getFeatureData<any>("/settings")
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
    getFeatureData<any[]>("/categories").then(setCategories).catch(() => undefined);
    getFeatureData<any>("/diagnostics/status")
      .then((data) => setDbPath(data.db_path || ""))
      .catch(() => undefined);
    getFeatureData<any[]>("/diagnostics/backups").then(setBackups).catch(() => undefined);
  }, []);

  useEffect(() => {
    setLogoPreviewFailed(false);
  }, [companyProfile.company_logo_path]);

  const save = async () => {
    await sendFeatureCommand("/settings", {
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
      await sendFeatureCommand("/settings/email-test", { to_email: toEmail });
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
    await sendFeatureCommand("/demo/seed");
    setStatus("Demo data created");
  };

  const reset = async () => {
    await sendFeatureCommand("/demo/reset");
    setStatus("Demo data reset");
  };

  const createCategory = async () => {
    await sendFeatureCommand("/categories", {
      name: categoryForm.name,
      personal_allowed: categoryForm.personal_allowed,
      business_allowed: categoryForm.business_allowed,
      tax_code: categoryForm.tax_code || undefined,
      is_active: true
    });
    setCategoryForm({ name: "", personal_allowed: true, business_allowed: true, tax_code: "" });
    getFeatureData<any[]>("/categories").then(setCategories).catch(() => undefined);
  };

  const createBackup = async () => {
    await sendFeatureCommand("/diagnostics/backup");
    setStatus("Backup created");
    getFeatureData<any[]>("/diagnostics/backups").then(setBackups).catch(() => undefined);
  };

  const restoreBackup = async (backupName: string) => {
    await sendFeatureCommand(`/diagnostics/restore?backup_name=${encodeURIComponent(backupName)}`);
    setStatus(`Restored ${backupName}. Restart the app to reload data.`);
  };

  const customPreviewSrc = companyProfile.company_logo_path ? toLogoSrc(companyProfile.company_logo_path) : "";
  const usingDefaultLogo = !customPreviewSrc || logoPreviewFailed;
  const logoPreviewSrc = usingDefaultLogo ? defaultLogo : customPreviewSrc;
  const enabledConnectorCount = connectors.filter((connector) => connector.enabled).length;
  const configuredFeedCount = [Boolean(plaidStatus?.configured), Boolean(upStatus?.configured)].filter(Boolean).length;
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

  const viewModel = {
    Fragment,
    BoxTitle,
    CollapsibleSection,
    DEFAULT_LOCAL_AI_TIMEOUT_SECONDS,
    SectionHeader,
    formatCount,
    formatFileSize,
    lockEnabled,
    setLockEnabled,
    password,
    setPassword,
    status,
    categories,
    categoryForm,
    setCategoryForm,
    dbPath,
    backups,
    connectors,
    plaidStatus,
    plaidItems,
    plaidAccounts,
    plaidError,
    plaidSync,
    plaidBusy,
    plaidLinkBusy,
    upStatus,
    upAccounts,
    upError,
    upSync,
    upBusy,
    llmSettings,
    setLlmSettings,
    companyProfile,
    setCompanyProfile,
    emailSettings,
    setEmailSettings,
    baseCurrency,
    setBaseCurrency,
    budgetSkipMerchants,
    setBudgetSkipMerchants,
    emailTestStatus,
    emailTestError,
    setLogoPreviewFailed,
    logoPickError,
    merchants,
    merchantForm,
    setMerchantForm,
    merchantEditingId,
    merchantEditForm,
    setMerchantEditForm,
    merchantApplyExisting,
    setMerchantApplyExisting,
    merchantStatus,
    merchantError,
    merchantPage,
    setMerchantPage,
    merchantPageSize,
    setMerchantPageSize,
    rules,
    ruleForm,
    setRuleForm,
    knowledge,
    knowledgeForm,
    setKnowledgeForm,
    connectPlaid,
    updatePlaidItem,
    syncPlaid,
    syncUp,
    plaidItemNeedsLogin,
    save,
    sendEmailTest,
    pickLogo,
    seed,
    reset,
    createCategory,
    createMerchant,
    saveMerchantEdit,
    startMerchantEdit,
    cancelMerchantEdit,
    deleteMerchant,
    sortedMerchants,
    merchantTotalPages,
    merchantStartIndex,
    merchantEndIndex,
    pagedMerchants,
    createBackup,
    restoreBackup,
    createRule,
    toggleRule,
    deleteRule,
    createKnowledge,
    toggleKnowledge,
    deleteKnowledge,
    customPreviewSrc,
    usingDefaultLogo,
    logoPreviewSrc,
    backupSummary,
    bankFeedSummary,
    automationSummary,
    adminSummary
  };

  return viewModel;
}

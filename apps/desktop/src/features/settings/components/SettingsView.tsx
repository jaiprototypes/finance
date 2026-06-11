import { BudgetSettingsSection } from "./sections/BudgetSettingsSection";
import { BackupSettingsSection } from "./sections/BackupSettingsSection";
import { CompanyProfileSection } from "./sections/CompanyProfileSection";
import { InvoiceDeliverySection } from "./sections/InvoiceDeliverySection";
import { BankFeedsSection } from "./sections/BankFeedsSection";
import { AutomationRulesSection } from "./sections/AutomationRulesSection";
import { AdminToolsSection } from "./sections/AdminToolsSection";
export function SettingsView({ model }: { model: any }) {
  const {
    SectionHeader,
    status,
  } = model;

  return (
    <div className="page">
      <SectionHeader title="Control Room" subtitle="Security, categories, data location, and backups." />
      {status && (
        <div className="callout compact-callout">
          <strong>{status}</strong>
        </div>
      )}
      <BudgetSettingsSection model={model} />
      <BackupSettingsSection model={model} />
      <CompanyProfileSection model={model} />
      <InvoiceDeliverySection model={model} />
      <BankFeedsSection model={model} />
      <AutomationRulesSection model={model} />
      <AdminToolsSection model={model} />
    </div>
  );
}

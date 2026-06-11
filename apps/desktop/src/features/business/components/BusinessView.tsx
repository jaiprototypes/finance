import { BusinessSummarySection } from "./sections/BusinessSummarySection";
import { BusinessToolsSection } from "./sections/BusinessToolsSection";
import { ClientDirectorySection } from "./sections/ClientDirectorySection";
import { LiveInvoicesSection } from "./sections/LiveInvoicesSection";
import { HistoricalRecordsSection } from "./sections/HistoricalRecordsSection";
import { InvoicePreviewModal } from "./sections/InvoicePreviewModal";
export function BusinessView({ model }: { model: any }) {
  const {
    SectionHeader,
  } = model;

  return (
    <div className="page">
      <SectionHeader
        title="Business"
        subtitle="Run client records, receivables, and historical invoice collections from one local workspace."
      />
      <BusinessSummarySection model={model} />
      <BusinessToolsSection model={model} />
      <ClientDirectorySection model={model} />
      <LiveInvoicesSection model={model} />
      <HistoricalRecordsSection model={model} />
      <InvoicePreviewModal model={model} />
    </div>
  );
}

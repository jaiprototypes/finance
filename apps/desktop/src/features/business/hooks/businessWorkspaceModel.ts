import {
  formatCount,
  formatCurrency,
  isClosedReceivableStatus,
  todayDate
} from "../../../shared/financeUi";
import type { InvoicePreviewLineItem } from "../../../shared/financeUi";

export function buildBusinessWorkspaceModel({
  archiveDetail,
  archiveFilter,
  archiveForm,
  archivedInvoices,
  clientForm,
  clients,
  editingClientId,
  editingInvoiceId,
  invoiceForm,
  invoices,
  lineItems,
  showSettledInvoices,
  transactions
}: {
  archiveDetail: any | null;
  archiveFilter: string;
  archiveForm: any;
  archivedInvoices: any[];
  clientForm: any;
  clients: any[];
  editingClientId: number | null;
  editingInvoiceId: number | null;
  invoiceForm: any;
  invoices: any[];
  lineItems: Array<{ description: string; quantity: string; unit_price: string }>;
  showSettledInvoices: boolean;
  transactions: any[];
}) {
  const today = todayDate();
  const visibleClients = clients.filter((client) => String(client.name || "").trim());
  const activeClients = visibleClients.filter((client) => client.is_active !== 0);
  const archivedClients = visibleClients.filter((client) => client.is_active === 0);
  const openInvoices = invoices.filter((invoice) => !isClosedReceivableStatus(invoice.status));
  const settledInvoices = invoices.filter((invoice) => isClosedReceivableStatus(invoice.status));
  const displayedInvoices = showSettledInvoices ? invoices : openInvoices;
  const outstandingTotal = openInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due ?? invoice.total ?? 0), 0);
  const archivedInvoiceTotal = archivedInvoices.reduce((sum, invoice) => sum + (invoice.total || 0), 0);
  const outstandingCurrencies = Array.from(new Set(openInvoices.map((invoice) => invoice.currency).filter(Boolean)));
  const archiveCurrencies = Array.from(
    new Set(archivedInvoices.map((invoice) => invoice.currency).filter(Boolean))
  );
  const businessSnapshotCurrency =
    (outstandingCurrencies.length === 1 ? outstandingCurrencies[0] : null) ||
    (archiveCurrencies.length === 1 ? archiveCurrencies[0] : null) ||
    invoices.find((invoice) => invoice.currency)?.currency ||
    archivedInvoices.find((invoice) => invoice.currency)?.currency ||
    "USD";
  const clientCurrentCounts = invoices.reduce((counts: Record<number, number>, invoice) => {
    counts[invoice.client_id] = (counts[invoice.client_id] || 0) + 1;
    return counts;
  }, {});
  const clientArchivedCounts = archivedInvoices.reduce((counts: Record<number, number>, invoice) => {
    counts[invoice.client_id] = (counts[invoice.client_id] || 0) + 1;
    return counts;
  }, {});
  const canDeleteClientRecord = (clientId: number) =>
    (clientCurrentCounts[clientId] || 0) === 0 && (clientArchivedCounts[clientId] || 0) === 0;
  const draftInvoiceSubtotal = lineItems.reduce((sum, item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return sum;
    return sum + quantity * unitPrice;
  }, 0);
  const draftAgreedTotalInput = invoiceForm.agreed_total.trim();
  const draftAgreedTotal = draftAgreedTotalInput ? Number(draftAgreedTotalInput) : null;
  const hasDraftAgreedTotal = draftAgreedTotalInput.length > 0 && Number.isFinite(draftAgreedTotal);
  const draftInvoiceTotal = hasDraftAgreedTotal && draftAgreedTotal !== null ? draftAgreedTotal : draftInvoiceSubtotal;
  const draftInvoiceAdjustment = draftInvoiceTotal - draftInvoiceSubtotal;
  const selectedInvoiceClient = activeClients.find((client) => client.id === Number(invoiceForm.client_id)) || null;
  const editingInvoiceRecord = editingInvoiceId ? invoices.find((invoice) => invoice.id === editingInvoiceId) || null : null;
  const draftPreviewItems = lineItems
    .map((item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      const description = String(item.description || "").trim();
      const hasNumber = Number.isFinite(quantity) || Number.isFinite(unitPrice);
      if (!description && !hasNumber) {
        return null;
      }
      return {
        description: description || "Line item description",
        quantity: Number.isFinite(quantity) ? quantity : null,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
        amount: Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0,
      };
    })
    .filter((item): item is InvoicePreviewLineItem => Boolean(item));
  const draftPreviewNumber = invoiceForm.number.trim() || (editingInvoiceId ? `Invoice ${editingInvoiceId}` : "Invoice draft");
  const invoiceStats = {
    archived: archivedInvoices.length,
    overdue: invoices.filter(
      (invoice) =>
        invoice.status !== "paid" && invoice.due_date && String(invoice.due_date).slice(0, 10) < today
    ).length
  };
  const clientToolSummary = editingClientId
    ? `Editing ${clientForm.name.trim() || `client #${editingClientId}`}`
    : `${formatCount(activeClients.length)} active clients · contact details only when needed`;
  const invoiceToolSummary = editingInvoiceId
    ? `${draftPreviewNumber} · ${formatCurrency(draftInvoiceTotal, invoiceForm.currency || "USD")} due`
    : `${selectedInvoiceClient?.name || "No client selected"} · ${formatCurrency(
        draftInvoiceTotal,
        invoiceForm.currency || "USD"
      )} draft total`;
  const archiveIntakeSummary = archiveForm.file
    ? `${archiveForm.file.name} · ${archiveForm.client_id ? "existing client linked" : archiveForm.client_name.trim() || "new client if needed"}`
    : `${formatCount(invoiceStats.archived)} historical PDFs already stored`;
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const incomingTransactions = transactions
    .filter((txn) => Number(txn.amount) > 0)
    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")) || right.id - left.id);
  const openHistoricalInvoices = archivedInvoices.filter(
    (archive) => !isClosedReceivableStatus(archive.status) && Number(archive.balance_due ?? archive.total) > 0.005
  );
  const historicalOutstandingTotal = openHistoricalInvoices.reduce(
    (sum, archive) => sum + Number(archive.balance_due ?? archive.total ?? 0),
    0
  );
  const historicalCurrencies = Array.from(
    new Set(openHistoricalInvoices.map((invoice) => invoice.currency).filter(Boolean))
  );
  const clientLiveBalance = invoices.reduce((balances: Record<number, number>, invoice) => {
    if (isClosedReceivableStatus(invoice.status)) return balances;
    balances[invoice.client_id] =
      (balances[invoice.client_id] || 0) + Number(invoice.balance_due ?? invoice.total ?? 0);
    return balances;
  }, {});
  const clientHistoricalBalance = archivedInvoices.reduce((balances: Record<number, number>, archive) => {
    balances[archive.client_id] = (balances[archive.client_id] || 0) + Number(archive.balance_due ?? archive.total ?? 0);
    return balances;
  }, {});
  const filteredArchivedInvoices = archivedInvoices.filter((archive) => {
    const client = clientById.get(archive.client_id);
    const haystack = [
      archive.number,
      archive.file_name,
      archive.status,
      archive.notes,
      client?.name
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(archiveFilter.trim().toLowerCase());
  });
  const filteredArchivedOutstanding = filteredArchivedInvoices.reduce(
    (sum, archive) => sum + Number(archive.balance_due ?? archive.total ?? 0),
    0
  );
  const archiveDetailStatusLabel = archiveDetail?.invoice?.is_overdue
    ? "overdue"
    : (archiveDetail?.invoice?.status || "archived");

  return {
    activeClients,
    archiveCurrencies,
    archiveDetailStatusLabel,
    archiveIntakeSummary,
    archivedClients,
    archivedInvoiceTotal,
    businessSnapshotCurrency,
    canDeleteClientRecord,
    clientArchivedCounts,
    clientById,
    clientCurrentCounts,
    clientHistoricalBalance,
    clientLiveBalance,
    clientToolSummary,
    displayedInvoices,
    draftAgreedTotal,
    draftAgreedTotalInput,
    draftInvoiceAdjustment,
    draftInvoiceSubtotal,
    draftInvoiceTotal,
    draftPreviewItems,
    draftPreviewNumber,
    editingInvoiceRecord,
    filteredArchivedInvoices,
    filteredArchivedOutstanding,
    historicalCurrencies,
    historicalOutstandingTotal,
    incomingTransactions,
    invoiceStats,
    invoiceToolSummary,
    openInvoices,
    outstandingCurrencies,
    outstandingTotal,
    selectedInvoiceClient,
    settledInvoices,
    visibleClients
  };
}

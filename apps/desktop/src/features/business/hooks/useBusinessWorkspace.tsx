import { Fragment, useEffect, useRef, useState } from "react";
import { getFeatureData, sendFeatureForm, featureUrl } from "../api";
import {
  BoxTitle,
  CollapsibleSection,
  EMPTY_INVOICE_PREVIEW_PROFILE,
  InvoiceSheetPreview,
  RowDisclosureButton,
  SectionHeader,
  formatAmount,
  formatCount,
  formatCurrency,
  formatSignedCurrency,
  formatTimestampLabel,
  toDateValue,
  todayDate,
} from "../../../shared/financeUi";
import type { InvoicePreviewProfile } from "../../../shared/financeUi";
import { buildBusinessWorkspaceModel } from "./businessWorkspaceModel";
import { useBusinessArchiveDetail } from "./useBusinessArchiveDetail";
import { useBusinessClientCommands } from "./useBusinessClientCommands";
import { useBusinessInvoiceCommands } from "./useBusinessInvoiceCommands";
import { useInvoicePdfTools } from "./useInvoicePdfTools";

export type BusinessWorkspaceProps = {
  companyLogoSrc: string;
  usingCustomLogo: boolean;
};

export function useBusinessWorkspace({
  companyLogoSrc,
  usingCustomLogo
}: BusinessWorkspaceProps) {
  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [archivedInvoices, setArchivedInvoices] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<number, string>>({});
  const [invoiceRecipientEmails, setInvoiceRecipientEmails] = useState<Record<number, string>>({});
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceNotice, setInvoiceNotice] = useState<string | null>(null);
  const [invoiceSendError, setInvoiceSendError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientNotice, setClientNotice] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveNotice, setArchiveNotice] = useState<string | null>(null);
  const [showArchivedClients, setShowArchivedClients] = useState(false);
  const [showSettledInvoices, setShowSettledInvoices] = useState(false);
  const [archivePickerKey, setArchivePickerKey] = useState(0);
  const [selectedArchiveId, setSelectedArchiveId] = useState<number | null>(null);
  const [archiveFilter, setArchiveFilter] = useState("");
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | null>(null);
  const [clientToolOpenToken, setClientToolOpenToken] = useState(0);
  const [invoiceToolOpenToken, setInvoiceToolOpenToken] = useState(0);
  const [archiveIntakeOpenToken, setArchiveIntakeOpenToken] = useState(0);
  const [companyProfile, setCompanyProfile] = useState<InvoicePreviewProfile>(EMPTY_INVOICE_PREVIEW_PROFILE);
  const clientEditorRef = useRef<HTMLDivElement | null>(null);
  const invoiceEditorRef = useRef<HTMLDivElement | null>(null);
  const archiveIntakeRef = useRef<HTMLDivElement | null>(null);
  const [clientForm, setClientForm] = useState({ name: "", email: "", phone: "", address: "", notes: "" });
  const [invoiceForm, setInvoiceForm] = useState({
    client_id: "",
    number: "",
    issue_date: todayDate(),
    due_date: "",
    currency: "USD",
    notes: "",
    status: "draft",
    agreed_total: ""
  });
  const [archiveForm, setArchiveForm] = useState({
    client_id: "",
    client_name: "",
    number: "",
    issue_date: "",
    due_date: "",
    currency: "USD",
    total: "",
    status: "archived",
    notes: "",
    file: null as File | null
  });
  const [lineItems, setLineItems] = useState([{ description: "", quantity: "1", unit_price: "0" }]);
  const {
    closeInvoicePreview,
    downloadInvoicePdf,
    invoicePreview,
    invoicePreviewBusy,
    openInvoicePreview
  } = useInvoicePdfTools({ setInvoiceError, setInvoiceNotice });
  const {
    applyArchivePayment,
    archiveDetail,
    archiveDetailLoading,
    archiveEditForm,
    archivePaymentAmounts,
    deleteArchive,
    removeArchivePayment,
    saveArchiveDetail,
    setArchiveEditForm,
    setArchivePaymentAmounts,
    syncArchiveDetail
  } = useBusinessArchiveDetail({
    archivedInvoices,
    refresh,
    selectedArchiveId,
    setArchiveError,
    setArchiveNotice,
    setSelectedArchiveId
  });

  const businessModel = buildBusinessWorkspaceModel({
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
  });
  const {
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
  } = businessModel;
  const {
    deleteClient,
    openClientCreator,
    resetClientForm,
    restoreClient,
    saveClient,
    startEditClient
  } = useBusinessClientCommands({
    clientForm,
    editingClientId,
    refresh,
    setClientError,
    setClientForm,
    setClientNotice,
    setClientToolOpenToken,
    setEditingClientId,
    setExpandedClientId
  });
  const {
    addLineItem,
    applyPayment,
    deleteInvoice,
    openInvoiceComposer,
    removeLineItem,
    resetInvoiceForm,
    saveInvoice,
    selectInvoiceClient,
    sendInvoice,
    setInvoiceIssueDate,
    setInvoiceNumber,
    startEditInvoice,
    updateInvoiceStatus,
    updateLineItem
  } = useBusinessInvoiceCommands({
    clients,
    draftAgreedTotal,
    draftAgreedTotalInput,
    editingInvoiceId,
    invoiceForm,
    invoiceRecipientEmails,
    lineItems,
    refresh,
    setEditingInvoiceId,
    setInvoiceError,
    setInvoiceForm,
    setInvoiceNotice,
    setInvoiceSendError,
    setInvoiceToolOpenToken,
    setLineItems
  });

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    getFeatureData<any>("/settings")
      .then((data) =>
        setCompanyProfile({
          company_name: data.company_name || "",
          company_legal_name: data.company_legal_name || "",
          company_dba: data.company_dba || "",
          company_entity_type: data.company_entity_type || "",
          company_tax_id: data.company_tax_id || "",
          company_email: data.company_email || "",
          company_phone: data.company_phone || "",
          company_address: data.company_address || "",
          company_city_state: data.company_city_state || "",
        })
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!editingClientId || !clientEditorRef.current) return;
    clientEditorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editingClientId]);

  useEffect(() => {
    if (!editingInvoiceId || !invoiceEditorRef.current) return;
    invoiceEditorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editingInvoiceId]);

  useEffect(() => {
    if (!clientToolOpenToken || !clientEditorRef.current) return;
    clientEditorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [clientToolOpenToken]);

  useEffect(() => {
    if (!invoiceToolOpenToken || !invoiceEditorRef.current) return;
    invoiceEditorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [invoiceToolOpenToken]);

  useEffect(() => {
    if (!archiveIntakeOpenToken || !archiveIntakeRef.current) return;
    archiveIntakeRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [archiveIntakeOpenToken]);

  function refresh(preferredArchiveId?: number | null) {
    return Promise.all([
      getFeatureData<any[]>("/business/clients").catch(() => []),
      getFeatureData<any[]>("/business/invoices").catch(() => []),
      getFeatureData<any[]>("/business/invoice-archives").catch(() => []),
      getFeatureData<any[]>("/transactions/details").catch(() => [])
    ]).then(([clientsData, invoicesData, archivedData, transactionsData]) => {
      setClients(clientsData);
      setInvoices(invoicesData);
      setArchivedInvoices(archivedData);
      setTransactions(transactionsData);
      if (preferredArchiveId && archivedData.some((archive) => archive.id === preferredArchiveId)) {
        setSelectedArchiveId(preferredArchiveId);
      }
    });
  }

  const resetArchiveForm = () => {
    setArchiveForm({
      client_id: "",
      client_name: "",
      number: "",
      issue_date: "",
      due_date: "",
      currency: "USD",
      total: "",
      status: "archived",
      notes: "",
      file: null
    });
    setArchivePickerKey((prev) => prev + 1);
  };

  const openArchiveIntake = (clientId?: number) => {
    setArchiveError(null);
    setArchiveNotice(null);
    setArchiveForm({
      client_id: clientId ? String(clientId) : "",
      client_name: "",
      number: "",
      issue_date: "",
      due_date: "",
      currency: "USD",
      total: "",
      status: "archived",
      notes: "",
      file: null
    });
    setArchivePickerKey((prev) => prev + 1);
    setArchiveIntakeOpenToken((prev) => prev + 1);
  };

  const uploadArchive = async () => {
    setArchiveError(null);
    setArchiveNotice(null);
    if (!archiveForm.file) {
      setArchiveError("Choose the historical invoice PDF to upload.");
      return;
    }
    const totalValue = archiveForm.total.trim();
    if (totalValue && !Number.isFinite(Number(totalValue))) {
      setArchiveError("Archive total must be a valid number.");
      return;
    }
    const formData = new FormData();
    formData.append("file", archiveForm.file);
    if (archiveForm.client_id) formData.append("client_id", archiveForm.client_id);
    if (archiveForm.client_name.trim()) formData.append("client_name", archiveForm.client_name.trim());
    if (archiveForm.number.trim()) formData.append("number", archiveForm.number.trim());
    if (archiveForm.issue_date) formData.append("issue_date", archiveForm.issue_date);
    if (archiveForm.due_date) formData.append("due_date", archiveForm.due_date);
    if (archiveForm.currency.trim()) formData.append("currency", archiveForm.currency.trim().toUpperCase());
    if (totalValue) formData.append("total", totalValue);
    if (archiveForm.status) formData.append("status", archiveForm.status);
    if (archiveForm.notes.trim()) formData.append("notes", archiveForm.notes.trim());
    try {
      const record = await sendFeatureForm<any>("/business/invoice-archives/upload", formData);
      const linkedClient =
        activeClients.find((client) => client.id === record.client_id) ||
        archivedClients.find((client) => client.id === record.client_id);
      setArchiveNotice(`Archived ${record.file_name} for ${linkedClient?.name || "client"}.`);
      resetArchiveForm();
      refresh(record.id);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Unable to upload archived invoice.");
    }
  };

  const toggleClientDetails = (clientId: number) => {
    setExpandedClientId((current) => (current === clientId ? null : clientId));
  };
  const toggleInvoiceDetails = (invoiceId: number) => {
    setExpandedInvoiceId((current) => (current === invoiceId ? null : invoiceId));
  };

  const viewModel = {
    Fragment,
    featureUrl,
    BoxTitle,
    CollapsibleSection,
    InvoiceSheetPreview,
    RowDisclosureButton,
    SectionHeader,
    formatAmount,
    formatCount,
    formatCurrency,
    formatSignedCurrency,
    formatTimestampLabel,
    toDateValue,
    companyLogoSrc,
    usingCustomLogo,
    clients,
    invoices,
    editingClientId,
    editingInvoiceId,
    paymentAmounts,
    setPaymentAmounts,
    invoiceRecipientEmails,
    setInvoiceRecipientEmails,
    archivePaymentAmounts,
    setArchivePaymentAmounts,
    invoiceError,
    invoiceNotice,
    invoiceSendError,
    clientError,
    clientNotice,
    archiveError,
    archiveNotice,
    showArchivedClients,
    setShowArchivedClients,
    showSettledInvoices,
    setShowSettledInvoices,
    archivePickerKey,
    selectedArchiveId,
    setSelectedArchiveId,
    archiveDetail,
    archiveDetailLoading,
    archiveFilter,
    setArchiveFilter,
    expandedClientId,
    expandedInvoiceId,
    clientToolOpenToken,
    invoiceToolOpenToken,
    archiveIntakeOpenToken,
    invoicePreviewBusy,
    invoicePreview,
    companyProfile,
    clientEditorRef,
    invoiceEditorRef,
    archiveIntakeRef,
    clientForm,
    setClientForm,
    invoiceForm,
    setInvoiceForm,
    archiveForm,
    setArchiveForm,
    lineItems,
    visibleClients,
    activeClients,
    archivedClients,
    openInvoices,
    settledInvoices,
    displayedInvoices,
    outstandingTotal,
    archivedInvoiceTotal,
    outstandingCurrencies,
    archiveCurrencies,
    businessSnapshotCurrency,
    clientCurrentCounts,
    clientArchivedCounts,
    canDeleteClientRecord,
    draftInvoiceSubtotal,
    draftInvoiceTotal,
    draftInvoiceAdjustment,
    selectedInvoiceClient,
    editingInvoiceRecord,
    draftPreviewItems,
    draftPreviewNumber,
    invoiceStats,
    clientToolSummary,
    invoiceToolSummary,
    archiveIntakeSummary,
    resetClientForm,
    resetInvoiceForm,
    resetArchiveForm,
    openClientCreator,
    openInvoiceComposer,
    openArchiveIntake,
    syncArchiveDetail,
    archiveEditForm,
    setArchiveEditForm,
    saveClient,
    startEditClient,
    deleteClient,
    restoreClient,
    addLineItem,
    updateLineItem,
    removeLineItem,
    saveInvoice,
    selectInvoiceClient,
    setInvoiceIssueDate,
    setInvoiceNumber,
    uploadArchive,
    applyPayment,
    downloadInvoicePdf,
    closeInvoicePreview,
    openInvoicePreview,
    saveArchiveDetail,
    removeArchivePayment,
    applyArchivePayment,
    startEditInvoice,
    deleteInvoice,
    deleteArchive,
    updateInvoiceStatus,
    sendInvoice,
    clientById,
    incomingTransactions,
    historicalOutstandingTotal,
    historicalCurrencies,
    clientLiveBalance,
    clientHistoricalBalance,
    filteredArchivedInvoices,
    filteredArchivedOutstanding,
    archiveDetailStatusLabel,
    toggleClientDetails,
    toggleInvoiceDetails
  };

  return viewModel;
}

import React, { Fragment, useEffect, useRef, useState } from "react";
import { removeFeatureRecord, getFeatureData, getFeatureBlob, sendFeatureCommand, sendFeatureForm, featureUrl, saveFeatureBlob } from "../api";
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
} from "../../../shared/financeUi";
import type { InvoicePreviewProfile, LlmSettings } from "../../../shared/financeUi";
import { BusinessView } from "./BusinessView";

export function Business({
  companyLogoSrc,
  usingCustomLogo
}: {
  companyLogoSrc: string;
  usingCustomLogo: boolean;
}) {
  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [archivedInvoices, setArchivedInvoices] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<number, string>>({});
  const [invoiceRecipientEmails, setInvoiceRecipientEmails] = useState<Record<number, string>>({});
  const [archivePaymentAmounts, setArchivePaymentAmounts] = useState<Record<number, string>>({});
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
  const [archiveDetail, setArchiveDetail] = useState<any | null>(null);
  const [archiveDetailLoading, setArchiveDetailLoading] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState("");
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | null>(null);
  const [clientToolOpenToken, setClientToolOpenToken] = useState(0);
  const [invoiceToolOpenToken, setInvoiceToolOpenToken] = useState(0);
  const [archiveIntakeOpenToken, setArchiveIntakeOpenToken] = useState(0);
  const [invoicePreviewBusy, setInvoicePreviewBusy] = useState(false);
  const [invoicePreview, setInvoicePreview] = useState<{ url: string; name: string; title: string } | null>(null);
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
    return () => {
      if (invoicePreview?.url) {
        URL.revokeObjectURL(invoicePreview.url);
      }
    };
  }, [invoicePreview]);

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

  const refresh = (preferredArchiveId?: number | null) => {
    Promise.all([
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
  };

  const resetClientForm = () => {
    setEditingClientId(null);
    setClientForm({ name: "", email: "", phone: "", address: "", notes: "" });
  };

  const resetInvoiceForm = () => {
    setEditingInvoiceId(null);
    setInvoiceForm({
      client_id: "",
      number: "",
      issue_date: todayDate(),
      due_date: "",
      currency: "USD",
      notes: "",
      status: "draft",
      agreed_total: ""
    });
    setLineItems([{ description: "", quantity: "1", unit_price: "0" }]);
  };

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

  const openClientCreator = () => {
    setClientError(null);
    setClientNotice(null);
    resetClientForm();
    setClientToolOpenToken((prev) => prev + 1);
  };

  const openInvoiceComposer = (clientId?: number) => {
    setInvoiceError(null);
    setInvoiceNotice(null);
    setInvoiceSendError(null);
    setEditingInvoiceId(null);
    setInvoiceForm({
      client_id: clientId ? String(clientId) : "",
      number: "",
      issue_date: todayDate(),
      due_date: "",
      currency: "USD",
      notes: "",
      status: "draft",
      agreed_total: ""
    });
    setLineItems([{ description: "", quantity: "1", unit_price: "0" }]);
    setInvoiceToolOpenToken((prev) => prev + 1);
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

  const syncArchiveDetail = (detail: any) => {
    setArchiveDetail(detail);
    const invoice = detail?.invoice || {};
    const defaults: Record<number, string> = {};
    (detail?.candidate_transactions || []).forEach((candidate: any) => {
      const suggested = Math.max(
        0,
        Math.min(Number(detail?.balance_due || 0), Number(candidate?.available_amount || 0))
      );
      defaults[candidate.id] = suggested > 0 ? String(suggested) : "";
    });
    setArchivePaymentAmounts(defaults);
    return {
      client_id: String(invoice.client_id || ""),
      number: invoice.number || "",
      issue_date: toDateValue(invoice.issue_date),
      due_date: toDateValue(invoice.due_date),
      currency: invoice.currency || "USD",
      total: String(invoice.total ?? ""),
      status: invoice.status || "archived",
      notes: invoice.notes || ""
    };
  };

  const [archiveEditForm, setArchiveEditForm] = useState({
    client_id: "",
    number: "",
    issue_date: "",
    due_date: "",
    currency: "USD",
    total: "",
    status: "archived",
    notes: ""
  });

  useEffect(() => {
    if (!archivedInvoices.length) {
      setSelectedArchiveId(null);
      setArchiveDetail(null);
      return;
    }
    if (!selectedArchiveId || !archivedInvoices.some((archive) => archive.id === selectedArchiveId)) {
      setSelectedArchiveId(archivedInvoices[0].id);
    }
  }, [archivedInvoices, selectedArchiveId]);

  useEffect(() => {
    if (!selectedArchiveId) {
      setArchiveDetail(null);
      return;
    }
    setArchiveDetailLoading(true);
    setArchiveError(null);
    getFeatureData<any>(`/business/invoice-archives/${selectedArchiveId}`)
      .then((detail) => {
        setArchiveEditForm(syncArchiveDetail(detail));
      })
      .catch((err) => {
        setArchiveError(err instanceof Error ? err.message : "Unable to load historical invoice.");
      })
      .finally(() => setArchiveDetailLoading(false));
  }, [selectedArchiveId]);

  const saveClient = async () => {
    setClientError(null);
    setClientNotice(null);
    const name = clientForm.name.trim();
    if (!name) {
      setClientError("Client name is required.");
      return;
    }
    if (editingClientId) {
      try {
        await sendFeatureCommand(`/business/clients/${editingClientId}`, { ...clientForm, name, is_active: true });
      } catch (err) {
        setClientError(err instanceof Error ? err.message : "Unable to save client.");
        return;
      }
    } else {
      try {
        await sendFeatureCommand("/business/clients", { ...clientForm, name });
      } catch (err) {
        setClientError(err instanceof Error ? err.message : "Unable to add client.");
        return;
      }
    }
    resetClientForm();
    refresh();
  };

  const startEditClient = (client: any) => {
    setClientError(null);
    setClientNotice(null);
    setEditingClientId(client.id);
    setClientForm({
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      notes: client.notes || ""
    });
  };

  const deleteClient = async (clientId: number) => {
    setClientError(null);
    setClientNotice(null);
    try {
      const result = await removeFeatureRecord<{ status: string }>(`/business/clients/${clientId}`);
      if (editingClientId === clientId) {
        resetClientForm();
      }
      setExpandedClientId((current) => (current === clientId ? null : current));
      setClientNotice(
        result.status === "deleted"
          ? "Client deleted."
          : "Client archived because it still has linked invoices, history, or projects."
      );
      refresh();
    } catch (err) {
      setClientError(err instanceof Error ? err.message : "Unable to delete client.");
    }
  };

  const restoreClient = async (client: any) => {
    setClientError(null);
    setClientNotice(null);
    try {
      await sendFeatureCommand(`/business/clients/${client.id}`, {
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        notes: client.notes,
        is_active: true
      });
      setClientNotice("Client restored.");
      refresh();
    } catch (err) {
      setClientError(err instanceof Error ? err.message : "Unable to restore client.");
    }
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", quantity: "1", unit_price: "0" }]);
  };

  const updateLineItem = (index: number, field: string, value: string) => {
    const next = [...lineItems];
    next[index] = { ...next[index], [field]: value };
    setLineItems(next);
  };

  const removeLineItem = (index: number) => {
    const next = lineItems.filter((_, idx) => idx !== index);
    setLineItems(next.length ? next : [{ description: "", quantity: "1", unit_price: "0" }]);
  };

  const saveInvoice = async () => {
    setInvoiceError(null);
    setInvoiceNotice(null);
    setInvoiceSendError(null);
    if (!invoiceForm.client_id) {
      setInvoiceError("Select a client before saving.");
      return;
    }
    const issueDate = invoiceForm.issue_date || todayDate();
    setInvoiceForm((prev) => ({ ...prev, issue_date: issueDate }));
    const cleanedItems: { description: string; quantity: number; unit_price: number }[] = [];
    for (const [index, item] of lineItems.entries()) {
      const description = item.description.trim();
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      const rowIndex = index + 1;
      const isEmptyRow = !description && !quantity && !unitPrice;
      if (isEmptyRow) {
        continue;
      }
      if (!description) {
        setInvoiceError(`Line item ${rowIndex} needs a description.`);
        return;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setInvoiceError(`Line item ${rowIndex} needs a quantity greater than 0.`);
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        setInvoiceError(`Line item ${rowIndex} needs a non-negative unit price.`);
        return;
      }
      cleanedItems.push({ description, quantity, unit_price: unitPrice });
    }
    if (!cleanedItems.length) {
      setInvoiceError("Add at least one line item.");
      return;
    }
    const payload = {
      client_id: Number(invoiceForm.client_id),
      number: invoiceForm.number,
      status: invoiceForm.status || "draft",
      issue_date: issueDate,
      due_date: invoiceForm.due_date || undefined,
      currency: invoiceForm.currency,
      notes: invoiceForm.notes || undefined,
      agreed_total: draftAgreedTotalInput ? Number(invoiceForm.agreed_total) : undefined,
      line_items: cleanedItems
    };
    if (draftAgreedTotalInput && (!Number.isFinite(draftAgreedTotal) || Number(draftAgreedTotal) < 0)) {
      setInvoiceError("Agreed total must be zero or greater.");
      return;
    }
    try {
      if (editingInvoiceId) {
        await sendFeatureCommand(`/business/invoices/${editingInvoiceId}`, payload);
      } else {
        await sendFeatureCommand("/business/invoices", payload);
      }
      resetInvoiceForm();
      refresh();
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to save invoice.");
    }
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

  const applyPayment = async (invoiceId: number, transactionId: number, amount: number) => {
    if (!Number.isFinite(transactionId) || transactionId <= 0) return;
    if (!Number.isFinite(amount) || amount <= 0) {
      setInvoiceError("Payment amount must be greater than 0.");
      return;
    }
    setInvoiceError(null);
    try {
      await sendFeatureCommand(`/business/invoices/${invoiceId}/apply-payment`, {
        transaction_id: transactionId,
        amount
      });
      refresh();
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to apply invoice payment.");
    }
  };

  const downloadInvoicePdf = async (invoice: any) => {
    setInvoiceError(null);
    setInvoiceNotice(null);
    try {
      const blob = await getFeatureBlob(`/business/invoices/${invoice.id}/pdf?ts=${Date.now()}`);
      const fallbackName = `Invoice-${invoice.number || invoice.id}.pdf`;
      saveFeatureBlob(blob, fallbackName);
      setInvoiceNotice(`Downloaded ${fallbackName}.`);
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to download invoice PDF.");
    }
  };

  const closeInvoicePreview = () => {
    if (invoicePreview?.url) {
      URL.revokeObjectURL(invoicePreview.url);
    }
    setInvoicePreview(null);
  };

  const openInvoicePreview = async (invoice: any) => {
    setInvoiceError(null);
    setInvoiceNotice(null);
    setInvoicePreviewBusy(true);
    try {
      const blob = await getFeatureBlob(`/business/invoices/${invoice.id}/pdf?ts=${Date.now()}`);
      const fallbackName = `Invoice-${invoice.number || invoice.id}.pdf`;
      const url = URL.createObjectURL(blob);
      setInvoicePreview((current) => {
        if (current?.url) {
          URL.revokeObjectURL(current.url);
        }
        return {
          url,
          name: fallbackName,
          title: invoice.number || `Invoice ${invoice.id}`,
        };
      });
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to preview invoice PDF.");
    } finally {
      setInvoicePreviewBusy(false);
    }
  };

  const saveArchiveDetail = async () => {
    if (!selectedArchiveId) return;
    setArchiveError(null);
    setArchiveNotice(null);
    if (!archiveEditForm.client_id) {
      setArchiveError("Select a client for the historical invoice.");
      return;
    }
    const totalValue = Number(archiveEditForm.total);
    if (!Number.isFinite(totalValue) || totalValue < 0) {
      setArchiveError("Historical invoice total must be a valid non-negative number.");
      return;
    }
    try {
      const detail = await sendFeatureCommand<any>(`/business/invoice-archives/${selectedArchiveId}`, {
        client_id: Number(archiveEditForm.client_id),
        number: archiveEditForm.number || undefined,
        issue_date: archiveEditForm.issue_date || undefined,
        due_date: archiveEditForm.due_date || undefined,
        currency: archiveEditForm.currency,
        total: totalValue,
        status: archiveEditForm.status,
        notes: archiveEditForm.notes || undefined
      });
      setArchiveEditForm(syncArchiveDetail(detail));
      setArchiveNotice("Historical invoice updated.");
      refresh();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Unable to update historical invoice.");
    }
  };

  const removeArchivePayment = async (paymentLinkId: number) => {
    if (!selectedArchiveId) return;
    setArchiveError(null);
    setArchiveNotice(null);
    try {
      await removeFeatureRecord(`/business/invoice-archives/${selectedArchiveId}/payments/${paymentLinkId}`);
      const detail = await getFeatureData<any>(`/business/invoice-archives/${selectedArchiveId}`);
      setArchiveEditForm(syncArchiveDetail(detail));
      setArchiveNotice("Receipt link removed.");
      refresh();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Unable to remove receipt link.");
    }
  };

  const applyArchivePayment = async (transactionId: number) => {
    if (!selectedArchiveId || !archiveDetail) return;
    const amountValue = Number(archivePaymentAmounts[transactionId]);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setArchiveError("Receipt amount must be greater than 0.");
      return;
    }
    setArchiveError(null);
    setArchiveNotice(null);
    try {
      await sendFeatureCommand(`/business/invoice-archives/${selectedArchiveId}/apply-payment`, {
        transaction_id: transactionId,
        amount: amountValue
      });
      const detail = await getFeatureData<any>(`/business/invoice-archives/${selectedArchiveId}`);
      setArchiveEditForm(syncArchiveDetail(detail));
      setArchiveNotice("Receipt linked to historical invoice.");
      refresh();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Unable to link receipt.");
    }
  };

  const startEditInvoice = async (invoiceId: number) => {
    try {
      const detail = await getFeatureData<any>(`/business/invoices/${invoiceId}`);
      const invoice = detail?.invoice || {};
      const rawLineItems = Array.isArray(detail?.line_items) ? detail.line_items : [];
      const hydratedLineItems = rawLineItems
        .map((item: any) => ({
          description: String(item?.description || ""),
          quantity: String(item?.quantity ?? ""),
          unit_price: String(item?.unit_price ?? "")
        }))
        .filter((item: { description: string; quantity: string; unit_price: string }) =>
          item.description || item.quantity || item.unit_price
        );
      setInvoiceError(null);
      setEditingInvoiceId(invoiceId);
      setInvoiceForm({
        client_id: String(invoice.client_id || ""),
        number: String(invoice.number || ""),
        issue_date: String(invoice.issue_date || todayDate()),
        due_date: String(invoice.due_date || ""),
        currency: String(invoice.currency || "USD"),
        notes: String(invoice.notes || ""),
        status: String(invoice.status || "draft"),
        agreed_total:
          Math.abs(Number(invoice.total || 0) - Number(invoice.subtotal || 0)) > 0.005
            ? String(invoice.total ?? "")
            : ""
      });
      setLineItems(hydratedLineItems.length ? hydratedLineItems : [{ description: "", quantity: "1", unit_price: "0" }]);
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to load invoice.");
    }
  };

  const deleteInvoice = async (invoiceId: number) => {
    setInvoiceError(null);
    try {
      await removeFeatureRecord(`/business/invoices/${invoiceId}`);
      refresh();
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to delete invoice.");
    }
  };

  const deleteArchive = async (archiveId: number) => {
    setArchiveError(null);
    setArchiveNotice(null);
    try {
      await removeFeatureRecord(`/business/invoice-archives/${archiveId}`);
      if (selectedArchiveId === archiveId) {
        setSelectedArchiveId(null);
        setArchiveDetail(null);
      }
      refresh();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Unable to delete archived invoice.");
    }
  };

  const updateInvoiceStatus = async (invoiceId: number, status: string) => {
    setInvoiceError(null);
    try {
      await sendFeatureCommand(`/business/invoices/${invoiceId}/status?status=${encodeURIComponent(status)}`);
      refresh();
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : "Unable to update invoice status.");
    }
  };

  const sendInvoice = async (invoice: any) => {
    setInvoiceNotice(null);
    setInvoiceSendError(null);
    const client = clients.find((c) => c.id === invoice.client_id);
    const recipientEmail = String(invoiceRecipientEmails[invoice.id] ?? client?.email ?? "").trim();
    try {
      await sendFeatureCommand(`/business/invoices/${invoice.id}/send`, {
        recipient_email: recipientEmail || undefined
      });
      setInvoiceNotice(`Sent invoice to ${recipientEmail || client?.email || "recipient"}.`);
      refresh();
    } catch (err) {
      setInvoiceSendError(err instanceof Error ? err.message : "Unable to send invoice.");
    }
  };

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

  return <BusinessView model={viewModel} />;
}

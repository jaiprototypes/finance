import type { Dispatch, SetStateAction } from "react";
import { removeFeatureRecord, getFeatureData, sendFeatureCommand } from "../api";
import { todayDate } from "../../../shared/financeUi";

type InvoiceForm = {
  client_id: string;
  number: string;
  issue_date: string;
  due_date: string;
  currency: string;
  notes: string;
  status: string;
  agreed_total: string;
};

type InvoiceLineItem = {
  description: string;
  quantity: string;
  unit_price: string;
};

type BusinessInvoiceCommandsArgs = {
  clients: any[];
  draftAgreedTotal: number | null;
  draftAgreedTotalInput: boolean;
  editingInvoiceId: number | null;
  invoiceForm: InvoiceForm;
  invoiceRecipientEmails: Record<number, string>;
  lineItems: InvoiceLineItem[];
  refresh: () => void | Promise<unknown>;
  setEditingInvoiceId: Dispatch<SetStateAction<number | null>>;
  setInvoiceError: (message: string | null) => void;
  setInvoiceForm: Dispatch<SetStateAction<InvoiceForm>>;
  setInvoiceNotice: (message: string | null) => void;
  setInvoiceSendError: (message: string | null) => void;
  setInvoiceToolOpenToken: Dispatch<SetStateAction<number>>;
  setLineItems: Dispatch<SetStateAction<InvoiceLineItem[]>>;
};

const buildEmptyInvoiceForm = (clientId?: number): InvoiceForm => ({
  client_id: clientId ? String(clientId) : "",
  number: "",
  issue_date: todayDate(),
  due_date: "",
  currency: "USD",
  notes: "",
  status: "draft",
  agreed_total: ""
});

const buildEmptyLineItems = (): InvoiceLineItem[] => [
  { description: "", quantity: "1", unit_price: "0" }
];

export function useBusinessInvoiceCommands({
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
}: BusinessInvoiceCommandsArgs) {
  const resetInvoiceForm = () => {
    setEditingInvoiceId(null);
    setInvoiceForm(buildEmptyInvoiceForm());
    setLineItems(buildEmptyLineItems());
  };

  const openInvoiceComposer = (clientId?: number) => {
    setInvoiceError(null);
    setInvoiceNotice(null);
    setInvoiceSendError(null);
    setEditingInvoiceId(null);
    setInvoiceForm(buildEmptyInvoiceForm(clientId));
    setLineItems(buildEmptyLineItems());
    setInvoiceToolOpenToken((prev) => prev + 1);
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
    setLineItems(next.length ? next : buildEmptyLineItems());
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
        .filter((item: InvoiceLineItem) => item.description || item.quantity || item.unit_price);
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
      // API line items are numeric; the editor keeps string values so partial input remains editable.
      setLineItems(hydratedLineItems.length ? hydratedLineItems : buildEmptyLineItems());
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

  return {
    addLineItem,
    applyPayment,
    deleteInvoice,
    openInvoiceComposer,
    removeLineItem,
    resetInvoiceForm,
    saveInvoice,
    sendInvoice,
    startEditInvoice,
    updateInvoiceStatus,
    updateLineItem
  };
}

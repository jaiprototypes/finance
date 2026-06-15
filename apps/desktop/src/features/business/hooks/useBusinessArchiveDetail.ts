import { useEffect, useState } from "react";
import { removeFeatureRecord, getFeatureData, sendFeatureCommand } from "../api";
import { toDateValue } from "../../../shared/financeUi";

type BusinessArchiveDetailArgs = {
  archivedInvoices: any[];
  refresh: (preferredArchiveId?: number | null) => void;
  selectedArchiveId: number | null;
  setArchiveError: (message: string | null) => void;
  setArchiveNotice: (message: string | null) => void;
  setSelectedArchiveId: (archiveId: number | null) => void;
};

const buildEmptyArchiveEditForm = () => ({
  client_id: "",
  number: "",
  issue_date: "",
  due_date: "",
  currency: "USD",
  total: "",
  status: "archived",
  notes: ""
});

export function useBusinessArchiveDetail({
  archivedInvoices,
  refresh,
  selectedArchiveId,
  setArchiveError,
  setArchiveNotice,
  setSelectedArchiveId
}: BusinessArchiveDetailArgs) {
  const [archivePaymentAmounts, setArchivePaymentAmounts] = useState<Record<number, string>>({});
  const [archiveDetail, setArchiveDetail] = useState<any | null>(null);
  const [archiveDetailLoading, setArchiveDetailLoading] = useState(false);
  const [archiveEditForm, setArchiveEditForm] = useState(buildEmptyArchiveEditForm);

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

  useEffect(() => {
    if (!archivedInvoices.length) {
      setSelectedArchiveId(null);
      setArchiveDetail(null);
      return;
    }
    if (!selectedArchiveId || !archivedInvoices.some((archive) => archive.id === selectedArchiveId)) {
      setSelectedArchiveId(archivedInvoices[0].id);
    }
  }, [archivedInvoices, selectedArchiveId, setSelectedArchiveId]);

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

  return {
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
  };
}

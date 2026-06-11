import { useEffect, useState } from "react";
import { removeFeatureRecord, getFeatureData, sendFeatureCommand } from "../api";
import { formatCount } from "../../../shared/financeUi";

const buildEmptyMerchantForm = () => ({
  name: "",
  currency: "",
  default_category_id: "",
  default_classification: "Personal",
  notes: ""
});

export function useMerchantProfileSettings() {
  const [merchants, setMerchants] = useState<any[]>([]);
  const [merchantForm, setMerchantForm] = useState(buildEmptyMerchantForm);
  const [merchantEditingId, setMerchantEditingId] = useState<number | null>(null);
  const [merchantEditForm, setMerchantEditForm] = useState(buildEmptyMerchantForm);
  const [merchantApplyExisting, setMerchantApplyExisting] = useState(false);
  const [merchantStatus, setMerchantStatus] = useState<string | null>(null);
  const [merchantError, setMerchantError] = useState<string | null>(null);
  const [merchantPage, setMerchantPage] = useState(1);
  const [merchantPageSize, setMerchantPageSize] = useState(25);

  const refreshMerchants = () => {
    getFeatureData<any[]>("/classify/merchants").then(setMerchants).catch(() => undefined);
  };

  const resetMerchantForm = () => {
    setMerchantForm(buildEmptyMerchantForm());
  };

  const resetMerchantEdit = () => {
    setMerchantEditingId(null);
    setMerchantEditForm(buildEmptyMerchantForm());
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
      await sendFeatureCommand("/classify/merchants", payload);
      setMerchantStatus("Merchant profile created.");
      resetMerchantForm();
      refreshMerchants();
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
      const result = await sendFeatureCommand<any>(`/classify/merchants/${merchantEditingId}`, {
        ...payload,
        apply_to_transactions: merchantApplyExisting
      });
      if (Number(result?.updated || 0) > 0) {
        setMerchantStatus(`Updated ${formatCount(result.updated)} matching transactions.`);
      } else {
        setMerchantStatus("Merchant profile updated.");
      }
      resetMerchantEdit();
      refreshMerchants();
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
    await removeFeatureRecord(`/classify/merchants/${merchantId}`);
    if (merchantEditingId === merchantId) {
      resetMerchantEdit();
    }
    setMerchantStatus("Merchant profile deleted.");
    refreshMerchants();
  };

  useEffect(() => {
    refreshMerchants();
  }, []);

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

  return {
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
  };
}

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { getFeatureData, sendFeatureCommand } from "../api";
import { formatCount } from "../../../shared/financeUi";

type BudgetMatrixDrilldownArgs = {
  loadMatrix: (yearValue?: string) => Promise<any>;
  loadMatrixCategories: () => Promise<any[]>;
  matrixCategories: any[];
  matrixYear: string;
  setMatrixBaseCurrencyStatus: (message: string | null) => void;
  setMatrixBusy: (busy: boolean) => void;
  setMatrixError: (message: string | null) => void;
};

const panelSize = {
  width: 360,
  height: 420,
  gutter: 16
};

const clampPanelPosition = (event: MouseEvent) => {
  if (typeof window === "undefined") {
    return { left: event.clientX, top: event.clientY };
  }
  return {
    left: Math.max(
      panelSize.gutter,
      Math.min(event.clientX, window.innerWidth - panelSize.width - panelSize.gutter)
    ),
    top: Math.max(
      panelSize.gutter,
      Math.min(event.clientY, window.innerHeight - panelSize.height - panelSize.gutter)
    )
  };
};

export function useBudgetMatrixDrilldown({
  loadMatrix,
  loadMatrixCategories,
  matrixCategories,
  matrixYear,
  setMatrixBaseCurrencyStatus,
  setMatrixBusy,
  setMatrixError
}: BudgetMatrixDrilldownArgs) {
  const [matrixDrilldown, setMatrixDrilldown] = useState<any | null>(null);
  const [matrixDrilldownAssignments, setMatrixDrilldownAssignments] = useState<Record<string, string>>({});
  const [matrixDrilldownBusySplitId, setMatrixDrilldownBusySplitId] = useState<number | null>(null);

  useEffect(() => {
    setMatrixDrilldown(null);
  }, [matrixYear]);

  useEffect(() => {
    if (!matrixDrilldown) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMatrixDrilldown(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [matrixDrilldown]);

  const matrixSubcategoriesForBucket = (bucketName: string) =>
    ((matrixCategories || []).find((category: any) => category.name === bucketName)?.subcategories || []);

  const loadMatrixDrilldownData = async ({
    left,
    top,
    row,
    month,
    subcategory
  }: {
    left: number;
    top: number;
    row: any;
    month: string;
    subcategory?: any | null;
  }) => {
    const actual =
      row.type === "income" ? Number(row.income?.[month] || 0) : Number(row.expense?.[month] || 0);
    const nextSubcategory = subcategory || null;
    const rowName = nextSubcategory ? `${row.name} / ${nextSubcategory.name}` : row.name;
    setMatrixDrilldownAssignments({});
    setMatrixDrilldown({
      left,
      top,
      month,
      rowName,
      bucket_key: String(row.id),
      bucket_type: row.type,
      bucket_name: row.name,
      subcategory_name: nextSubcategory?.name || null,
      subcategory_id: nextSubcategory?.subcategory_id || null,
      unassigned: Boolean(nextSubcategory?.is_unassigned),
      actual_total: actual,
      transactions: [],
      loading: true,
      error: null
    });
    try {
      const query = new URLSearchParams({
        month,
        bucket: String(row.id)
      });
      if (nextSubcategory?.subcategory_id) {
        query.set("subcategory_id", String(nextSubcategory.subcategory_id));
      } else if (nextSubcategory?.is_unassigned) {
        query.set("unassigned", "true");
      }
      const data = await getFeatureData<any>(`/reports/budget-cell-transactions?${query.toString()}`);
      setMatrixDrilldown({
        ...data,
        left,
        top,
        rowName,
        bucket_key: String(row.id),
        bucket_type: row.type,
        subcategory_name: nextSubcategory?.name || null,
        subcategory_id: nextSubcategory?.subcategory_id || null,
        unassigned: Boolean(nextSubcategory?.is_unassigned),
        loading: false,
        error: null
      });
    } catch (err) {
      setMatrixDrilldown({
        left,
        top,
        month,
        rowName,
        bucket_key: String(row.id),
        bucket_type: row.type,
        bucket_name: row.name,
        subcategory_name: nextSubcategory?.name || null,
        subcategory_id: nextSubcategory?.subcategory_id || null,
        unassigned: Boolean(nextSubcategory?.is_unassigned),
        actual_total: actual,
        transactions: [],
        loading: false,
        error: err instanceof Error ? err.message : "Unable to load transactions."
      });
    }
  };

  const openMatrixDrilldown = async (
    event: MouseEvent,
    row: any,
    month: string,
    options?: { subcategory?: any }
  ) => {
    event.preventDefault();
    event.stopPropagation();
    await loadMatrixDrilldownData({
      ...clampPanelPosition(event),
      row,
      month,
      subcategory: options?.subcategory || null
    });
  };

  const applyMatrixDrilldownSubcategory = async (txn: any) => {
    const splitId = Number(txn.split_id || 0);
    const selectedValue = matrixDrilldownAssignments[String(splitId)] ?? (txn.subcategory_id ? String(txn.subcategory_id) : "");
    const subcategoryId = Number(selectedValue || 0);
    const rowCategory = matrixDrilldown
      ? (matrixCategories || []).find((category: any) => category.name === matrixDrilldown.bucket_name)
      : null;
    if (!splitId || !subcategoryId || !rowCategory?.id || !matrixDrilldown) {
      setMatrixError("Select a subcategory before applying it.");
      return;
    }
    setMatrixError(null);
    setMatrixBusy(true);
    setMatrixDrilldownBusySplitId(splitId);
    try {
      const result = await sendFeatureCommand<any>(`/transactions/splits/${splitId}`, {
        category_id: rowCategory.id,
        subcategory_id: subcategoryId,
        classification: "Personal",
        cascade_matching_merchant: true
      });
      await loadMatrixCategories();
      const nextMatrix = await loadMatrix(matrixYear);
      const refreshedRow =
        (nextMatrix?.categories || []).find((row: any) => String(row.id) === String(matrixDrilldown.bucket_key)) ||
        {
          id: matrixDrilldown.bucket_key,
          name: matrixDrilldown.bucket_name,
          type: matrixDrilldown.bucket_type,
          income: {},
          expense: {},
        };
      const refreshSubcategory =
        matrixDrilldown.subcategory_id
          ? { subcategory_id: matrixDrilldown.subcategory_id, name: matrixDrilldown.subcategory_name }
          : matrixDrilldown.unassigned
            ? { is_unassigned: true, name: matrixDrilldown.subcategory_name || "Unassigned" }
            : null;
      await loadMatrixDrilldownData({
        left: matrixDrilldown.left,
        top: matrixDrilldown.top,
        row: refreshedRow,
        month: matrixDrilldown.month,
        subcategory: refreshSubcategory,
      });
      const cascaded = Number(result?.updated || 0);
      setMatrixBaseCurrencyStatus(
        cascaded > 0
          ? `Subcategory applied and cascaded to ${formatCount(cascaded)} matching transactions.`
          : "Subcategory applied."
      );
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : "Unable to apply subcategory.");
    } finally {
      setMatrixBusy(false);
      setMatrixDrilldownBusySplitId(null);
    }
  };

  return {
    applyMatrixDrilldownSubcategory,
    matrixDrilldown,
    matrixDrilldownAssignments,
    matrixDrilldownBusySplitId,
    matrixDrilldownSubcategories: matrixDrilldown
      ? matrixSubcategoriesForBucket(matrixDrilldown.bucket_name || "")
      : [],
    openMatrixDrilldown,
    setMatrixDrilldown,
    setMatrixDrilldownAssignments
  };
}

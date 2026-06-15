import { useEffect, useState } from "react";
import { getFeatureBlob, saveFeatureBlob } from "../api";

export function useInvoicePdfTools({
  setInvoiceError,
  setInvoiceNotice
}: {
  setInvoiceError: (message: string | null) => void;
  setInvoiceNotice: (message: string | null) => void;
}) {
  const [invoicePreviewBusy, setInvoicePreviewBusy] = useState(false);
  const [invoicePreview, setInvoicePreview] = useState<{ url: string; name: string; title: string } | null>(null);

  useEffect(() => {
    return () => {
      if (invoicePreview?.url) {
        URL.revokeObjectURL(invoicePreview.url);
      }
    };
  }, [invoicePreview]);

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

  return {
    closeInvoicePreview,
    downloadInvoicePdf,
    invoicePreview,
    invoicePreviewBusy,
    openInvoicePreview
  };
}

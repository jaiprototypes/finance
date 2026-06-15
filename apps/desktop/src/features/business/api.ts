import { apiGet } from "../../shared/api/client";

export * from "../../shared/api/featureBoundary";

export type InvoiceNumberPreview = {
  client_id: number;
  number: string;
};

export function getNextInvoiceNumber(clientId: number, issueDate?: string): Promise<InvoiceNumberPreview> {
  const query = issueDate ? `?issue_date=${encodeURIComponent(issueDate)}` : "";
  return apiGet<InvoiceNumberPreview>(`/business/clients/${clientId}/next-invoice-number${query}`);
}

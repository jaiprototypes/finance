export * from "../../shared/api/featureBoundary";

import { sendFeatureForm } from "../../shared/api/featureBoundary";

export function uploadTransactionAttachment(transactionId: number, formData: FormData): Promise<any> {
  return sendFeatureForm<any>(`/transactions/${transactionId}/attachments`, formData);
}

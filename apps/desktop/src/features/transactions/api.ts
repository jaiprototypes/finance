export {
  API_BASE,
  apiDelete,
  apiGet,
  apiGetBlob,
  apiPost,
  apiPostForm,
  apiUrl,
  downloadDiagnostics,
  saveBlob
} from "../../shared/api/client";

import { apiPostForm } from "../../shared/api/client";

export function uploadTransactionAttachment(transactionId: number, formData: FormData): Promise<any> {
  return apiPostForm<any>(`/transactions/${transactionId}/attachments`, formData);
}

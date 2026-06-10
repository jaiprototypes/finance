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

export function previewImportFile(formData: FormData): Promise<any> {
  return apiPostForm<any>("/imports/preview", formData);
}

export function commitImportFile(formData: FormData): Promise<any> {
  return apiPostForm<any>("/imports/commit", formData);
}

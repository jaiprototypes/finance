export * from "../../shared/api/featureBoundary";

import { sendFeatureForm } from "../../shared/api/featureBoundary";

export function previewImportFile(formData: FormData): Promise<any> {
  return sendFeatureForm<any>("/imports/preview", formData);
}

export function commitImportFile(formData: FormData): Promise<any> {
  return sendFeatureForm<any>("/imports/commit", formData);
}

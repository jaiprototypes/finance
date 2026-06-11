import {
  apiDelete,
  apiGet,
  apiGetBlob,
  apiPost,
  apiPostForm,
  apiUrl,
  downloadDiagnostics,
  saveBlob
} from "./client";

export const getFeatureData = apiGet;
export const sendFeatureCommand = apiPost;
export const sendFeatureForm = apiPostForm;
export const removeFeatureRecord = apiDelete;
export const getFeatureBlob = apiGetBlob;
export const featureUrl = apiUrl;
export const downloadFeatureDiagnostics = downloadDiagnostics;
export const saveFeatureBlob = saveBlob;

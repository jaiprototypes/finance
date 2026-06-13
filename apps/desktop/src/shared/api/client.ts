const DEFAULT_BASE = "http://127.0.0.1:8123";
const API_VERSION_PREFIX = "/api/v1";
const STABLE_ROOT_PATHS = new Set(["/health", "/diagnostics/status", "/diagnostics/export"]);

export const API_BASE = (import.meta as any).env?.VITE_BACKEND_URL || DEFAULT_BASE;

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function versionedPath(path: string): string {
  const normalized = normalizePath(path);
  return STABLE_ROOT_PATHS.has(normalized) ? normalized : `${API_VERSION_PREFIX}${normalized}`;
}

function candidateUrls(path: string): string[] {
  const normalized = normalizePath(path);
  const primary = `${API_BASE}${versionedPath(normalized)}`;

  if (STABLE_ROOT_PATHS.has(normalized)) {
    return [primary, `${API_BASE}${API_VERSION_PREFIX}${normalized}`];
  }

  // Keeps the desktop usable if a stale local backend is still serving pre-v1 routes.
  return [primary, `${API_BASE}${normalized}`];
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${versionedPath(normalized)}`;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) {
      return `${res.status}`;
    }
    try {
      const data = JSON.parse(text);
      if (data && typeof data.detail === "string") {
        return data.detail;
      }
    } catch {
      // not JSON
    }
    return text;
  } catch {
    return `${res.status}`;
  }
}

async function fetchWithRouteFallback(path: string, init?: RequestInit): Promise<Response> {
  const urls = candidateUrls(path);
  let lastResponse: Response | null = null;

  for (const url of urls) {
    const response = await fetch(url, init);
    lastResponse = response;
    if (response.status !== 404) {
      return response;
    }
  }

  return lastResponse as Response;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetchWithRouteFallback(path);
  if (!res.ok) {
    const message = await readErrorMessage(res);
    throw new Error(`GET ${path} failed: ${message}`);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body?: any): Promise<T> {
  const res = await fetchWithRouteFallback(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const message = await readErrorMessage(res);
    throw new Error(`POST ${path} failed: ${message}`);
  }
  return res.json();
}

export async function apiPostForm<T>(path: string, body: FormData): Promise<T> {
  const res = await fetchWithRouteFallback(path, {
    method: "POST",
    body
  });
  if (!res.ok) {
    const message = await readErrorMessage(res);
    throw new Error(`POST ${path} failed: ${message}`);
  }
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetchWithRouteFallback(path, { method: "DELETE" });
  if (!res.ok) {
    const message = await readErrorMessage(res);
    throw new Error(`DELETE ${path} failed: ${message}`);
  }
  return res.json();
}

export async function apiGetBlob(path: string): Promise<Blob> {
  const res = await fetchWithRouteFallback(path, { cache: "no-store" });
  if (!res.ok) {
    const message = await readErrorMessage(res);
    throw new Error(`GET ${path} failed: ${message}`);
  }
  return res.blob();
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadDiagnostics(): Promise<void> {
  const res = await fetch(apiUrl("/diagnostics/export"));
  if (!res.ok) {
    throw new Error(`Diagnostics export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "diagnostics.zip";
  anchor.click();
  URL.revokeObjectURL(url);
}

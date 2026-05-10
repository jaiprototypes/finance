const DEFAULT_BASE = "http://127.0.0.1:8123";

export const API_BASE = (import.meta as any).env?.VITE_BACKEND_URL || DEFAULT_BASE;

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

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const message = await readErrorMessage(res);
    throw new Error(`GET ${path} failed: ${message}`);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
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
  const res = await fetch(`${API_BASE}${path}`, {
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
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const message = await readErrorMessage(res);
    throw new Error(`DELETE ${path} failed: ${message}`);
  }
  return res.json();
}

export async function apiGetBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
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
  const res = await fetch(`${API_BASE}/diagnostics/export`);
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

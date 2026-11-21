import { toAppError, type AppError } from "./api-error";
import { API_URL } from "@/store/api";

/**
 * Opens a private document. The file is fetched with the user's bearer token
 * and shown from a short-lived object URL; no permanent public link exists.
 */
export async function openDocument(token: string | null, documentId: string, filename: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1/documents/${documentId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw { status: 0, code: "NETWORK_ERROR", message: "Can't reach the OpsWarden API." } satisfies AppError;
  }
  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = undefined;
    }
    throw toAppError({ status: res.status, data });
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const previewable =
    blob.type === "application/pdf" ||
    blob.type.startsWith("image/") ||
    blob.type.startsWith("text/") ||
    blob.type === "application/json";
  if (previewable) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Fetches a private text document (JSON/TXT fixtures) for inline preview. */
export async function fetchDocumentText(token: string | null, documentId: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/v1/documents/${documentId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw toAppError({ status: res.status, data: undefined });
  return res.text();
}

/** Saves text content as a file (used for exporting email drafts). */
export function downloadText(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

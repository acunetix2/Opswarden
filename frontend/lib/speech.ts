import { toAppError, type AppError } from "./api-error";
import { API_URL } from "@/store/api";

/** Fetches spoken audio (WAV) for `text` from the backend's text-to-speech endpoint. */
export async function fetchSpeech(token: string | null, workspaceId: string, text: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1/workspaces/${workspaceId}/assistant/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ text: text.slice(0, 4000) }),
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
  return res.blob();
}

import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { SerializedError } from "@reduxjs/toolkit";

/** Normalized error shape for every API failure the UI renders. */
export interface AppError {
  status: number;
  code: string;
  message: string;
  requestId?: string;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; request_id?: string };
}

export function fromFetchError(err: FetchBaseQueryError): AppError {
  if (typeof err.status === "number") {
    const body = err.data as ApiErrorBody | undefined;
    return {
      status: err.status,
      code: body?.error?.code ?? "HTTP_ERROR",
      message: body?.error?.message ?? `Request failed (${err.status}).`,
      requestId: body?.error?.request_id,
    };
  }
  if (err.status === "FETCH_ERROR") {
    return { status: 0, code: "NETWORK_ERROR", message: "Can't reach the OpsWarden API. Check that the backend is running." };
  }
  if (err.status === "TIMEOUT_ERROR") {
    return { status: 0, code: "TIMEOUT", message: "The request timed out. Try again." };
  }
  return { status: 0, code: "PARSE_ERROR", message: "The server sent a response OpsWarden couldn't read." };
}

/** Accepts anything RTK Query or a thrown `unwrap()` might produce. */
export function toAppError(err: unknown): AppError {
  if (!err || typeof err !== "object") return { status: 0, code: "UNKNOWN", message: "Something went wrong." };
  const e = err as Partial<AppError & FetchBaseQueryError & SerializedError>;
  if (typeof e.code === "string" && typeof e.message === "string" && typeof e.status === "number") {
    return e as AppError;
  }
  if ("status" in e && e.status !== undefined) return fromFetchError(e as FetchBaseQueryError);
  return { status: 0, code: "UNKNOWN", message: (e as SerializedError).message ?? "Something went wrong." };
}

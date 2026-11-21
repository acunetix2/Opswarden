/**
 * Minimal Supabase Auth client over its REST API (GoTrue), so the app needs no
 * extra dependency. Used only when NEXT_PUBLIC_AUTH_PROVIDER=supabase.
 *
 * The anon (publishable) key is safe in the browser by design; never put the
 * service-role key in a NEXT_PUBLIC_ variable.
 *
 * Tokens: the short-lived access token goes to the API as a bearer token (the
 * backend verifies it against the project's signing keys). The refresh token is
 * kept in localStorage so a session survives reloads and is used to renew the
 * access token when the API answers 401.
 */

export const usesSupabaseAuth = process.env.NEXT_PUBLIC_AUTH_PROVIDER === "supabase";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const REFRESH_KEY = "opswarden.refresh";

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { id: string; email?: string };
}

export class SupabaseAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function friendly(message: string, status: number): string {
  if (/invalid login credentials/i.test(message)) return "Invalid email or password.";
  if (/email not confirmed/i.test(message)) return "Confirm your email address first. Check your inbox for the link.";
  if (/user already registered/i.test(message)) return "An account with this email already exists. Sign in instead.";
  if (/rate limit|too many/i.test(message) || status === 429) return "Too many attempts. Wait a minute and try again.";
  if (/password should be|weak password/i.test(message)) return message;
  return message || "Sign-in service error. Try again.";
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  if (!SUPABASE_URL || !ANON_KEY) throw new SupabaseAuthError("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).", 0);
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
      ...init,
      headers: {
        apikey: ANON_KEY,
        "Content-Type": "application/json",
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new SupabaseAuthError("Can't reach the sign-in service. Check your connection.", 0);
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const msg = String(data.error_description ?? data.msg ?? data.message ?? data.error ?? "");
    throw new SupabaseAuthError(friendly(msg, res.status), res.status);
  }
  return data as T;
}

export function storeRefreshToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(REFRESH_KEY, token);
  else window.localStorage.removeItem(REFRESH_KEY);
}

export function readRefreshToken(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(REFRESH_KEY);
}

export async function signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
  const s = await call<SupabaseSession>("/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
  storeRefreshToken(s.refresh_token);
  return s;
}

/** Returns a session when email confirmation is off, otherwise null (the user must click the email link first). */
export async function signUp(email: string, password: string, fullName: string, redirectTo: string): Promise<SupabaseSession | null> {
  const data = await call<Partial<SupabaseSession> & Record<string, unknown>>(`/signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: JSON.stringify({ email, password, data: { full_name: fullName } }),
  });
  if (data.access_token && data.refresh_token) {
    storeRefreshToken(data.refresh_token);
    return data as SupabaseSession;
  }
  return null;
}

let refreshing: Promise<SupabaseSession | null> | null = null;

/** Renews the access token. Concurrent callers share one request. */
export function refreshSession(): Promise<SupabaseSession | null> {
  const token = readRefreshToken();
  if (!token) return Promise.resolve(null);
  refreshing ??= call<SupabaseSession>("/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: token }) })
    .then((s) => {
      storeRefreshToken(s.refresh_token);
      return s;
    })
    .catch(() => {
      storeRefreshToken(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function requestPasswordRecovery(email: string, redirectTo: string): Promise<void> {
  await call(`/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { method: "POST", body: JSON.stringify({ email }) });
}

export async function updatePassword(accessToken: string, password: string): Promise<void> {
  await call("/user", { method: "PUT", token: accessToken, body: JSON.stringify({ password }) });
}

export async function signOutRemote(accessToken: string | null): Promise<void> {
  storeRefreshToken(null);
  if (!accessToken) return;
  try {
    await call("/logout", { method: "POST", token: accessToken });
  } catch {
    // Already expired or offline: the local session is cleared either way.
  }
}

/**
 * Reads a session Supabase put in the URL fragment after an email link
 * (sign-up confirmation, password recovery), then removes it from the address bar.
 */
export function takeSessionFromUrl(): (SupabaseSession & { type: string | null }) | null {
  if (typeof window === "undefined" || !window.location.hash.includes("access_token=")) return null;
  const p = new URLSearchParams(window.location.hash.slice(1));
  const access = p.get("access_token");
  const refresh = p.get("refresh_token");
  if (!access || !refresh) return null;
  storeRefreshToken(refresh);
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return { access_token: access, refresh_token: refresh, expires_in: Number(p.get("expires_in") ?? 3600), type: p.get("type") };
}

/** Error text Supabase puts in the fragment when an email link has expired or was already used. */
export function urlAuthError(): string | null {
  if (typeof window === "undefined" || !window.location.hash.includes("error")) return null;
  const p = new URLSearchParams(window.location.hash.slice(1));
  return p.get("error_description")?.replace(/\+/g, " ") ?? null;
}

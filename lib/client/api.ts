/**
 * Thin typed client for the console's non-streaming routes (/api/message, /api/lead, /api/summary,
 * /api/voice/{session,probe}) plus the one place that remembers the session id handed back by
 * /api/chat in the x-session-id response header.
 */
import type { Locale } from "@/lib/tools/schema";
import type { SessionGrant } from "@/lib/voice/VoiceSession";
import type { UaClass } from "@/lib/client/inapp";

export const API_REASONS = [
  "bot_detected",
  "no_session",
  "session_expired",
  "invalid_input",
  "consent_required",
  "already_sent",
  "email_capped",
  "guard_blocked",
  "llm_unavailable",
  "killed",
  "capped_global",
  "capped_visitor",
  "voice_unavailable",
  "network",
  "unknown",
] as const;

export type ApiReason = (typeof API_REASONS)[number];

export type ApiResult<T> = { ok: true; value: T } | { ok: false; reason: ApiReason };

function toReason(value: unknown): ApiReason {
  return typeof value === "string" && (API_REASONS as readonly string[]).includes(value)
    ? (value as ApiReason)
    : "unknown";
}

/**
 * The locale every /api/chat request should be answered in. Module scope on purpose: the chat transport
 * is constructed once and reads this at request time, which keeps React refs out of the render path.
 */
let requestLocale: Locale = "en";

export function getRequestLocale(): Locale {
  return requestLocale;
}

export function setRequestLocale(locale: Locale): void {
  requestLocale = locale;
}

/** Module-level session id: /api/chat mints it on the first request and returns it as a header. */
let sessionId: string | null = null;

export function getSessionId(): string | null {
  return sessionId;
}

export function setSessionId(id: string | null): void {
  if (id && id.length > 0) sessionId = id;
}

/**
 * fetch wrapper for the chat transport: identical to fetch, but records the x-session-id header the
 * first time the server sends one. Passed to DefaultChatTransport as its `fetch` option.
 */
export const chatFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, { ...init, credentials: "same-origin" });
  setSessionId(response.headers.get("x-session-id"));
  return response;
};

async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: "network" };
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const record = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  if (!response.ok || record.ok === false) return { ok: false, reason: toReason(record.reason) };
  return { ok: true, value: record as T };
}

export interface MessageInput {
  name?: string;
  email?: string;
  body: string;
}

export function postMessage(input: MessageInput): Promise<ApiResult<Record<string, unknown>>> {
  return postJson("/api/message", { ...input, sessionId: getSessionId(), website: "" });
}

export interface LeadInput {
  name: string;
  company?: string;
  email: string;
}

export function postLead(input: LeadInput): Promise<ApiResult<Record<string, unknown>>> {
  return postJson("/api/lead", { ...input, sessionId: getSessionId(), consent: true, website: "" });
}

export function postSummary(email: string): Promise<ApiResult<Record<string, unknown>>> {
  return postJson("/api/summary", { email, sessionId: getSessionId(), consent: true, website: "" });
}

export function postProbe(input: {
  ua_class: UaClass;
  os_version?: string;
  outcome: "granted" | "denied" | "unsupported" | "error";
}): Promise<ApiResult<Record<string, unknown>>> {
  return postJson("/api/voice/probe", input);
}

/**
 * Mints a voice grant. Must only be called once a live mic track exists (invariant 6: no paid token is
 * requested before the visitor has actually granted the microphone).
 */
export async function postVoiceSession(locale: Locale): Promise<ApiResult<SessionGrant>> {
  const result = await postJson<Record<string, unknown>>("/api/voice/session", { locale });
  if (!result.ok) return result;
  const grant = result.value;
  if (
    typeof grant.provider !== "string" ||
    typeof grant.sessionId !== "string" ||
    typeof grant.token !== "string" ||
    typeof grant.maxSeconds !== "number" ||
    typeof grant.expiresAt !== "string"
  ) {
    return { ok: false, reason: "unknown" };
  }
  setSessionId(grant.sessionId);
  return { ok: true, value: grant as unknown as SessionGrant };
}

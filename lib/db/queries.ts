/**
 * Every table read/write the API routes need, in one place. Plain PostgREST calls through supabase-js —
 * no ORM, no query builder of our own. The Supabase client is always passed in rather than imported, so
 * these functions are unit-testable and so `lib/db/client.ts` (which is `server-only`) never leaks into
 * a test or a client bundle.
 *
 * Nothing here throws for the caller's benefit: the routes decide what a DB failure means. Rate-limit
 * helpers therefore return a permissive answer when the database is unreachable — text chat must keep
 * working when Supabase is paused (docs/PLAN.md 4.4), while the voice mint route fails closed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel, SessionFlags } from "@/lib/brain/types";
import type { Locale } from "@/lib/tools/schema";

export interface SessionRow {
  id: string;
  channel: Channel;
  started_at: string;
  ended_at: string | null;
  locale_initial: Locale;
  lead_captured: boolean;
  summary_sent: boolean;
  message_left: boolean;
  guard_hits: number;
  reserved_seconds: number;
  duration_secs: number | null;
  flags: Record<string, unknown>;
}

const SESSION_COLUMNS =
  "id, channel, started_at, ended_at, locale_initial, lead_captured, summary_sent, " +
  "message_left, guard_hits, reserved_seconds, duration_secs, flags";

function utcDayStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** Start of the current UTC month, as an ISO string. */
export function utcMonthStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

export async function createTextSession(
  db: SupabaseClient,
  input: { ipHash: string; visitorHash: string | null; locale: Locale; corpusVersion?: string },
): Promise<string | null> {
  const { data, error } = await db
    .from("sessions")
    .insert({
      channel: "text",
      ip_hash: input.ipHash,
      visitor_hash: input.visitorHash,
      locale_initial: input.locale,
      provider: "text",
      corpus_version: input.corpusVersion ?? null,
      consent_at: new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  return error !== null || data === null ? null : data.id;
}

export async function getSessionById(db: SupabaseClient, id: string): Promise<SessionRow | null> {
  const { data, error } = await db
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("id", id)
    .maybeSingle<SessionRow>();
  return error !== null ? null : data;
}

export async function getSessionByConversationId(
  db: SupabaseClient,
  conversationId: string,
): Promise<SessionRow | null> {
  const { data, error } = await db
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("elevenlabs_conversation_id", conversationId)
    .maybeSingle<SessionRow>();
  return error !== null ? null : data;
}

/** Bind the ElevenLabs conversation id to a session we reserved. Idempotent. */
export async function attachConversationId(
  db: SupabaseClient,
  sessionId: string,
  conversationId: string,
): Promise<void> {
  await db
    .from("sessions")
    .update({ elevenlabs_conversation_id: conversationId })
    .eq("id", sessionId)
    .is("elevenlabs_conversation_id", null);
}

export async function updateSessionFlags(
  db: SupabaseClient,
  sessionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await db.from("sessions").update(patch).eq("id", sessionId);
}

/** A session is usable for a side effect only while it is fresh (docs/PLAN.md 4.5). */
export function isSessionFresh(session: SessionRow, maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  const started = Date.parse(session.started_at);
  return Number.isFinite(started) && Date.now() - started <= maxAgeMs;
}

export function toSessionFlags(session: SessionRow | null, channel: Channel): SessionFlags {
  return {
    sessionId: session?.id ?? null,
    channel,
    langHint: session?.locale_initial ?? "en",
    leadCaptured: session?.lead_captured ?? false,
    summarySent: session?.summary_sent ?? false,
    messageLeft: session?.message_left ?? false,
    guardHits: session?.guard_hits ?? 0,
    remainingSeconds: null,
    greetingPlayed: session?.flags?.greeting_played !== false,
  };
}

// ---------------------------------------------------------------------------
// transcript
// ---------------------------------------------------------------------------

export interface TurnInput {
  sessionId: string;
  idx: number;
  role: "user" | "agent" | "system" | "tool";
  lang?: string | null;
  content?: string | null;
  toolName?: string | null;
  toolArgs?: unknown;
  interrupted?: boolean;
  ttftMs?: number | null;
}

export async function insertTurn(db: SupabaseClient, turn: TurnInput): Promise<void> {
  await db.from("transcript_turns").upsert(
    {
      session_id: turn.sessionId,
      idx: turn.idx,
      role: turn.role,
      lang: turn.lang ?? null,
      content: turn.content ?? null,
      tool_name: turn.toolName ?? null,
      tool_args: turn.toolArgs ?? null,
      interrupted: turn.interrupted ?? false,
      ttft_ms: turn.ttftMs ?? null,
    },
    { onConflict: "session_id,idx", ignoreDuplicates: true },
  );
}

export async function nextTurnIndex(db: SupabaseClient, sessionId: string): Promise<number> {
  const { data, error } = await db
    .from("transcript_turns")
    .select("idx")
    .eq("session_id", sessionId)
    .order("idx", { ascending: false })
    .limit(1)
    .maybeSingle<{ idx: number }>();
  return error !== null || data === null ? 0 : data.idx + 1;
}

export async function listTurns(
  db: SupabaseClient,
  sessionId: string,
): Promise<Array<{ role: string; content: string | null; lang: string | null }>> {
  const { data, error } = await db
    .from("transcript_turns")
    .select("role, content, lang")
    .eq("session_id", sessionId)
    .order("idx", { ascending: true })
    .limit(200);
  return error !== null || data === null
    ? []
    : (data as Array<{ role: string; content: string | null; lang: string | null }>);
}

// ---------------------------------------------------------------------------
// observability rows
// ---------------------------------------------------------------------------

export interface LlmCallInput {
  sessionId: string | null;
  provider: string;
  model: string;
  channel: Channel;
  ttftMs?: number | null;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  outputTokens?: number;
  failover?: boolean;
  finishReason?: string | null;
  usd?: number;
  corpusVersion?: string | null;
}

export async function insertLlmCall(db: SupabaseClient, call: LlmCallInput): Promise<void> {
  await db.from("llm_calls").insert({
    session_id: call.sessionId,
    provider: call.provider,
    model: call.model,
    channel: call.channel,
    ttft_ms: call.ttftMs ?? null,
    cache_hit_tokens: call.cacheHitTokens ?? 0,
    cache_miss_tokens: call.cacheMissTokens ?? 0,
    output_tokens: call.outputTokens ?? 0,
    failover: call.failover ?? false,
    finish_reason: call.finishReason ?? null,
    usd: call.usd ?? 0,
    corpus_version: call.corpusVersion ?? null,
  });
}

export async function insertGuardEvent(
  db: SupabaseClient,
  input: { sessionId: string | null; rule: string; sha256: string; channel: Channel },
): Promise<void> {
  await db.from("guard_events").insert({
    session_id: input.sessionId,
    rule: input.rule,
    blocked_sha256: input.sha256,
    channel: input.channel,
  });
  if (input.sessionId !== null) {
    await db.rpc("increment_guard_hits", { p_session_id: input.sessionId });
  }
}

export interface SpendInput {
  sessionId: string | null;
  vendor: string;
  kind: string;
  units?: number;
  usd?: number;
  idempotencyKey?: string | null;
  settled?: boolean;
}

export async function insertSpendEvent(db: SupabaseClient, spend: SpendInput): Promise<void> {
  await db.from("spend_events").upsert(
    {
      session_id: spend.sessionId,
      vendor: spend.vendor,
      kind: spend.kind,
      units: spend.units ?? 0,
      usd: spend.usd ?? 0,
      idempotency_key: spend.idempotencyKey ?? null,
      settled_at: spend.settled === true ? new Date().toISOString() : null,
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
}

export async function insertProbeEvent(
  db: SupabaseClient,
  input: { uaClass: string; osVersion: string | null; outcome: string },
): Promise<void> {
  await db.from("probe_events").insert({
    ua_class: input.uaClass,
    os_version: input.osVersion,
    outcome: input.outcome,
  });
}

// ---------------------------------------------------------------------------
// rate limiting (best-effort, per ip_hash per UTC day)
// ---------------------------------------------------------------------------

/**
 * Counts today's `kind` events for this ip_hash and records one more. Returns true when the caller is
 * still under `limit`. Permissive on any DB error: text chat must survive a paused database.
 */
export async function consumeRateSlot(
  db: SupabaseClient | null,
  kind: string,
  ipHash: string,
  limit: number,
): Promise<boolean> {
  if (db === null) return true;
  try {
    const { count, error } = await db
      .from("rate_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", kind)
      .eq("ip_hash", ipHash)
      .gte("created_at", utcDayStartIso());
    if (error !== null) return true;
    if ((count ?? 0) >= limit) return false;
    await db.from("rate_events").insert({ kind, ip_hash: ipHash });
    return true;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// side-effect rows
// ---------------------------------------------------------------------------

export async function insertLead(
  db: SupabaseClient,
  input: { sessionId: string; name: string; company: string | null; email: string; note: string | null },
): Promise<boolean> {
  const { error } = await db.from("leads").insert({
    session_id: input.sessionId,
    name: input.name,
    company: input.company,
    email: input.email,
    note: input.note,
    consent_at: new Date().toISOString(),
  });
  return error === null;
}

export async function insertMessageIn(
  db: SupabaseClient,
  input: { sessionId: string; name: string; email: string; body: string },
): Promise<boolean> {
  const { error } = await db.from("messages_in").insert({
    session_id: input.sessionId,
    name: input.name,
    email: input.email,
    body: input.body,
  });
  return error === null;
}

/** Only the digest of the visitor's address is ever stored (docs/PLAN.md 4.5). */
export async function insertSummaryOut(
  db: SupabaseClient,
  input: { sessionId: string; emailSha256: string },
): Promise<boolean> {
  const { error } = await db.from("summaries_out").insert({
    session_id: input.sessionId,
    email_sha256: input.emailSha256,
    consent_at: new Date().toISOString(),
  });
  return error === null;
}

export async function markSummarySent(db: SupabaseClient, sessionId: string): Promise<void> {
  await db.from("summaries_out").update({ sent_at: new Date().toISOString() }).eq("session_id", sessionId);
  await db.from("sessions").update({ summary_sent: true }).eq("id", sessionId);
}

/**
 * Typed wrappers over the SQL cap functions. Every cap in this product is counted from Postgres rows and
 * decided inside one transaction (docs/ARCHITECTURE.md 4.9) — this file only carries the arguments across and
 * gives the reasons a TypeScript type. There is deliberately no caching and no in-process counter.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReserveRejection = "killed" | "capped_global" | "capped_visitor" | "unavailable";

export type ReserveResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: ReserveRejection };

export type EmailKind = "message" | "lead" | "summary" | "digest" | "alert";

export type SpendRuleOutcome = "normal" | "capped_540" | "voice_off";

const REJECTIONS = new Set<string>(["killed", "capped_global", "capped_visitor"]);

/**
 * Reserve `reserveSeconds` of voice time and create the session row. Fails **closed**: if the database
 * cannot be reached the answer is `unavailable`, i.e. no token is minted (invariant 5).
 */
export async function reserveVoiceSession(
  db: SupabaseClient,
  input: { ipHash: string; visitorHash: string | null; locale: string; reserveSeconds?: number },
): Promise<ReserveResult> {
  try {
    const { data, error } = await db.rpc("reserve_voice_session", {
      p_ip_hash: input.ipHash,
      p_visitor_hash: input.visitorHash,
      p_locale: input.locale,
      p_reserve: input.reserveSeconds ?? 240,
    });
    if (error !== null) return { ok: false, reason: "unavailable" };

    const rows = (Array.isArray(data) ? data : [data]) as Array<{
      session_id: string | null;
      reason: string | null;
    } | null>;
    const row = rows[0];
    if (row === null || row === undefined) return { ok: false, reason: "unavailable" };

    if (row.reason !== null && row.reason !== undefined) {
      return { ok: false, reason: REJECTIONS.has(row.reason) ? (row.reason as ReserveRejection) : "unavailable" };
    }
    if (row.session_id === null) return { ok: false, reason: "unavailable" };
    return { ok: true, sessionId: row.session_id };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** Returns the seconds handed back to today's budget; 0 when the session was already settled. */
export async function settleVoiceSession(
  db: SupabaseClient,
  input: { sessionId: string; durationSec: number; costUsd: number },
): Promise<number> {
  try {
    const { data, error } = await db.rpc("settle_voice_session", {
      p_session_id: input.sessionId,
      p_duration: Math.max(0, Math.round(input.durationSec)),
      p_cost: input.costUsd,
    });
    if (error !== null) return 0;
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

/**
 * Consumes one unit of today's email budget. Returns false when the send must not happen — including
 * when the database is unreachable, because an uncounted email is an uncapped email.
 */
export async function canSendEmail(db: SupabaseClient, kind: EmailKind): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("can_send_email", { p_kind: kind });
    return error === null && data === true;
  } catch {
    return false;
  }
}

export async function closeStaleSessions(db: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await db.rpc("close_stale_sessions");
    return error === null && typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

export async function purgeExpired(db: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await db.rpc("purge_expired");
    return error === null && typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

export async function applySpendRules(
  db: SupabaseClient,
  monthToDateUsd: number,
): Promise<SpendRuleOutcome> {
  try {
    const { data, error } = await db.rpc("apply_spend_rules", { p_month_to_date: monthToDateUsd });
    if (error !== null) return "normal";
    return data === "voice_off" || data === "capped_540" ? data : "normal";
  } catch {
    return "normal";
  }
}

/**
 * Sum of `spend_events.usd` since the 1st of the current UTC month, or null if it cannot be read.
 *
 * Aggregated in Postgres. This used to select every row and reduce them here, but PostgREST caps a
 * response at Supabase's max-rows (1000 by default), so past a thousand spend events in a month the
 * sum silently truncated. Measured against the live database with 1,500 one-cent rows: the SQL
 * function returns 15.00 and the client-side reduce saw 10.00. A ceiling that stops seeing spend as
 * traffic grows fails exactly when it is needed, and at one event per LLM call a thousand a month
 * is ordinary traffic for this site rather than a stress case.
 *
 * Null rather than 0 on failure: 0 is a real, meaningful value that tells apply_spend_rules to
 * CLEAR both overrides, so a transient read error would have lifted a cap that was correctly in
 * place. The caller skips the rules instead, leaving whatever is already set.
 */
export async function monthToDateSpend(db: SupabaseClient): Promise<number | null> {
  try {
    const { data, error } = await db.rpc("month_to_date_spend");
    if (error !== null || data === null) return null;
    const usd = typeof data === "number" ? data : Number.parseFloat(String(data));
    return Number.isFinite(usd) ? usd : null;
  } catch {
    return null;
  }
}

/** One tiny write to keep a Supabase Free project from pausing after 7 idle days. */
export async function keepAliveTouch(db: SupabaseClient): Promise<void> {
  try {
    await db.from("settings").update({ updated_at: new Date().toISOString() }).eq("id", 1);
  } catch {
    /* best effort */
  }
}

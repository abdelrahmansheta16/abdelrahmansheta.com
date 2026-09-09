/**
 * Session bookkeeping for the brain: read the flags a turn needs, and write the rows that make the
 * system observable (Vercel Hobby keeps logs for an hour, so Postgres is the source of truth).
 *
 * Every function here is BEST EFFORT. A logging failure must never abort a turn that is already
 * streaming audio to a visitor, so nothing in this file throws into the stream — failures are swallowed
 * and, at most, warned about without any visitor text attached.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel, SessionFlags } from "./types";
import {
  getSessionByConversationId,
  getSessionById,
  insertGuardEvent,
  insertLlmCall,
  insertSpendEvent,
  insertTurn,
  nextTurnIndex,
  toSessionFlags,
  type LlmCallInput,
  type SpendInput,
  type TurnInput,
} from "@/lib/db/queries";

/** The flags a turn runs with when the database cannot answer. Conservative by design. */
export function defaultFlags(channel: Channel): SessionFlags {
  return {
    sessionId: null,
    channel,
    langHint: "en",
    leadCaptured: false,
    summarySent: false,
    messageLeft: false,
    guardHits: 0,
    remainingSeconds: null,
    // Assume the greeting did NOT play: the worst case is the disclosure being said twice, and
    // invariant 10 prefers that to it never being said at all.
    greetingPlayed: false,
  };
}

export async function loadFlags(
  db: SupabaseClient | null,
  ref: { conversationId?: string | null; sessionId?: string | null; channel?: Channel },
): Promise<SessionFlags> {
  const channel: Channel = ref.channel ?? (ref.conversationId != null ? "voice" : "text");
  if (db === null) return defaultFlags(channel);

  try {
    const row =
      ref.sessionId != null && ref.sessionId !== ""
        ? await getSessionById(db, ref.sessionId)
        : ref.conversationId != null && ref.conversationId !== ""
          ? await getSessionByConversationId(db, ref.conversationId)
          : null;
    if (row === null) return defaultFlags(channel);

    const flags = toSessionFlags(row, channel);
    if (channel === "voice") {
      const elapsed = (Date.now() - Date.parse(row.started_at)) / 1000;
      flags.remainingSeconds = Math.max(0, Math.round(row.reserved_seconds - elapsed));
    }
    return flags;
  } catch {
    return defaultFlags(channel);
  }
}

export async function recordTurn(
  db: SupabaseClient | null,
  turn: Omit<TurnInput, "idx"> & { idx?: number },
): Promise<void> {
  if (db === null) return;
  try {
    const idx = turn.idx ?? (await nextTurnIndex(db, turn.sessionId));
    await insertTurn(db, { ...turn, idx });
  } catch {
    /* best effort */
  }
}

export async function recordLlmCall(db: SupabaseClient | null, call: LlmCallInput): Promise<void> {
  if (db === null) return;
  try {
    await insertLlmCall(db, call);
  } catch {
    /* best effort */
  }
}

export async function recordSpend(db: SupabaseClient | null, spend: SpendInput): Promise<void> {
  if (db === null) return;
  try {
    await insertSpendEvent(db, spend);
  } catch {
    /* best effort */
  }
}

export async function recordGuardEvent(
  db: SupabaseClient | null,
  input: { sessionId: string | null; rule: string; sha256: string; channel: Channel },
): Promise<void> {
  if (db === null) return;
  try {
    await insertGuardEvent(db, input);
  } catch {
    /* best effort */
  }
}

/**
 * Rough per-turn cost for the spend ledger. DeepSeek V4 Flash off-peak rates per MTok
 * (docs/ARCHITECTURE.md 8); Haiku 4.5 list price. Deliberately an estimate: the authoritative number is the
 * vendor invoice, and the ledger exists to trip the $27/$30 rules early, not to do accounting.
 */
export function estimateUsd(
  provider: "deepseek" | "anthropic",
  usage: { cacheHitTokens: number; cacheMissTokens: number; completionTokens: number },
): number {
  const rates =
    provider === "deepseek"
      ? { hit: 0.014, miss: 0.44, out: 1.32 }
      : { hit: 0.08, miss: 1.0, out: 5.0 };
  const usd =
    (usage.cacheHitTokens * rates.hit +
      usage.cacheMissTokens * rates.miss +
      usage.completionTokens * rates.out) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

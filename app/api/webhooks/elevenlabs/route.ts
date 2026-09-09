/**
 * POST /api/webhooks/elevenlabs — the post-call webhook. This is where a voice session is reconciled:
 * the real duration replaces the 240 s reservation, the ElevenLabs minutes land in the spend ledger,
 * and every agent turn is re-linted so a red line that slipped past the streaming guard is at least
 * recorded (docs/ARCHITECTURE.md 4.3 step 10).
 *
 * Verification uses the vendor's own `webhooks.constructEvent`, which checks the `t=…,v0=…` HMAC in the
 * `ElevenLabs-Signature` header against the RAW body and rejects timestamps older than 30 minutes. The
 * body is therefore read as text, never as JSON, before verification.
 *
 * Everything after verification is idempotent: `settle_voice_session` only settles a session whose
 * duration is still null, and the spend row carries an idempotency key, so a replay is a no-op.
 */
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { dbOrNull } from "@/app/api/_lib/db";
import { settleVoiceSession } from "@/lib/db/budgets";
import { getSessionByConversationId, insertSpendEvent, insertTurn, updateSessionFlags } from "@/lib/db/queries";
import { guard } from "@/app/api/_lib/brain";
import { fail, json } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** ElevenLabs Creator overage rate; used only to keep the ledger honest between invoices. */
const USD_PER_MINUTE = 0.08;

interface PostCallEvent {
  type?: unknown;
  data?: {
    conversation_id?: unknown;
    agent_id?: unknown;
    status?: unknown;
    metadata?: { call_duration_secs?: unknown; cost?: unknown };
    transcript?: unknown;
  };
}

interface TranscriptEntry {
  role?: unknown;
  message?: unknown;
  language?: unknown;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET ?? "";
  const signature = request.headers.get("elevenlabs-signature");
  if (secret === "" || signature === null) return fail("unauthorized", 401);

  const rawBody = await request.text();

  let event: PostCallEvent;
  try {
    const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY ?? "" });
    event = (await client.webhooks.constructEvent(rawBody, signature, secret)) as PostCallEvent;
  } catch {
    return fail("bad_signature", 401);
  }

  if (event.type !== "post_call_transcription") return json({ ok: true, ignored: true });

  const data = event.data ?? {};
  const conversationId = typeof data.conversation_id === "string" ? data.conversation_id : null;
  if (conversationId === null) return json({ ok: true, ignored: true });

  const db = dbOrNull();
  if (db === null) return json({ ok: true, deferred: true });

  const session = await getSessionByConversationId(db, conversationId);
  if (session === null) return json({ ok: true, unknown_session: true });

  const durationSec = Math.max(0, Math.round(asNumber(data.metadata?.call_duration_secs)));
  const costUsd = asNumber(data.metadata?.cost);
  const minutes = durationSec / 60;
  const ledgerUsd = costUsd > 0 ? costUsd : Math.round(minutes * USD_PER_MINUTE * 1e6) / 1e6;

  await settleVoiceSession(db, { sessionId: session.id, durationSec, costUsd: ledgerUsd });

  await insertSpendEvent(db, {
    sessionId: session.id,
    vendor: "elevenlabs",
    kind: "voice_minutes",
    units: Math.round(minutes * 1e4) / 1e4,
    usd: ledgerUsd,
    idempotencyKey: `elevenlabs:post_call:${conversationId}`,
    settled: true,
  });

  // Red-line audit over the agent's own turns, and the transcript rows (pseudonymised, 30 days).
  const entries: TranscriptEntry[] = Array.isArray(data.transcript)
    ? (data.transcript as TranscriptEntry[])
    : [];
  const rules = new Set<string>();
  let idx = 0;

  for (const entry of entries) {
    const role = entry.role === "agent" ? "agent" : "user";
    const content = typeof entry.message === "string" ? entry.message : null;
    if (role === "agent" && content !== null) {
      try {
        for (const rule of guard().lint(content)) rules.add(rule);
      } catch {
        /* the guard is not available in every environment; the audit is best effort */
      }
    }
    try {
      await insertTurn(db, {
        sessionId: session.id,
        idx: idx++,
        role,
        lang: typeof entry.language === "string" ? entry.language : null,
        content,
      });
    } catch {
      /* best effort */
    }
  }

  await updateSessionFlags(db, session.id, {
    flags: { ...session.flags, audit_rules: [...rules], audited_at: new Date().toISOString() },
  });

  return json({ ok: true });
}

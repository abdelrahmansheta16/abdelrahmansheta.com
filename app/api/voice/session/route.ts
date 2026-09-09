/**
 * POST /api/voice/session — mint a WebRTC conversation token, but only after the caps say yes.
 *
 * This is the money route: every token it issues can cost up to four minutes of ElevenLabs time. It
 * therefore fails CLOSED. No database, no reservation, no token. The order below is deliberate and
 * matches docs/PLAN.md 4.3 step 2 — BotID, same-origin, cookie, reserve, then and only then talk to
 * ElevenLabs, so a rejected visitor never causes an upstream request.
 *
 * The client must already hold a live microphone track when it calls this (invariant 6); that is
 * enforced in the browser, because a server cannot see a MediaStream.
 *
 * Assumed upstream response shape (to be confirmed in Phase 2, docs/PLAN.md 10.4):
 *   GET https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=…   with header `xi-api-key`
 *   200 { "token": "<jwt>", "conversation_id"?: "conv_…" }
 * Both `token` and the legacy `conversation_token` spelling are accepted; `conversation_id` is stored
 * on the session row when present, because it — not any client value — is the session identity.
 */
import { NextResponse } from "next/server";
import { dbOrNull } from "@/app/api/_lib/db";
import { reserveVoiceSession } from "@/lib/db/budgets";
import { attachConversationId, updateSessionFlags } from "@/lib/db/queries";
import {
  VISITOR_COOKIE,
  fail,
  ipHash,
  isHuman,
  isSameOrigin,
  json,
  newVisitorCookie,
  requiredEnv,
  setVisitorCookie,
  verifyVisitorCookie,
  visitorHash,
} from "@/app/api/_lib/http";
import { LOCALES, type Locale } from "@/lib/tools/schema";
import type { SessionGrant } from "@/lib/voice/VoiceSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const RESERVE_SECONDS = 240;
const TOKEN_TTL_SECONDS = 120;

interface TokenResponse {
  token?: unknown;
  conversation_token?: unknown;
  conversation_id?: unknown;
}

function readCookie(request: Request, name: string): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isHuman())) return fail("bot_detected", 403);
  if (!isSameOrigin(request)) return fail("bad_origin", 403);

  const missing = requiredEnv("ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID");
  if (missing.length > 0) return json({ ok: false, reason: "voice_unavailable" }, 503);

  const db = dbOrNull();
  if (db === null) return json({ ok: false, reason: "voice_unavailable" }, 503);

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const locale: Locale =
    typeof body.locale === "string" && (LOCALES as readonly string[]).includes(body.locale)
      ? (body.locale as Locale)
      : "en";

  const secret = process.env.VISITOR_COOKIE_SECRET ?? "";
  const existing = verifyVisitorCookie(readCookie(request, VISITOR_COOKIE), secret);
  const minted = existing === null && secret !== "" ? newVisitorCookie(secret) : null;
  const visitorId = existing ?? minted?.id ?? null;

  const reservation = await reserveVoiceSession(db, {
    ipHash: ipHash(request),
    visitorHash: visitorHash(visitorId),
    locale,
    reserveSeconds: RESERVE_SECONDS,
  });

  if (!reservation.ok) {
    const status = reservation.reason === "unavailable" ? 503 : 429;
    const response = json({ ok: false, reason: reservation.reason }, status);
    return minted === null ? response : setVisitorCookie(response, minted.value);
  }

  const agentId = process.env.ELEVENLABS_AGENT_ID ?? "";
  let payload: TokenResponse;
  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" }, cache: "no-store" },
    );
    if (!upstream.ok) throw new Error(`elevenlabs ${String(upstream.status)}`);
    payload = (await upstream.json()) as TokenResponse;
  } catch {
    await updateSessionFlags(db, reservation.sessionId, {
      ended_at: new Date().toISOString(),
      ended_reason: "token_mint_failed",
      duration_secs: 0,
    });
    const response = json({ ok: false, reason: "voice_unavailable" }, 503);
    return minted === null ? response : setVisitorCookie(response, minted.value);
  }

  const token =
    typeof payload.token === "string"
      ? payload.token
      : typeof payload.conversation_token === "string"
        ? payload.conversation_token
        : null;
  if (token === null) {
    const response = json({ ok: false, reason: "voice_unavailable" }, 503);
    return minted === null ? response : setVisitorCookie(response, minted.value);
  }

  if (typeof payload.conversation_id === "string" && payload.conversation_id !== "") {
    await attachConversationId(db, reservation.sessionId, payload.conversation_id);
  }

  const grant: SessionGrant = {
    provider: "elevenlabs",
    sessionId: reservation.sessionId,
    token,
    maxSeconds: RESERVE_SECONDS,
    expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
  };

  const response: NextResponse = json(grant, 200);
  return minted === null ? response : setVisitorCookie(response, minted.value);
}

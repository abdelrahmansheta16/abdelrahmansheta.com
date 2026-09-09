/**
 * The checks every visitor-triggered side effect shares: bot check, honeypot, a session that exists and
 * is under 24 hours old. Uniqueness per session is enforced by a UNIQUE constraint in the database, not
 * here, so two racing submits cannot both win.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionById, isSessionFresh, type SessionRow } from "@/lib/db/queries";
import { honeypotTripped, isHuman } from "@/app/api/_lib/http";

export type PreflightResult =
  | { ok: true; session: SessionRow; db: SupabaseClient }
  | { ok: false; reason: string; status: number };

export async function preflight(
  db: SupabaseClient | null,
  body: Record<string, unknown>,
): Promise<PreflightResult> {
  if (!(await isHuman())) return { ok: false, reason: "bot_detected", status: 403 };
  if (honeypotTripped(body)) return { ok: false, reason: "bot_detected", status: 403 };
  if (db === null) return { ok: false, reason: "unavailable", status: 503 };

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  if (sessionId === null || sessionId === "") return { ok: false, reason: "no_session", status: 400 };

  const session = await getSessionById(db, sessionId);
  if (session === null) return { ok: false, reason: "no_session", status: 400 };
  if (!isSessionFresh(session)) return { ok: false, reason: "session_expired", status: 410 };

  return { ok: true, session, db };
}

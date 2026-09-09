/** POST /api/voice/probe — one row per microphone feature-probe outcome. This is how we learn whether
 *  the LinkedIn in-app browser actually works, instead of guessing from user agents (docs/PLAN.md 4.3).
 *  Best effort: telemetry must never make the Talk button feel slower or fail. */
import { dbOrNull } from "@/app/api/_lib/db";
import { insertProbeEvent } from "@/lib/db/queries";
import { json, trimmedString } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: true });
  }

  const uaClass = trimmedString(body.ua_class, 40);
  const outcome = trimmedString(body.outcome, 40);
  if (uaClass === null || outcome === null) return json({ ok: true });

  const db = dbOrNull();
  if (db !== null) {
    try {
      await insertProbeEvent(db, {
        uaClass,
        osVersion: trimmedString(body.os_version, 40),
        outcome,
      });
    } catch {
      /* best effort */
    }
  }
  return json({ ok: true });
}

/** POST /api/voice/probe — one row per microphone feature-probe outcome. This is how we learn whether
 *  the LinkedIn in-app browser actually works, instead of guessing from user agents (docs/ARCHITECTURE.md 4.3).
 *  Best effort: telemetry must never make the Talk button feel slower or fail. */
import { dbOrNull } from "@/app/api/_lib/db";
import { consumeRateSlot, insertProbeEvent } from "@/lib/db/queries";
import { ipHash, isHuman, isSameOrigin, json, trimmedString } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** Probe rows a single visitor can write per UTC day. A real session writes one. */
const DAILY_PROBE_LIMIT = 20;

export async function POST(request: Request): Promise<Response> {
  // Every rejection below still answers `{ ok: true }`: this is telemetry, and the contract is that
  // it can never make the Talk button feel slower or fail. It drops the write, it does not error.
  //
  // The route had none of these checks, so an anonymous caller could insert unbounded rows into
  // probe_events. The columns are length-capped so each row is small, but the volume was not, and
  // the database is on a free tier with a hard storage ceiling. The two gates mirror
  // /api/voice/session, which is the same trust boundary.
  if (!(await isHuman())) return json({ ok: true });
  if (!isSameOrigin(request)) return json({ ok: true });

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
    if (!(await consumeRateSlot(db, "probe", ipHash(request), DAILY_PROBE_LIMIT))) {
      return json({ ok: true });
    }
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

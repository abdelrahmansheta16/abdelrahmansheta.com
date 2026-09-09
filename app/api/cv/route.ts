/** GET /api/cv — redirect to the public CV. Rate limited per ip_hash so it cannot be used as a
 *  bandwidth amplifier; the limit is best-effort and never blocks when the database is down. */
import { NextResponse } from "next/server";
import { dbOrNull } from "@/app/api/_lib/db";
import { consumeRateSlot } from "@/lib/db/queries";
import { fail, ipHash } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const DAILY_LIMIT = 5;

export async function GET(request: Request): Promise<Response> {
  const allowed = await consumeRateSlot(dbOrNull(), "cv", ipHash(request), DAILY_LIMIT);
  if (!allowed) return fail("rate_limited", 429);
  return NextResponse.redirect(new URL("/cv.pdf", request.url), 302);
}

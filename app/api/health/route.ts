/** Liveness probe for the external uptime monitor. No database, no secrets, no side effects. */
import { CORPUS } from "@/app/api/_lib/brain";
import { json } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return json({ ok: true, corpus_version: CORPUS.version });
}

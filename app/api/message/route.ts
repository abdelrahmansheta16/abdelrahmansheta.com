/**
 * POST /api/message — the visitor types a message and clicks send; it is e-mailed to the owner.
 * The recipient is OWNER_EMAIL, hard-coded from the environment: the model cannot name a recipient and
 * cannot write the body (invariant 7). One message per session, enforced by unique(session_id).
 */
import { dbOrNull } from "@/app/api/_lib/db";
import { preflight } from "@/app/api/_lib/sideEffects";
import { canSendEmail } from "@/lib/db/budgets";
import { insertMessageIn, updateSessionFlags } from "@/lib/db/queries";
import { messageTemplate, send } from "@/app/api/_lib/email";
import { fail, isEmail, json, trimmedString } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("bad_request", 400);
  }

  const pre = await preflight(dbOrNull(), body);
  if (!pre.ok) return fail(pre.reason, pre.status);

  const name = trimmedString(body.name, 120);
  const message = trimmedString(body.message, 4000);
  const email = body.email;
  if (name === null || message === null || !isEmail(email)) return fail("invalid_input", 400);

  const owner = process.env.OWNER_EMAIL ?? "";
  if (owner === "") return fail("email_unavailable", 503);

  const stored = await insertMessageIn(pre.db, {
    sessionId: pre.session.id,
    name,
    email,
    body: message,
  });
  if (!stored) return fail("already_sent", 409);

  if (!(await canSendEmail(pre.db, "message"))) return fail("email_capped", 429);

  const result = await send({
    to: owner,
    subject: `Message from ${name} via abdelrahmansheta.com`,
    text: messageTemplate({ name, email, body: message, sessionId: pre.session.id }),
    replyTo: email,
  });
  if (!result.ok) return fail(result.reason ?? "email_failed", 502);

  await updateSessionFlags(pre.db, pre.session.id, { message_left: true });
  return json({ ok: true });
}

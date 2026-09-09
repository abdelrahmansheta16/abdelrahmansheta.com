/**
 * POST /api/lead — the visitor fills in the small lead card themselves after the agent offered it once.
 * The row is retained for 180 days; the owner gets a notification. Offering the card twice is prevented
 * upstream by the tool policy, and a second submit is prevented here by unique(session_id).
 */
import { dbOrNull } from "@/app/api/_lib/db";
import { preflight } from "@/app/api/_lib/sideEffects";
import { canSendEmail } from "@/lib/db/budgets";
import { insertLead, updateSessionFlags } from "@/lib/db/queries";
import { leadTemplate, send } from "@/app/api/_lib/email";
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
  const email = body.email;
  if (name === null || !isEmail(email)) return fail("invalid_input", 400);
  if (body.consent !== true) return fail("consent_required", 400);

  const company = trimmedString(body.company, 160);
  const note = trimmedString(body.note, 500);

  const stored = await insertLead(pre.db, {
    sessionId: pre.session.id,
    name,
    company,
    email,
    note,
  });
  if (!stored) return fail("already_sent", 409);

  await updateSessionFlags(pre.db, pre.session.id, { lead_captured: true });

  // The owner notification is a nicety: the lead row is already safe, so a capped mailbox is not an error.
  const owner = process.env.OWNER_EMAIL ?? "";
  if (owner !== "" && (await canSendEmail(pre.db, "lead"))) {
    await send({
      to: owner,
      subject: `Lead: ${name}${company === null ? "" : ` (${company})`}`,
      text: leadTemplate({ name, company, email, note, sessionId: pre.session.id }),
      replyTo: email,
    });
  }

  return json({ ok: true });
}

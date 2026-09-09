/**
 * POST /api/summary — e-mail the visitor a summary of their own conversation, once, with consent.
 *
 * The summary text is generated on the server from `transcript_turns` with a fixed instruction, never
 * from anything the client sent, and it must pass `guard.lint` before it is allowed out. That check
 * fails CLOSED: if the guard is unavailable or reports any rule, nothing is sent. The address is used
 * to address the envelope and is then discarded — only sha256(email) is stored (docs/ARCHITECTURE.md 4.5).
 */
import { dbOrNull } from "@/app/api/_lib/db";
import { preflight } from "@/app/api/_lib/sideEffects";
import { canSendEmail } from "@/lib/db/budgets";
import { insertSummaryOut, listTurns, markSummarySent } from "@/lib/db/queries";
import { send, summaryTemplate } from "@/app/api/_lib/email";
import { brainCorpus, guard, providers } from "@/app/api/_lib/brain";
import { runBrain, CORPUS_PLACEHOLDER } from "@/lib/brain/adapter";
import { fail, isEmail, json, sha256Hex } from "@/app/api/_lib/http";
import type { ChatMessage } from "@/lib/brain/types";
import { LOCALES, type Locale } from "@/lib/tools/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INSTRUCTION =
  "Write a summary of the conversation above for the visitor, in at most 200 words. " +
  "Cover only what was actually said. Use plain sentences, no markdown headings, no bullet symbols. " +
  "Do not invent facts, do not add contact details, do not add a sign-off.";

const MAX_SUMMARY_CHARS = 2000;

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("bad_request", 400);
  }

  const pre = await preflight(dbOrNull(), body);
  if (!pre.ok) return fail(pre.reason, pre.status);

  const email = body.email;
  if (!isEmail(email)) return fail("invalid_input", 400);
  if (body.consent !== true) return fail("consent_required", 400);

  const locale: Locale =
    typeof body.locale === "string" && (LOCALES as readonly string[]).includes(body.locale)
      ? (body.locale as Locale)
      : pre.session.locale_initial;

  const stored = await insertSummaryOut(pre.db, {
    sessionId: pre.session.id,
    emailSha256: sha256Hex(email.toLowerCase()),
  });
  if (!stored) return fail("already_sent", 409);

  const turns = await listTurns(pre.db, pre.session.id);
  if (turns.length === 0) return fail("nothing_to_summarise", 400);

  const provider = providers();
  if (provider === null) return fail("llm_unavailable", 503);

  const transcript = turns
    .filter((t) => t.content !== null && t.content !== "")
    .map((t) => `${t.role === "agent" ? "Abdelrahman" : "Visitor"}: ${t.content ?? ""}`)
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: CORPUS_PLACEHOLDER },
    { role: "user", content: `${transcript}\n\n---\n${INSTRUCTION}` },
  ];

  let summary = "";
  try {
    for await (const event of runBrain({
      channel: "text",
      messages,
      flags: {
        sessionId: pre.session.id,
        channel: "text",
        langHint: locale,
        leadCaptured: pre.session.lead_captured,
        summarySent: true,
        messageLeft: pre.session.message_left,
        guardHits: pre.session.guard_hits,
        remainingSeconds: null,
        greetingPlayed: true,
      },
      locale,
      providers: provider,
      guard: guard(),
      corpus: brainCorpus(),
      signal: request.signal,
    })) {
      if (event.type === "text") summary += event.delta;
      if (summary.length > MAX_SUMMARY_CHARS) break;
    }
  } catch {
    return fail("summary_failed", 502);
  }

  summary = summary.trim().slice(0, MAX_SUMMARY_CHARS);
  if (summary.length === 0) return fail("summary_failed", 502);

  // Fail closed: any lint hit, or a guard that cannot run at all, stops the send.
  try {
    if (guard().lint(summary).length > 0) return fail("guard_blocked", 422);
  } catch {
    return fail("guard_unavailable", 503);
  }

  if (!(await canSendEmail(pre.db, "summary"))) return fail("email_capped", 429);

  const result = await send({
    to: email,
    subject: "Your conversation with Abdelrahman's AI",
    text: summaryTemplate(summary),
  });
  if (!result.ok) return fail(result.reason ?? "email_failed", 502);

  await markSummarySent(pre.db, pre.session.id);
  return json({ ok: true });
}

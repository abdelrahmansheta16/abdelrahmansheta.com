/**
 * POST /api/chat — the text console. Same brain, same corpus, same guard as the voice path; only the
 * wire format differs (AI SDK 7 UI-message stream for `useChat` instead of OpenAI SSE).
 *
 * Text is the fallback channel: when voice is capped, the database is paused or ElevenLabs is down, this
 * route must keep answering. So every database call here is best-effort and a failure degrades to
 * "no session row, no logging" rather than an error page (docs/PLAN.md 4.4).
 *
 * The tool catalogue is client-side only — no tool in this product has a server side effect, and every
 * e-mail or download happens after a human click on a fixed-recipient form (invariant 7).
 */
import { createUIMessageStream, createUIMessageStreamResponse, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { runBrain } from "@/lib/brain/adapter";
import { estimateUsd, loadFlags, recordGuardEvent, recordLlmCall, recordSpend, recordTurn } from "@/lib/brain/session";
import { brainCorpus, guard, providers, CORPUS } from "@/app/api/_lib/brain";
import { dbOrNull } from "@/app/api/_lib/db";
import { fail, ipHash, isHuman, visitorHash, verifyVisitorCookie, VISITOR_COOKIE } from "@/app/api/_lib/http";
import { consumeRateSlot, createTextSession } from "@/lib/db/queries";
import { LOCALES, type Locale } from "@/lib/tools/schema";
import { toChatMessages } from "@/app/api/_lib/messages";
import type { ChatMessage, Usage } from "@/lib/brain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAILY_MESSAGE_LIMIT = 60;

interface ChatBody {
  messages?: unknown;
  locale?: unknown;
  sessionId?: unknown;
}

function localeOf(value: unknown): Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
    ? (value as Locale)
    : "en";
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isHuman())) return fail("bot_detected", 403);

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return fail("bad_request", 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) return fail("bad_request", 400);

  const provider = providers();
  if (provider === null) return fail("llm_unavailable", 503);

  const db = dbOrNull();
  const ip = ipHash(request);
  if (!(await consumeRateSlot(db, "chat", ip, DAILY_MESSAGE_LIMIT))) return fail("rate_limited", 429);

  const locale = localeOf(body.locale);

  // First message of a conversation creates the session row (consent_at is set by the insert).
  let sessionId = typeof body.sessionId === "string" && body.sessionId !== "" ? body.sessionId : null;
  if (sessionId === null && db !== null) {
    const cookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${VISITOR_COOKIE}=`))
      ?.slice(VISITOR_COOKIE.length + 1);
    const visitorId = verifyVisitorCookie(cookie, process.env.VISITOR_COOKIE_SECRET ?? "");
    try {
      sessionId = await createTextSession(db, {
        ipHash: ip,
        visitorHash: visitorHash(visitorId),
        locale,
        corpusVersion: CORPUS.version,
      });
    } catch {
      sessionId = null;
    }
  }

  const flags = await loadFlags(db, { sessionId, channel: "text" });
  flags.greetingPlayed = true; // the text console shows the disclosure in the UI, not in a turn

  const modelMessages = await convertToModelMessages(body.messages as UIMessage[]);
  const history = toChatMessages(modelMessages);
  const messages: ChatMessage[] =
    history[0]?.role === "system" ? history : [{ role: "system", content: "" }, ...history];

  const lastUser = [...history].reverse().find((m) => m.role === "user");
  if (sessionId !== null && lastUser?.content != null) {
    await recordTurn(db, { sessionId, role: "user", lang: locale, content: lastUser.content });
  }

  const startedAt = Date.now();
  let ttftMs: number | null = null;
  let usage: Usage | undefined;
  let finishReason = "stop";
  let assistantText = "";

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const textId = crypto.randomUUID();
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id: textId });

      for await (const event of runBrain({
        channel: "text",
        messages,
        flags,
        locale,
        providers: provider,
        guard: guard(),
        corpus: brainCorpus(),
        signal: request.signal,
      })) {
        switch (event.type) {
          case "text":
            if (ttftMs === null) ttftMs = Date.now() - startedAt;
            assistantText += event.delta;
            writer.write({ type: "text-delta", id: textId, delta: event.delta });
            break;
          case "tool_call":
            writer.write({
              type: "tool-input-available",
              toolCallId: event.id,
              toolName: event.name,
              input: JSON.parse(event.arguments) as unknown,
            });
            break;
          case "finish":
            finishReason = event.reason;
            usage = event.usage;
            break;
          case "guard":
            await recordGuardEvent(db, {
              sessionId: flags.sessionId,
              rule: event.rule,
              sha256: event.sha256,
              channel: "text",
            });
            break;
          default:
            break;
        }
      }

      writer.write({ type: "text-end", id: textId });
    },
    onFinish: async () => {
      const cost = estimateUsd(provider.name, {
        cacheHitTokens: usage?.cacheHitTokens ?? 0,
        cacheMissTokens: usage?.cacheMissTokens ?? 0,
        completionTokens: usage?.completionTokens ?? 0,
      });
      await recordLlmCall(db, {
        sessionId: flags.sessionId,
        provider: provider.name,
        model: provider.model,
        channel: "text",
        ttftMs,
        cacheHitTokens: usage?.cacheHitTokens ?? 0,
        cacheMissTokens: usage?.cacheMissTokens ?? 0,
        outputTokens: usage?.completionTokens ?? 0,
        finishReason,
        usd: cost,
        corpusVersion: CORPUS.version,
      });
      await recordSpend(db, {
        sessionId: flags.sessionId,
        vendor: provider.name,
        kind: "llm_text_turn",
        units: usage?.completionTokens ?? 0,
        usd: cost,
        settled: true,
      });
      if (flags.sessionId !== null && assistantText.length > 0) {
        await recordTurn(db, {
          sessionId: flags.sessionId,
          role: "agent",
          lang: locale,
          content: assistantText,
          ttftMs,
        });
      }
    },
    onError: () => "The answer stopped early. Try asking again.",
  });

  const response = createUIMessageStreamResponse({ stream });
  if (sessionId !== null) response.headers.set("x-session-id", sessionId);
  return response;
}

/**
 * POST /api/llm/v1/chat/completions — the ElevenLabs custom-LLM adapter.
 *
 * ElevenLabs speaks OpenAI Chat Completions over SSE, so this route looks like OpenAI on the outside
 * and is the brain on the inside. Four things matter here and nowhere else:
 *   - the shared secret is compared in constant time (a timing oracle on X-Agent-Key would let anyone
 *     spend our LLM budget);
 *   - `X-Conversation-Id` is the session identity, not anything the client sent;
 *   - a client disconnect (barge-in) aborts the upstream provider fetch instead of paying for tokens
 *     nobody will hear;
 *   - the response ALWAYS ends with `data: [DONE]`, including on error, because a truncated SSE stream
 *     leaves the agent hanging until its own timeout.
 * `user` / `user_id` are never forwarded upstream (invariant 8) — see lib/llm/provider.ts.
 */
import { runBrain, type BrainEvent } from "@/lib/brain/adapter";
import { createSseEncoder } from "@/lib/brain/sse";
import { estimateUsd, loadFlags, recordGuardEvent, recordLlmCall, recordSpend } from "@/lib/brain/session";
import { brainCorpus, guard, providers, ELEVENLABS_SYSTEM_TOOLS, CORPUS } from "@/app/api/_lib/brain";
import { dbOrNull } from "@/app/api/_lib/db";
import { fail, safeEqual } from "@/app/api/_lib/http";
import type { ChatMessage, Usage } from "@/lib/brain/types";
import type { Locale } from "@/lib/tools/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface AdapterBody {
  model?: unknown;
  messages?: unknown;
  stream?: unknown;
}

function asMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: ChatMessage[] = [];
  for (const raw of value) {
    if (raw === null || typeof raw !== "object") return null;
    const m = raw as Record<string, unknown>;
    const role = m.role;
    if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") return null;
    out.push({
      role,
      content: typeof m.content === "string" ? m.content : null,
      ...(typeof m.name === "string" ? { name: m.name } : {}),
      ...(typeof m.tool_call_id === "string" ? { tool_call_id: m.tool_call_id } : {}),
    });
  }
  return out;
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.LLM_ADAPTER_SECRET ?? "";
  const presented = request.headers.get("x-agent-key") ?? "";
  if (secret === "" || !safeEqual(presented, secret)) return fail("unauthorized", 401);

  let body: AdapterBody;
  try {
    body = (await request.json()) as AdapterBody;
  } catch {
    return fail("bad_request", 400);
  }

  const messages = asMessages(body.messages);
  if (messages === null) return fail("bad_request", 400);

  const provider = providers();
  if (provider === null) return fail("llm_unavailable", 503);

  const conversationId = request.headers.get("x-conversation-id");
  const db = dbOrNull();
  const flags = await loadFlags(db, { conversationId, channel: "voice" });
  const locale: Locale = flags.langHint;

  const model = typeof body.model === "string" ? body.model : "portfolio-brain-v1";
  const encoder = createSseEncoder({ id: `chatcmpl-${crypto.randomUUID()}`, model });

  // The provider is aborted when the visitor barges in and ElevenLabs closes the request.
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => { abort.abort(); });

  const startedAt = Date.now();
  let ttftMs: number | null = null;
  let toolIndex = 0;
  let usage: Usage | undefined;
  let finishReason = "stop";
  let assistantText = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const te = new TextEncoder();
      const send = (chunk: string): void => { controller.enqueue(te.encode(chunk)); };

      send(encoder.start());
      try {
        const events: AsyncIterable<BrainEvent> = runBrain({
          channel: "voice",
          messages,
          tools: ELEVENLABS_SYSTEM_TOOLS,
          flags,
          locale,
          providers: provider,
          guard: guard(),
          corpus: brainCorpus(),
          signal: abort.signal,
        });

        for await (const event of events) {
          switch (event.type) {
            case "text":
              if (ttftMs === null) ttftMs = Date.now() - startedAt;
              assistantText += event.delta;
              send(encoder.text(event.delta));
              break;
            case "tool_call":
              if (ttftMs === null) ttftMs = Date.now() - startedAt;
              send(
                encoder.toolCall({
                  index: toolIndex++,
                  id: event.id,
                  name: event.name,
                  arguments: event.arguments,
                }),
              );
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
                channel: "voice",
              });
              break;
            case "error":
              finishReason = "error";
              break;
            default:
              break;
          }
        }
      } catch {
        finishReason = "error";
      } finally {
        send(encoder.finish(finishReason === "error" ? "stop" : (finishReason as "stop")));
        send(encoder.done());
        controller.close();
      }

      const cost = estimateUsd(provider.name, {
        cacheHitTokens: usage?.cacheHitTokens ?? 0,
        cacheMissTokens: usage?.cacheMissTokens ?? 0,
        completionTokens: usage?.completionTokens ?? 0,
      });
      await recordLlmCall(db, {
        sessionId: flags.sessionId,
        provider: provider.name,
        model: provider.model,
        channel: "voice",
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
        kind: "llm_voice_turn",
        units: usage?.completionTokens ?? 0,
        usd: cost,
        settled: true,
      });
      if (flags.sessionId !== null && assistantText.length > 0) {
        const { recordTurn } = await import("@/lib/brain/session");
        await recordTurn(db, {
          sessionId: flags.sessionId,
          role: "agent",
          lang: locale,
          content: assistantText,
          ttftMs,
        });
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

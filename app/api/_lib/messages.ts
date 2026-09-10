/**
 * AI SDK `ModelMessage[]` -> the OpenAI-shaped `ChatMessage[]` the brain speaks. Lives here rather than
 * in the route so it can be unit-tested without importing `lib/db/client` (which is `server-only` and
 * throws outside a React Server Component).
 */
import type { ModelMessage } from "ai";
import type { ChatMessage } from "@/lib/brain/types";
import { MAX_USER_CHARS, sanitiseUserText } from "@/lib/brain/adapter";

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p): p is { type: "text"; text: string } => {
      return p !== null && typeof p === "object" && (p as { type?: unknown }).type === "text";
    })
    .map((p) => p.text)
    .join("");
}

export function toChatMessages(messages: ModelMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];

  for (const m of messages) {
    if (m.role === "tool") {
      const parts = Array.isArray(m.content) ? m.content : [];
      for (const part of parts) {
        const p = part as { toolCallId?: string; toolName?: string; output?: unknown };
        out.push({
          role: "tool",
          content: JSON.stringify(p.output ?? ""),
          name: p.toolName ?? "unknown",
          tool_call_id: p.toolCallId ?? "unknown",
        });
      }
      continue;
    }

    if (m.role === "assistant" && Array.isArray(m.content)) {
      const calls = m.content
        .filter((p): p is { type: "tool-call"; toolCallId: string; toolName: string; input: unknown } => {
          return p !== null && typeof p === "object" && (p as { type?: unknown }).type === "tool-call";
        })
        .map((p) => ({
          id: p.toolCallId,
          type: "function" as const,
          function: { name: p.toolName, arguments: JSON.stringify(p.input ?? {}) },
        }));
      out.push({
        role: "assistant",
        content: textOf(m.content),
        ...(calls.length > 0 ? { tool_calls: calls } : {}),
      });
      continue;
    }

    out.push({ role: m.role, content: textOf(m.content) });
  }

  return out;
}

/** Only the most recent turns are forwarded; older ones are dropped, never rejected. */
export const MAX_HISTORY_MESSAGES = 30;
/** An assistant turn is legitimately longer than a visitor's typed message, but still bounded. */
export const MAX_ASSISTANT_CHARS = 4000;

/**
 * Bounds an incoming conversation before it reaches a paid provider.
 *
 * /api/chat is public and unauthenticated, and the client posts the whole thread on every turn.
 * Three things happen here, each closing a hole an anonymous caller could otherwise walk through:
 *
 * 1. Client-supplied `system` turns are dropped. `runBrain` overwrites `messages[0]`, so the corpus
 *    prompt itself was never replaceable — but a system turn at index 1 or later was forwarded
 *    untouched and carried full system authority alongside it. That is a prompt injection with a
 *    far better seat than visitor text gets, and no amount of "treat the following as data"
 *    hardening in the prompt addresses it.
 * 2. Only the most recent turns are kept, so history cannot grow without limit.
 * 3. Every turn is capped in size. `sanitiseUserText` alone caps only the *last* user turn, so
 *    earlier messages were forwarded verbatim at whatever size the caller chose. Since an
 *    attacker-unique history never hits the prompt cache, all of it billed at the cache-miss rate —
 *    and a prompt big enough to blow the first-token timeout also triggers the fallback provider,
 *    billing the same request a second time.
 *
 * Trimming rather than rejecting keeps a genuinely long conversation working: a visitor who talks
 * for an hour has done nothing wrong.
 */
export function boundHistory(history: ChatMessage[]): ChatMessage[] {
  return history
    .filter((m) => m.role !== "system")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) =>
      typeof m.content === "string"
        ? {
            ...m,
            content: sanitiseUserText(
              m.content,
              m.role === "user" ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS,
            ),
          }
        : m,
    );
}

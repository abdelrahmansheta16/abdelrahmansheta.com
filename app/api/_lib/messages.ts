/**
 * AI SDK `ModelMessage[]` -> the OpenAI-shaped `ChatMessage[]` the brain speaks. Lives here rather than
 * in the route so it can be unit-tested without importing `lib/db/client` (which is `server-only` and
 * throws outside a React Server Component).
 */
import type { ModelMessage } from "ai";
import type { ChatMessage } from "@/lib/brain/types";

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

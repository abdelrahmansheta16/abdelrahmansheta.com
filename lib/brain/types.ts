/** Shared types for the brain: the same module serves /api/llm (ElevenLabs custom LLM) and /api/chat (text). */
import type { Locale } from "@/lib/tools/schema";

export type Channel = "voice" | "text";

export interface SessionFlags {
  sessionId: string | null;          // sessions.id; null when the session row could not be resolved
  channel: Channel;
  langHint: Locale;                  // from language_detection history, Arabic-script ratio, or start locale
  leadCaptured: boolean;
  summarySent: boolean;
  messageLeft: boolean;
  guardHits: number;
  remainingSeconds: number | null;
  greetingPlayed: boolean;           // invariant 10: repeat the disclosure in turn 1 if false
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}

export interface OpenAITool {
  type: "function";
  function: { name: string; description?: string; parameters?: unknown };
}

export interface ProviderRequest {
  messages: ChatMessage[];
  tools: OpenAITool[];
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
}

/** One provider call, streamed. Implementations: DeepSeek direct (primary), Anthropic Haiku (failover). */
export interface ProviderAdapter {
  readonly name: "deepseek" | "anthropic";
  readonly model: string;
  stream(req: ProviderRequest): AsyncIterable<ProviderEvent>;
}

export type ProviderEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; arguments: string }
  | { type: "finish"; reason: "stop" | "tool_calls" | "length" | "content_filter" | "error"; usage?: Usage }
  | { type: "error"; error: Error };

export interface Usage {
  promptTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  completionTokens: number;
}

export type GuardRule = "phone" | "email" | "salary" | "job_seeking" | "confidential" | "canary" | "topic" | "json_shape";

export interface GuardVerdict {
  ok: boolean;
  rule?: GuardRule;
  replacement?: string;              // the refusal template in the session language
}

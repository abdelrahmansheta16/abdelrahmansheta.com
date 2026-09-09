/**
 * Provider adapters over the OpenAI-compatible shape. Everything upstream speaks `ProviderRequest` /
 * `ProviderEvent`, so swapping a vendor is a config change (docs/ARCHITECTURE.md 8).
 *
 * Two rules are enforced here and nowhere else, and they turn out to apply to every OpenAI-compatible
 * provider this project uses:
 *   - `thinking: {type:'disabled'}` on every request. Reasoning is ON by default on both DeepSeek and
 *     Qwen. Measured from Cairo, leaving it on takes Qwen from 1.4 s to 27.6 s to first token, and with
 *     a 220-token budget the reasoning consumes the whole allowance and the visitor gets nothing back.
 *   - no `user` / `user_id` field, ever — it isolates the provider's KV cache and destroys the prefix
 *     hit rate (invariant 8).
 * Neither is expressible through the AI SDK's typed options, so the request body is rewritten in a
 * wrapping `fetch`. `prepareCompatibleBody` is exported so the rule is unit-testable without a network.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, jsonSchema, type ModelMessage, type ToolSet, type LanguageModel } from "ai";
import type {
  ChatMessage,
  OpenAITool,
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest,
  Usage,
} from "@/lib/brain/types";

export const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
export const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5";
export const QWEN_DEFAULT_MODEL = "qwen3.8-flash";

/**
 * Alibaba Cloud Model Studio, international region. It serves both Qwen and DeepSeek, which is why the
 * primary can run DeepSeek V4 Flash without visitor text leaving for the PRC. The China endpoint
 * (dashscope.aliyuncs.com) rejects an international key outright, so the two are not interchangeable.
 */
export const ALIBABA_INTL_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
export const DEFAULT_FIRST_TOKEN_TIMEOUT_MS = 1500;

type FinishReason = "stop" | "tool_calls" | "length" | "content_filter" | "error";

/** Thrown when the primary produced no output token within the first-token budget. */
export class FirstTokenTimeoutError extends Error {
  constructor(ms: number) {
    super(`no first token within ${ms}ms`);
    this.name = "FirstTokenTimeoutError";
  }
}

class ContentFilterBeforeOutput extends Error {
  constructor() {
    super("content_filter before first output token");
    this.name = "ContentFilterBeforeOutput";
  }
}

const EMPTY_USAGE: Usage = {
  promptTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
  completionTokens: 0,
};

// ---------------------------------------------------------------------------
// request-body rewriting
// ---------------------------------------------------------------------------

/**
 * Rewrite an outgoing chat-completions body: force non-thinking mode and drop any identity field the
 * SDK may have added. Pure string in, string out. Verified against both DeepSeek and Qwen, which
 * accept the same `thinking` parameter.
 */
export function prepareCompatibleBody(rawBody: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return rawBody;

  const body = parsed as Record<string, unknown>;
  delete body.user;
  delete body.user_id;
  body.thinking = { type: "disabled" };
  return JSON.stringify(body);
}

function compatibleFetch(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    if (init && typeof init.body === "string") {
      return base(input, { ...init, body: prepareCompatibleBody(init.body) });
    }
    return base(input, init);
  };
}

// ---------------------------------------------------------------------------
// message / tool conversion
// ---------------------------------------------------------------------------

interface ConvertOptions {
  /** Attach Anthropic 1-hour cache_control to the first system block. */
  cacheFirstSystem?: boolean;
}

/** OpenAI-shaped history -> AI SDK ModelMessage[]. Exported for tests. */
export function toModelMessages(messages: ChatMessage[], opts: ConvertOptions = {}): ModelMessage[] {
  const out: ModelMessage[] = [];
  let systemSeen = false;

  for (const m of messages) {
    if (m.role === "system") {
      const first = !systemSeen;
      systemSeen = true;
      out.push({
        role: "system",
        content: m.content ?? "",
        ...(opts.cacheFirstSystem === true && first
          ? { providerOptions: { anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } } } }
          : {}),
      });
      continue;
    }

    if (m.role === "user") {
      out.push({ role: "user", content: m.content ?? "" });
      continue;
    }

    if (m.role === "tool") {
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: m.tool_call_id ?? "unknown",
            toolName: m.name ?? "unknown",
            output: { type: "text", value: m.content ?? "" },
          },
        ],
      });
      continue;
    }

    if (m.tool_calls !== undefined && m.tool_calls.length > 0) {
      out.push({
        role: "assistant",
        content: [
          ...(m.content !== null && m.content !== undefined && m.content !== ""
            ? [{ type: "text" as const, text: m.content }]
            : []),
          ...m.tool_calls.map((c) => ({
            type: "tool-call" as const,
            toolCallId: c.id,
            toolName: c.function.name,
            input: safeParseArguments(c.function.arguments),
          })),
        ],
      });
    } else {
      out.push({ role: "assistant", content: m.content ?? "" });
    }
  }

  return out;
}

function safeParseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

/** OpenAI function definitions -> an AI SDK ToolSet with no `execute` (every tool is client-side). */
export function toToolSet(tools: OpenAITool[]): ToolSet {
  const set: ToolSet = {};
  for (const t of tools) {
    const schema = (t.function.parameters ?? { type: "object", properties: {} }) as Parameters<
      typeof jsonSchema
    >[0];
    set[t.function.name] = {
      description: t.function.description ?? "",
      inputSchema: jsonSchema(schema),
    };
  }
  return set;
}

// ---------------------------------------------------------------------------
// usage extraction
// ---------------------------------------------------------------------------

function readNumber(source: unknown, key: string): number | undefined {
  if (source === null || typeof source !== "object") return undefined;
  const v = (source as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function readObject(source: unknown, key: string): unknown {
  if (source === null || typeof source !== "object") return undefined;
  return (source as Record<string, unknown>)[key];
}

/**
 * DeepSeek reports `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` at the top level of `usage`,
 * which the OpenAI-compatible mapper does not know about. Prefer those; fall back to the SDK's
 * `cachedInputTokens` / `inputTokenDetails.cacheReadTokens`.
 */
export function extractUsage(sdkUsage: unknown, rawUsage: unknown): Usage {
  const promptTokens =
    readNumber(rawUsage, "prompt_tokens") ?? readNumber(sdkUsage, "inputTokens") ?? 0;
  const completionTokens =
    readNumber(rawUsage, "completion_tokens") ?? readNumber(sdkUsage, "outputTokens") ?? 0;

  // `prompt_cache_hit_tokens` is DeepSeek-direct only. Alibaba's international endpoint reports the
  // same thing as `prompt_tokens_details.cached_tokens` and omits the flat field entirely, so without
  // this branch a 98%-cached turn is recorded as a full miss and priced ~30x too high — silently,
  // because nothing else about the response looks wrong.
  const cacheHitTokens =
    readNumber(rawUsage, "prompt_cache_hit_tokens") ??
    readNumber(readObject(rawUsage, "prompt_tokens_details"), "cached_tokens") ??
    readNumber(sdkUsage, "cachedInputTokens") ??
    readNumber(readObject(sdkUsage, "inputTokenDetails"), "cacheReadTokens") ??
    0;

  const cacheMissTokens =
    readNumber(rawUsage, "prompt_cache_miss_tokens") ??
    readNumber(readObject(sdkUsage, "inputTokenDetails"), "noCacheTokens") ??
    Math.max(0, promptTokens - cacheHitTokens);

  return { promptTokens, cacheHitTokens, cacheMissTokens, completionTokens };
}

const FINISH_REASONS = new Set<string>(["stop", "tool_calls", "length", "content_filter", "error"]);

/** Normalise both OpenAI (`tool_calls`) and AI SDK (`tool-calls`) spellings. */
export function mapFinishReason(reason: string | undefined): FinishReason {
  if (reason === undefined) return "stop";
  const normalised = reason.replace(/-/g, "_");
  return FINISH_REASONS.has(normalised) ? (normalised as FinishReason) : "stop";
}

// ---------------------------------------------------------------------------
// the shared streamText -> ProviderEvent bridge
// ---------------------------------------------------------------------------

async function* streamAsProviderEvents(
  model: LanguageModel,
  req: ProviderRequest,
  cacheFirstSystem: boolean,
): AsyncIterable<ProviderEvent> {
  const result = streamText({
    model,
    messages: toModelMessages(req.messages, { cacheFirstSystem }),
    allowSystemInMessages: true,
    tools: toToolSet(req.tools),
    temperature: req.temperature,
    maxOutputTokens: req.maxTokens,
    abortSignal: req.signal,
    maxRetries: 0,
    includeRawChunks: true,
  });

  let rawUsage: unknown;

  for await (const part of result.fullStream) {
    switch (part.type) {
      case "text-delta":
        if (part.text.length > 0) yield { type: "text", delta: part.text };
        break;
      case "tool-call":
        yield {
          type: "tool_call",
          id: part.toolCallId,
          name: part.toolName,
          arguments: JSON.stringify(part.input ?? {}),
        };
        break;
      case "raw": {
        const usage = readObject(part.rawValue, "usage");
        if (usage !== null && typeof usage === "object") rawUsage = usage;
        break;
      }
      case "error":
        throw part.error instanceof Error ? part.error : new Error(String(part.error));
      case "finish":
        yield {
          type: "finish",
          reason: mapFinishReason(part.rawFinishReason ?? part.finishReason),
          usage: extractUsage(part.totalUsage, rawUsage),
        };
        break;
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// providers
// ---------------------------------------------------------------------------

export function createDeepSeekProvider(opts: {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** Override for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}): ProviderAdapter {
  const modelId = opts.model ?? DEEPSEEK_DEFAULT_MODEL;
  const provider = createOpenAICompatible({
    name: "deepseek",
    baseURL: opts.baseUrl ?? "https://api.deepseek.com",
    apiKey: opts.apiKey,
    fetch: compatibleFetch(opts.fetchImpl ?? fetch),
    includeUsage: true,
  });
  const model = provider.chatModel(modelId);

  return {
    name: "deepseek",
    model: modelId,
    stream(req) {
      return streamAsProviderEvents(model, req, false);
    },
  };
}

/**
 * Qwen on Alibaba Cloud Model Studio (international). Same wire shape and the same `thinking` override
 * as DeepSeek, so it reuses `compatibleFetch` rather than duplicating the rule.
 */
export function createQwenProvider(opts: {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** Override for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}): ProviderAdapter {
  const modelId = opts.model ?? QWEN_DEFAULT_MODEL;
  const provider = createOpenAICompatible({
    name: "qwen",
    baseURL: opts.baseUrl ?? ALIBABA_INTL_BASE_URL,
    apiKey: opts.apiKey,
    fetch: compatibleFetch(opts.fetchImpl ?? fetch),
    includeUsage: true,
  });
  const model = provider.chatModel(modelId);

  return {
    name: "qwen",
    model: modelId,
    stream(req) {
      return streamAsProviderEvents(model, req, false);
    },
  };
}

export function createAnthropicProvider(opts: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): ProviderAdapter {
  const modelId = opts.model ?? ANTHROPIC_DEFAULT_MODEL;
  const provider = createAnthropic({
    apiKey: opts.apiKey,
    ...(opts.fetchImpl !== undefined ? { fetch: opts.fetchImpl } : {}),
  });
  const model = provider(modelId);

  return {
    name: "anthropic",
    model: modelId,
    stream(req) {
      return streamAsProviderEvents(model, req, true);
    },
  };
}

// ---------------------------------------------------------------------------
// failover
// ---------------------------------------------------------------------------

/**
 * Yields from `primary` until it produces its first output token. Before that point any error, or the
 * absence of a token for `firstTokenTimeoutMs`, or `finish_reason=content_filter`, re-issues the
 * identical request to `fallback`. After the first byte the stream is committed: a later failure ends
 * the turn rather than starting a second, contradictory answer.
 */
export function withFailover(
  primary: ProviderAdapter,
  fallback: ProviderAdapter,
  opts?: { firstTokenTimeoutMs?: number },
): ProviderAdapter {
  const timeoutMs = opts?.firstTokenTimeoutMs ?? DEFAULT_FIRST_TOKEN_TIMEOUT_MS;

  return {
    name: primary.name,
    model: primary.model,
    stream(req) {
      return failoverStream(primary, fallback, req, timeoutMs);
    },
  };
}

async function* failoverStream(
  primary: ProviderAdapter,
  fallback: ProviderAdapter,
  req: ProviderRequest,
  timeoutMs: number,
): AsyncIterable<ProviderEvent> {
  let produced = false;
  let primaryFailed = false;

  try {
    for await (const ev of firstTokenGuarded(primary.stream(req), timeoutMs)) {
      if (ev.type === "error") throw ev.error;

      if (ev.type === "finish") {
        // content_filter with nothing emitted yet is a refusal, not an answer: try the other model.
        if (ev.reason === "content_filter" && !produced) throw new ContentFilterBeforeOutput();
        yield ev;
        continue;
      }

      produced = true;
      yield ev;
    }
  } catch {
    if (produced) {
      // Committed to the primary's bytes. End the turn honestly rather than re-answering.
      yield { type: "finish", reason: "error", usage: EMPTY_USAGE };
      return;
    }
    primaryFailed = true;
  }

  if (!primaryFailed) return;

  try {
    for await (const ev of fallback.stream(req)) {
      if (ev.type === "error") throw ev.error;
      yield ev;
    }
  } catch {
    yield { type: "finish", reason: "error", usage: EMPTY_USAGE };
  }
}

/**
 * Passes every event through, but rejects with `FirstTokenTimeoutError` if no `text` or `tool_call`
 * event has arrived within `ms`. Uses a plain `setTimeout`, so vitest fake timers drive it.
 */
export async function* firstTokenGuarded(
  source: AsyncIterable<ProviderEvent>,
  ms: number,
): AsyncIterable<ProviderEvent> {
  const iterator = source[Symbol.asyncIterator]();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired: Promise<never> | undefined = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new FirstTokenTimeoutError(ms));
    }, ms);
  });
  // Nothing awaits this promise once the race is won; swallow the rejection to avoid an unhandled one.
  void expired.catch(() => undefined);

  try {
    for (;;) {
      const next =
        expired === undefined
          ? await iterator.next()
          : await Promise.race([iterator.next(), expired]);
      if (next.done === true) return;
      const value: ProviderEvent = next.value;
      if (expired !== undefined && (value.type === "text" || value.type === "tool_call")) {
        if (timer !== undefined) clearTimeout(timer);
        expired = undefined;
      }
      yield value;
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // Fire and forget: a provider that is wedged mid-await would never settle `return()`, and waiting
    // for it would turn a first-token timeout into a hang — exactly the failure we are guarding against.
    if (typeof iterator.return === "function") {
      void Promise.resolve(iterator.return(undefined)).catch(() => undefined);
    }
  }
}

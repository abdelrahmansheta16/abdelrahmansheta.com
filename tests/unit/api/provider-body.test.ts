/** The rules that cost real money if they regress: thinking must be disabled on every request, no
 *  identity field may ever be sent (it isolates the KV cache — invariant 8), and a cache hit must be
 *  recognised whichever shape the provider reports it in. */
import { describe, expect, it } from "vitest";
import {
  extractUsage,
  mapFinishReason,
  prepareCompatibleBody,
  toModelMessages,
  toToolSet,
} from "@/lib/llm/provider";

describe("prepareCompatibleBody", () => {
  it("injects thinking: disabled", () => {
    const out = JSON.parse(prepareCompatibleBody('{"model":"deepseek-v4-flash","messages":[]}')) as Record<string, unknown>;
    expect(out.thinking).toEqual({ type: "disabled" });
  });

  it("overwrites an enabled thinking block rather than trusting it", () => {
    const out = JSON.parse(prepareCompatibleBody('{"thinking":{"type":"enabled"}}')) as Record<string, unknown>;
    expect(out.thinking).toEqual({ type: "disabled" });
  });

  it("strips user and user_id", () => {
    const raw = JSON.stringify({ model: "m", user: "visitor-1", user_id: "visitor-1", messages: [] });
    const text = prepareCompatibleBody(raw);
    expect(text).not.toContain("user_id");
    expect(text).not.toContain("visitor-1");
    const out = JSON.parse(text) as Record<string, unknown>;
    expect("user" in out).toBe(false);
    expect("user_id" in out).toBe(false);
  });

  it("leaves everything else byte-identical", () => {
    const out = JSON.parse(prepareCompatibleBody('{"temperature":0.6,"max_tokens":220}')) as Record<string, unknown>;
    expect(out.temperature).toBe(0.6);
    expect(out.max_tokens).toBe(220);
  });

  it("passes a non-JSON body through untouched", () => {
    expect(prepareCompatibleBody("not json")).toBe("not json");
    expect(prepareCompatibleBody("[1,2]")).toBe("[1,2]");
  });
});

describe("extractUsage", () => {
  it("prefers DeepSeek's own cache counters", () => {
    const usage = extractUsage(
      { inputTokens: 100, outputTokens: 20 },
      { prompt_tokens: 40000, completion_tokens: 30, prompt_cache_hit_tokens: 38000, prompt_cache_miss_tokens: 2000 },
    );
    expect(usage).toEqual({
      promptTokens: 40000,
      cacheHitTokens: 38000,
      cacheMissTokens: 2000,
      completionTokens: 30,
    });
  });

  it("falls back to the SDK's cachedInputTokens", () => {
    const usage = extractUsage({ inputTokens: 1000, outputTokens: 10, cachedInputTokens: 800 }, undefined);
    expect(usage.cacheHitTokens).toBe(800);
    expect(usage.cacheMissTokens).toBe(200);
  });

  it("falls back again to inputTokenDetails", () => {
    const usage = extractUsage(
      { inputTokens: 500, outputTokens: 5, inputTokenDetails: { cacheReadTokens: 400, noCacheTokens: 100 } },
      undefined,
    );
    expect(usage.cacheHitTokens).toBe(400);
    expect(usage.cacheMissTokens).toBe(100);
  });

  it("returns zeroes rather than NaN when nothing is reported", () => {
    expect(extractUsage(undefined, undefined)).toEqual({
      promptTokens: 0,
      cacheHitTokens: 0,
      cacheMissTokens: 0,
      completionTokens: 0,
    });
  });
});

describe("mapFinishReason", () => {
  it("normalises both spellings", () => {
    expect(mapFinishReason("tool-calls")).toBe("tool_calls");
    expect(mapFinishReason("tool_calls")).toBe("tool_calls");
    expect(mapFinishReason("content-filter")).toBe("content_filter");
    expect(mapFinishReason("unknown-thing")).toBe("stop");
    expect(mapFinishReason(undefined)).toBe("stop");
  });
});

describe("toModelMessages", () => {
  it("marks only the first system block for Anthropic 1-hour caching", () => {
    const out = toModelMessages(
      [
        { role: "system", content: "corpus" },
        { role: "user", content: "hi" },
        { role: "system", content: "session context" },
      ],
      { cacheFirstSystem: true },
    );
    expect(out[0]).toMatchObject({
      role: "system",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } } },
    });
    expect(out[2]).not.toHaveProperty("providerOptions");
  });

  it("does not attach cache control for DeepSeek", () => {
    const out = toModelMessages([{ role: "system", content: "corpus" }], { cacheFirstSystem: false });
    expect(out[0]).not.toHaveProperty("providerOptions");
  });

  it("converts assistant tool calls and tool results", () => {
    const out = toModelMessages([
      { role: "system", content: "s" },
      {
        role: "assistant",
        content: "one moment",
        tool_calls: [{ id: "c1", type: "function", function: { name: "show_section", arguments: '{"section":"cv"}' } }],
      },
      { role: "tool", content: "ok", name: "show_section", tool_call_id: "c1" },
    ]);
    expect(out[1]).toMatchObject({ role: "assistant" });
    expect(out[2]).toMatchObject({ role: "tool" });
  });

  it("survives unparseable tool arguments", () => {
    const out = toModelMessages([
      { role: "system", content: "s" },
      { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "n", arguments: "{oops" } }] },
    ]);
    const content = (out[1] as { content: Array<{ input?: unknown }> }).content;
    expect(content[0].input).toEqual({});
  });
});

describe("toToolSet", () => {
  it("produces one entry per function, with no execute", () => {
    const set = toToolSet([
      { type: "function", function: { name: "a", description: "d", parameters: { type: "object", properties: {} } } },
    ]);
    expect(Object.keys(set)).toEqual(["a"]);
    expect(set.a).not.toHaveProperty("execute");
  });
});

describe("extractUsage — cache hits across providers", () => {
  // Real payloads captured from each route with the 7,794-token compiled corpus on turn two.
  it("reads DeepSeek direct, which sends the flat prompt_cache_hit_tokens fields", () => {
    const u = extractUsage(undefined, {
      prompt_tokens: 7792,
      completion_tokens: 40,
      prompt_cache_hit_tokens: 7680,
      prompt_cache_miss_tokens: 112,
      prompt_tokens_details: { cached_tokens: 7680 },
    });
    expect(u.cacheHitTokens).toBe(7680);
    expect(u.cacheMissTokens).toBe(112);
  });

  /**
   * Alibaba's international endpoint omits the flat fields entirely and reports the hit only inside
   * prompt_tokens_details. Before this branch existed a 98%-cached turn was recorded as a full miss
   * and priced roughly thirty times too high — silently, because nothing else looked wrong.
   */
  it("reads Alibaba/Singapore, which reports the hit only in prompt_tokens_details", () => {
    const u = extractUsage(undefined, {
      prompt_tokens: 7792,
      completion_tokens: 40,
      prompt_tokens_details: { cached_tokens: 7680 },
    });
    expect(u.cacheHitTokens).toBe(7680);
    expect(u.cacheMissTokens).toBe(112);
  });

  it("reads Qwen, which adds text_tokens alongside cached_tokens", () => {
    const u = extractUsage(undefined, {
      prompt_tokens: 7910,
      completion_tokens: 40,
      prompt_tokens_details: { cached_tokens: 7168, text_tokens: 7910 },
    });
    expect(u.cacheHitTokens).toBe(7168);
    expect(u.cacheHitTokens / u.promptTokens).toBeGreaterThan(0.85);
  });

  it("still reports a genuine miss as a miss", () => {
    const u = extractUsage(undefined, {
      prompt_tokens: 7794,
      completion_tokens: 40,
      prompt_tokens_details: { cached_tokens: 0 },
    });
    expect(u.cacheHitTokens).toBe(0);
    expect(u.cacheMissTokens).toBe(7794);
  });
});

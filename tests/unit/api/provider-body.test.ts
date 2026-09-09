/** The two DeepSeek rules that cost real money if they regress: thinking must be disabled on every
 *  request, and no identity field may ever be sent (it isolates the KV cache — invariant 8). */
import { describe, expect, it } from "vitest";
import {
  extractUsage,
  mapFinishReason,
  prepareDeepSeekBody,
  toModelMessages,
  toToolSet,
} from "@/lib/llm/provider";

describe("prepareDeepSeekBody", () => {
  it("injects thinking: disabled", () => {
    const out = JSON.parse(prepareDeepSeekBody('{"model":"deepseek-v4-flash","messages":[]}')) as Record<string, unknown>;
    expect(out.thinking).toEqual({ type: "disabled" });
  });

  it("overwrites an enabled thinking block rather than trusting it", () => {
    const out = JSON.parse(prepareDeepSeekBody('{"thinking":{"type":"enabled"}}')) as Record<string, unknown>;
    expect(out.thinking).toEqual({ type: "disabled" });
  });

  it("strips user and user_id", () => {
    const raw = JSON.stringify({ model: "m", user: "visitor-1", user_id: "visitor-1", messages: [] });
    const text = prepareDeepSeekBody(raw);
    expect(text).not.toContain("user_id");
    expect(text).not.toContain("visitor-1");
    const out = JSON.parse(text) as Record<string, unknown>;
    expect("user" in out).toBe(false);
    expect("user_id" in out).toBe(false);
  });

  it("leaves everything else byte-identical", () => {
    const out = JSON.parse(prepareDeepSeekBody('{"temperature":0.6,"max_tokens":220}')) as Record<string, unknown>;
    expect(out.temperature).toBe(0.6);
    expect(out.max_tokens).toBe(220);
  });

  it("passes a non-JSON body through untouched", () => {
    expect(prepareDeepSeekBody("not json")).toBe("not json");
    expect(prepareDeepSeekBody("[1,2]")).toBe("[1,2]");
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

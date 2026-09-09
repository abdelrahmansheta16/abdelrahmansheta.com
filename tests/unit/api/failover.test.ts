/** Failover behaviour with fake adapters and fake timers. The rule under test: switch freely before the
 *  first output token, never after it. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withFailover, FirstTokenTimeoutError, firstTokenGuarded } from "@/lib/llm/provider";
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from "@/lib/brain/types";

const REQUEST: ProviderRequest = {
  messages: [{ role: "system", content: "s" }],
  tools: [],
  temperature: 0.6,
  maxTokens: 220,
  signal: new AbortController().signal,
};

function fake(name: "deepseek" | "anthropic", script: () => AsyncIterable<ProviderEvent>): ProviderAdapter {
  return { name, model: `${name}-test`, stream: script };
}

async function collect(source: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = [];
  for await (const e of source) out.push(e);
  return out;
}

const finish = (reason: ProviderEvent extends never ? never : "stop" | "content_filter"): ProviderEvent => ({
  type: "finish",
  reason,
});

describe("withFailover", () => {
  it("uses the primary when it answers", async () => {
    const primary = fake("deepseek", async function* () {
      yield { type: "text", delta: "primary" };
      yield finish("stop");
    });
    const fallback = fake("anthropic", async function* () {
      yield { type: "text", delta: "fallback" };
    });
    const events = await collect(withFailover(primary, fallback).stream(REQUEST));
    expect(events).toEqual([{ type: "text", delta: "primary" }, { type: "finish", reason: "stop" }]);
  });

  it("switches on an upstream error before the first token", async () => {
    const primary = fake("deepseek", async function* () {
      await Promise.resolve();
      throw new Error("503 service unavailable");

      yield { type: "text", delta: "never" };
    });
    const fallback = fake("anthropic", async function* () {
      yield { type: "text", delta: "fallback" };
      yield finish("stop");
    });
    const events = await collect(withFailover(primary, fallback).stream(REQUEST));
    expect(events).toEqual([{ type: "text", delta: "fallback" }, { type: "finish", reason: "stop" }]);
  });

  it("switches on an error event before the first token", async () => {
    const primary = fake("deepseek", async function* () {
      yield { type: "error", error: new Error("429 rate limited") };
    });
    const fallback = fake("anthropic", async function* () {
      yield { type: "text", delta: "second try" };
      yield finish("stop");
    });
    const events = await collect(withFailover(primary, fallback).stream(REQUEST));
    expect(events[0]).toEqual({ type: "text", delta: "second try" });
  });

  it("switches when the primary finishes with content_filter and no text", async () => {
    const primary = fake("deepseek", async function* () {
      yield finish("content_filter");
    });
    const fallback = fake("anthropic", async function* () {
      yield { type: "text", delta: "answered" };
      yield finish("stop");
    });
    const events = await collect(withFailover(primary, fallback).stream(REQUEST));
    expect(events).toEqual([{ type: "text", delta: "answered" }, { type: "finish", reason: "stop" }]);
  });

  it("does NOT switch once the primary has produced a token", async () => {
    const primary = fake("deepseek", async function* () {
      yield { type: "text", delta: "half an answer" };
      await Promise.resolve();
      throw new Error("connection reset");
    });
    const fallback = fake("anthropic", async function* () {
      yield { type: "text", delta: "SHOULD NOT APPEAR" };
    });
    const events = await collect(withFailover(primary, fallback).stream(REQUEST));
    expect(events[0]).toEqual({ type: "text", delta: "half an answer" });
    expect(events[1]).toMatchObject({ type: "finish", reason: "error" });
    expect(JSON.stringify(events)).not.toContain("SHOULD NOT APPEAR");
  });

  it("reports finish:error only when both providers fail", async () => {
    const dead = (name: "deepseek" | "anthropic"): ProviderAdapter =>
      fake(name, async function* () {
        await Promise.resolve();
        throw new Error("down");

        yield { type: "text", delta: "" };
      });
    const events = await collect(withFailover(dead("deepseek"), dead("anthropic")).stream(REQUEST));
    expect(events).toEqual([
      { type: "finish", reason: "error", usage: { promptTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 0 } },
    ]);
  });
});

describe("firstTokenGuarded", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("rejects when no token arrives inside the budget", async () => {
    const stalled: AsyncIterable<ProviderEvent> = {
      async *[Symbol.asyncIterator]() {
        await new Promise(() => undefined);
        yield { type: "text", delta: "too late" } as ProviderEvent;
      },
    };
    // Attach the rejection handler BEFORE advancing the clock, or Node reports it as unhandled.
    const assertion = expect(collect(firstTokenGuarded(stalled, 1500))).rejects.toBeInstanceOf(
      FirstTokenTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(1600);
    await assertion;
  });

  it("stops arming the timer once a token has arrived", async () => {
    async function* slowTail(): AsyncIterable<ProviderEvent> {
      yield { type: "text", delta: "fast" };
      await new Promise((resolve) => setTimeout(resolve, 5000));
      yield { type: "finish", reason: "stop" };
    }
    const assertion = expect(collect(firstTokenGuarded(slowTail(), 1500))).resolves.toHaveLength(2);
    await vi.advanceTimersByTimeAsync(6000);
    await assertion;
  });
});

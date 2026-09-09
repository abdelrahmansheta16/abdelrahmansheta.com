/** Session bookkeeping (best-effort by design) plus the fixed e-mail templates. The templates matter:
 *  the model never writes a body and never names a recipient (invariant 7), so these strings are the
 *  entire outgoing surface. */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultFlags,
  estimateUsd,
  loadFlags,
  recordLlmCall,
  recordSpend,
  recordTurn,
} from "@/lib/brain/session";
import { SUMMARY_FOOTER, leadTemplate, messageTemplate, summaryTemplate } from "@/app/api/_lib/email";
import { toChatMessages } from "@/app/api/_lib/messages";

describe("defaultFlags", () => {
  it("assumes the greeting did NOT play, so the disclosure is repeated rather than skipped", () => {
    expect(defaultFlags("voice").greetingPlayed).toBe(false);
    expect(defaultFlags("text")).toMatchObject({ sessionId: null, langHint: "en", guardHits: 0 });
  });
});

describe("loadFlags", () => {
  it("returns defaults with no database", async () => {
    await expect(loadFlags(null, { sessionId: "s1" })).resolves.toMatchObject({ sessionId: null });
  });

  it("infers the voice channel from a conversation id", async () => {
    const flags = await loadFlags(null, { conversationId: "conv_1" });
    expect(flags.channel).toBe("voice");
  });

  it("reads a row by session id and computes the remaining seconds for voice", async () => {
    const startedAt = new Date(Date.now() - 40_000).toISOString();
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  id: "s1",
                  channel: "voice",
                  started_at: startedAt,
                  ended_at: null,
                  locale_initial: "ar",
                  lead_captured: true,
                  summary_sent: false,
                  message_left: false,
                  guard_hits: 2,
                  reserved_seconds: 240,
                  duration_secs: null,
                  flags: {},
                },
                error: null,
              }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const flags = await loadFlags(db, { sessionId: "s1", channel: "voice" });
    expect(flags).toMatchObject({ sessionId: "s1", langHint: "ar", leadCaptured: true, guardHits: 2 });
    expect(flags.remainingSeconds).toBeGreaterThan(190);
    expect(flags.remainingSeconds).toBeLessThanOrEqual(200);
  });

  it("degrades to defaults when the query throws", async () => {
    const db = {
      from: () => {
        throw new Error("down");
      },
    } as unknown as SupabaseClient;
    await expect(loadFlags(db, { sessionId: "s1" })).resolves.toMatchObject({ sessionId: null });
  });
});

describe("record* are best effort", () => {
  const exploding = {
    from: () => {
      throw new Error("down");
    },
    rpc: () => {
      throw new Error("down");
    },
  } as unknown as SupabaseClient;

  it("never throw into the stream", async () => {
    await expect(recordTurn(exploding, { sessionId: "s", role: "agent", content: "x" })).resolves.toBeUndefined();
    await expect(
      recordLlmCall(exploding, { sessionId: "s", provider: "deepseek", model: "m", channel: "voice" }),
    ).resolves.toBeUndefined();
    await expect(recordSpend(exploding, { sessionId: "s", vendor: "deepseek", kind: "k" })).resolves.toBeUndefined();
  });

  it("are no-ops without a database", async () => {
    await expect(recordTurn(null, { sessionId: "s", role: "agent", content: "x" })).resolves.toBeUndefined();
  });

  it("looks up the next turn index when one is not supplied", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: { idx: 4 }, error: null }) }) }),
          }),
        }),
        upsert,
      }),
    } as unknown as SupabaseClient;
    await recordTurn(db, { sessionId: "s", role: "agent", content: "x" });
    expect(upsert.mock.calls[0][0]).toMatchObject({ idx: 5 });
  });
});

describe("estimateUsd", () => {
  it("charges cache hits far less than misses", () => {
    const hit = estimateUsd("deepseek", { cacheHitTokens: 40000, cacheMissTokens: 0, completionTokens: 0 });
    const miss = estimateUsd("deepseek", { cacheHitTokens: 0, cacheMissTokens: 40000, completionTokens: 0 });
    expect(hit).toBeLessThan(miss);
    expect(hit).toBeGreaterThan(0);
  });

  it("keeps a warm 4-minute-style voice turn well under a cent on DeepSeek", () => {
    const usd = estimateUsd("deepseek", { cacheHitTokens: 40000, cacheMissTokens: 200, completionTokens: 220 });
    expect(usd).toBeLessThan(0.01);
  });

  it("prices the Anthropic failover higher than the primary for the same tokens", () => {
    const usage = { cacheHitTokens: 40000, cacheMissTokens: 200, completionTokens: 220 };
    expect(estimateUsd("anthropic", usage)).toBeGreaterThan(estimateUsd("deepseek", usage));
  });

  it("is zero for zero tokens", () => {
    expect(estimateUsd("deepseek", { cacheHitTokens: 0, cacheMissTokens: 0, completionTokens: 0 })).toBe(0);
  });
});

describe("e-mail templates", () => {
  it("includes the AI disclosure footer on every summary", () => {
    const body = summaryTemplate("We talked about Cravit.");
    expect(body).toContain("We talked about Cravit.");
    expect(body.trimEnd().endsWith(SUMMARY_FOOTER)).toBe(true);
  });

  it("renders the owner message with the session id for traceability", () => {
    const body = messageTemplate({ name: "Dana", email: "dana@example.com", body: "Hi", sessionId: "s1" });
    expect(body).toContain("Dana");
    expect(body).toContain("dana@example.com");
    expect(body).toContain("s1");
  });

  it("renders a lead with placeholders for the optional fields", () => {
    const body = leadTemplate({ name: "Dana", company: null, email: "d@e.com", note: null, sessionId: "s1" });
    expect(body).toContain("Company: -");
    expect(body).toContain("Note:    -");
  });
});

describe("toChatMessages", () => {
  it("flattens text parts and keeps roles", () => {
    expect(
      toChatMessages([
        { role: "system", content: "s" },
        { role: "user", content: [{ type: "text", text: "hello " }, { type: "text", text: "there" }] },
      ]),
    ).toEqual([
      { role: "system", content: "s" },
      { role: "user", content: "hello there" },
    ]);
  });

  it("converts assistant tool calls into OpenAI tool_calls", () => {
    const out = toChatMessages([
      {
        role: "assistant",
        content: [
          { type: "text", text: "one sec" },
          { type: "tool-call", toolCallId: "c1", toolName: "show_section", input: { section: "cv" } },
        ],
      },
    ]);
    expect(out[0]).toEqual({
      role: "assistant",
      content: "one sec",
      tool_calls: [
        { id: "c1", type: "function", function: { name: "show_section", arguments: '{"section":"cv"}' } },
      ],
    });
  });

  it("emits one tool message per tool-result part", () => {
    const out = toChatMessages([
      {
        role: "tool",
        content: [
          { type: "tool-result", toolCallId: "c1", toolName: "a", output: { type: "text", value: "ok" } },
          { type: "tool-result", toolCallId: "c2", toolName: "b", output: { type: "text", value: "ok" } },
        ],
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ role: "tool", name: "a", tool_call_id: "c1" });
  });
});

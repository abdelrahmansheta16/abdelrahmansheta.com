/**
 * The guard's phone rule accumulates digits across sentences, because a model can leak a number
 * three digits at a time. The guard computes that carry itself: it masks years and percent spans
 * before counting, and resets to "" whenever a sentence contributes no countable digits.
 *
 * runBrain ignored the returned carry and recomputed it from every raw digit in the sentence, so
 * ordinary CV talk poisoned it. These tests drive the REAL guard through runBrain, because the
 * defect lives precisely in the handoff between the two — a stub guard cannot show it.
 */
import { describe, expect, it } from "vitest";
import { CORPUS_PLACEHOLDER, runBrain, type BrainCorpus, type BrainEvent } from "@/lib/brain/adapter";
import { createGuard } from "@/lib/brain/guard";
import type {
  ChatMessage,
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest,
  SessionFlags,
} from "@/lib/brain/types";

const CORPUS: BrainCorpus = {
  version: "test",
  systemPrompt: "CORPUS_STATIC",
  keepLatin: [],
  tashkeel: {},
};

const refusal = { en: "I can't share that.", ar: "مش هقدر أقول ده." };

function realGuard() {
  return createGuard({
    denylist: [],
    allowedEmails: ["hello@abdelrahmansheta.com"],
    allowedMetrics: ["99.95% uptime", "99.95%", "$1.2B", "2,100 endpoints", "2,100"],
    canary: "",
    refusals: {
      phone: refusal,
      email: refusal,
      salary: refusal,
      confidential: refusal,
      job_seeking: refusal,
      topic: refusal,
      generic: refusal,
    },
    topics: [],
  });
}

function provider(...deltas: string[]): ProviderAdapter {
  return {
    name: "deepseek",
    model: "fake",
    async *stream(_req: ProviderRequest): AsyncGenerator<ProviderEvent> {
      for (const delta of deltas) yield { type: "text", delta };
      yield { type: "finish", reason: "stop" };
    },
  };
}

function flags(): SessionFlags {
  return {
    sessionId: "s1",
    channel: "text",
    langHint: "en",
    leadCaptured: false,
    summarySent: false,
    messageLeft: false,
    guardHits: 0,
    remainingSeconds: 200,
    greetingPlayed: true,
  };
}

const messages = (): ChatMessage[] => [
  { role: "system", content: CORPUS_PLACEHOLDER },
  { role: "user", content: "Tell me about the Cravit replatform." },
];

async function run(...deltas: string[]): Promise<BrainEvent[]> {
  const out: BrainEvent[] = [];
  for await (const e of runBrain({
    corpus: CORPUS,
    guard: realGuard(),
    providers: provider(...deltas),
    messages: messages(),
    channel: "text",
    locale: "en",
    flags: flags(),
  })) {
    out.push(e);
  }
  return out;
}

const blocked = (events: BrainEvent[]): string[] =>
  events.filter((e) => e.type === "guard").map((e) => (e as { rule: string }).rule);

describe("digit carry — ordinary answers must not trip the phone rule", () => {
  it("does not block the sentence after one mentioning two years", async () => {
    // Two years pass on their own — the guard masks YEAR_SPAN before counting. The adapter used to
    // store the raw "20212024" (8 chars), and the very next sentence then satisfied
    // carryIn.length + 0 >= CARRY_MIN(7) and was replaced with the phone refusal.
    const events = await run(
      "He led the replatform at Cravit from 2021 to 2024. ",
      "It was the largest thing he has shipped. ",
    );
    expect(blocked(events)).toEqual([]);
  });

  it("does not block after a sentence carrying allowlisted CV metrics", async () => {
    const events = await run(
      "The platform runs 2,100 endpoints at 99.95% uptime. ",
      "That number is a team total, not solo output. ",
    );
    expect(blocked(events)).toEqual([]);
  });

  it("survives a long answer full of years without ever tripping", async () => {
    const events = await run(
      "He joined in 2021. ",
      "He shipped the replatform in 2023. ",
      "He moved to founding work in 2026. ",
      "Ask him anything else about it. ",
    );
    expect(blocked(events)).toEqual([]);
  });
});

describe("digit carry — a real leak still trips it", () => {
  it("blocks a phone number split across sentences", async () => {
    const events = await run("My number starts 0100 ", "and ends 383 4714. ");
    expect(blocked(events)).toContain("phone");
  });

  it("blocks a phone number in one sentence", async () => {
    const events = await run("Call me on 01001234567. ");
    expect(blocked(events)).toContain("phone");
  });
});

describe("sentence splitting — decimals stay whole so the allowlist can match", () => {
  it("does not cut inside a decimal metric, and does not block it", async () => {
    const events = await run("The platform holds $1.2B TVL at 99.95% uptime. ", "Ask me more. ");
    expect(blocked(events)).toEqual([]);
    const sentences = events
      .filter((e) => e.type === "sentence")
      .map((e) => (e as { text: string }).text);
    expect(sentences.some((s) => s.includes("99.95%"))).toBe(true);
    expect(sentences.some((s) => s.includes("$1.2B"))).toBe(true);
  });

  it("still ends a sentence on a full stop followed by a space", async () => {
    const events = await run("One thing. ", "Then another. ");
    const sentences = events.filter((e) => e.type === "sentence");
    expect(sentences).toHaveLength(2);
  });

  it("still ends a sentence on a full stop before a letter", async () => {
    const events = await run("One thing.Then another. ");
    expect(events.filter((e) => e.type === "sentence").length).toBeGreaterThanOrEqual(2);
  });
});

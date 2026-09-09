/**
 * Invariant 10 — the AI disclosure is spoken at session start, shown before the mic opens, and
 * repeated in the first assistant turn if the greeting did not play (EU AI Act Art. 50).
 * Here we assert the strings exist in both languages and reach the prompt; the UI placement is
 * covered by the component tests in the frontend area.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { CompiledCorpus } from "@/lib/corpus/schema";
import { EXAMPLE_CORPUS_READY, compileExampleCorpus, skipMsg, suite } from "./helpers";

describe.skipIf(!EXAMPLE_CORPUS_READY)(
  suite("invariant 10 — AI disclosure", EXAMPLE_CORPUS_READY, skipMsg.example),
  () => {
    let corpus: CompiledCorpus;
    beforeAll(async () => {
      corpus = await compileExampleCorpus();
    });

    it("has a non-empty English disclosure", () => {
      expect(corpus.disclosure.en.trim().length).toBeGreaterThan(0);
    });

    it("has a non-empty Arabic disclosure, in Arabic script", () => {
      expect(corpus.disclosure.ar.trim().length).toBeGreaterThan(0);
      expect(/[؀-ۿ]/.test(corpus.disclosure.ar)).toBe(true);
    });

    it("puts both disclosures in the system prompt", () => {
      expect(corpus.systemPrompt).toContain(corpus.disclosure.en);
      expect(corpus.systemPrompt).toContain(corpus.disclosure.ar);
    });

    it("has a non-empty consent line in both languages", () => {
      expect(corpus.consent.en.trim().length).toBeGreaterThan(0);
      expect(corpus.consent.ar.trim().length).toBeGreaterThan(0);
      expect(/[؀-ۿ]/.test(corpus.consent.ar)).toBe(true);
    });

    it("names the AI in the disclosure rather than hedging", () => {
      expect(corpus.disclosure.en.toLowerCase()).toMatch(/\bai\b/);
      expect(corpus.disclosure.ar).toMatch(/ذكاء اصطناعي|AI/);
    });
  },
);

describe("invariant 10 — the agent speaks the disclosure first", () => {
  it("the ElevenLabs first message discloses the AI in English", async () => {
    const { FIRST_MESSAGE_EN } = await import("@/scripts/push-agent-config");
    expect(FIRST_MESSAGE_EN.toLowerCase()).toContain("ai version");
  });

  it("the Arabic first message discloses the AI in Masri", async () => {
    const { FIRST_MESSAGE_AR } = await import("@/scripts/push-agent-config");
    expect(FIRST_MESSAGE_AR).toContain("ذكاء اصطناعي");
  });
});

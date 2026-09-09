/**
 * Invariant 1 — the agent never states a phone number or any e-mail other than
 * hello@abdelrahmansheta.com. Every fixture below is fabricated; no real number or address of the
 * owner appears in this repo.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Guard } from "@/lib/brain/guard";
import type { CompiledCorpus } from "@/lib/corpus/schema";
import {
  EXAMPLE_CORPUS_READY,
  GUARD_READY,
  compileExampleCorpus,
  loadGuard,
  loadExampleGuard,
  skipMsg,
  suite,
} from "./helpers";

const BLOCKED_EN = [
  "You can reach me on +20 100 555 0143 any time.",
  "My number is 0 1 0 5 5 5 0 1 4 3, give me a ring.",
  "Write to abdo.notreal@gmail.com instead of the site form.",
  "Try me at abdelrahman dot notreal at outlook dot com.",
];

const BLOCKED_AR = [
  // Fabricated Egyptian-format mobile written in Arabic-Indic digits.
  "رقمي ٠١٠٥٥٥٠١٤٣ اتصل بيا في أي وقت.",
  "ابعتلي على ٠١٠ ٥٥٥ ٠١٤٣ على واتساب.",
  "ابعت على abdo.notreal@gmail.com أحسن.",
  "ابعتلي على عبدالرحمن دوت نوت ريل آت جيميل دوت كوم.",
];

const ALLOWED = [
  "The address that reaches me is hello@abdelrahmansheta.com.",
  "ابعتلي على hello@abdelrahmansheta.com وهرد عليك.",
];

describe.skipIf(!GUARD_READY)(
  suite("invariant 1 — contact red line", GUARD_READY, skipMsg.guard),
  () => {
    let guard: Guard;
    beforeAll(async () => {
      guard = await loadGuard();
    });

    it.each(BLOCKED_EN)("blocks EN: %s", (sentence) => {
      const verdict = guard.checkSentence(sentence, { locale: "en" });
      expect(verdict.ok).toBe(false);
      expect(["phone", "email"]).toContain(verdict.rule);
      expect(verdict.replacement ?? "").not.toBe("");
    });

    it.each(BLOCKED_AR)("blocks AR: %s", (sentence) => {
      const verdict = guard.checkSentence(sentence, { locale: "ar" });
      expect(verdict.ok).toBe(false);
      expect(["phone", "email"]).toContain(verdict.rule);
    });

    it.each(ALLOWED)("allows the allowlisted address: %s", (sentence) => {
      expect(guard.checkSentence(sentence, { locale: "en" }).ok).toBe(true);
    });

    it("accumulates spelled digits across a turn boundary", () => {
      const verdict = guard.checkSentence("5 5 5 0 1 4 3.", {
        locale: "en",
        digitCarry: "0 1 0",
      });
      expect(verdict.ok).toBe(false);
    });
  },
);

describe.skipIf(!EXAMPLE_CORPUS_READY)(
  suite("invariant 1 — the compiled prompt is clean", EXAMPLE_CORPUS_READY, skipMsg.example),
  () => {
    let corpus: CompiledCorpus;
    let guard: Guard | null = null;
    beforeAll(async () => {
      corpus = await compileExampleCorpus();
      if (GUARD_READY) guard = await loadExampleGuard();
    });

    it("lints the system prompt with zero leaks", async () => {
      if (!guard) return;
      // The build-time lint, not the runtime rule set: the prompt must be able to quote the phrases
      // it forbids and to name the topics it deflects. See createCorpusLint.
      const { createCorpusLint } = await import("@/lib/corpus/lint");
      expect(createCorpusLint(guard)(corpus.systemPrompt)).toEqual([]);
    });

    it("carries no e-mail address other than the allowlisted one", () => {
      const found = corpus.systemPrompt.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
      const unexpected = found.filter(
        (addr) => addr !== corpus.links.contact_email && addr !== corpus.links.legal_email,
      );
      expect(unexpected).toEqual([]);
    });
  },
);

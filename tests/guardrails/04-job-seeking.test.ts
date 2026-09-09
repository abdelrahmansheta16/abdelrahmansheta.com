/**
 * Invariant 4 — the agent never says the owner is actively job-seeking. The phrase is
 * "open to conversations" in English and the Masri equivalent in Arabic.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Guard } from "@/lib/brain/guard";
import type { CompiledCorpus } from "@/lib/corpus/schema";
import {
  EXAMPLE_CORPUS_READY,
  GUARD_READY,
  compileExampleCorpus,
  loadGuard,
  skipMsg,
  suite,
} from "./helpers";

const BLOCKED_EN = [
  "I'm actively looking for a new role.",
  "He is actively job-seeking right now.",
  "I'm applying to a few companies this month.",
  "I'm interviewing at three places at the moment.",
];

const BLOCKED_AR = [
  "بدور على شغل دلوقتي.",
  "بقدم على وظايف كتير الفترة دي.",
  "أنا بعمل انترفيوهات في كذا شركة.",
];

const ALLOWED = [
  "I'm open to conversations when the role is a real fit.",
  "مفتوح لأي كلام لو في دور مناسب على الطاولة.",
];

describe.skipIf(!GUARD_READY)(
  suite("invariant 4 — job-seeking red line", GUARD_READY, skipMsg.guard),
  () => {
    let guard: Guard;
    beforeAll(async () => {
      guard = await loadGuard();
    });

    it.each(BLOCKED_EN)("blocks EN: %s", (sentence) => {
      const verdict = guard.checkSentence(sentence, { locale: "en" });
      expect(verdict.ok).toBe(false);
      expect(verdict.rule).toBe("job_seeking");
      // The rule substitutes rather than only dropping: the visitor still gets an answer.
      expect(verdict.replacement ?? "").not.toBe("");
    });

    it.each(BLOCKED_AR)("blocks AR: %s", (sentence) => {
      const verdict = guard.checkSentence(sentence, { locale: "ar" });
      expect(verdict.ok).toBe(false);
      expect(verdict.rule).toBe("job_seeking");
      expect(verdict.replacement ?? "").not.toBe("");
    });

    it.each(ALLOWED)("allows the approved phrasing: %s", (sentence) => {
      const locale = /[؀-ۿ]/.test(sentence) ? "ar" : "en";
      expect(guard.checkSentence(sentence, { locale }).ok).toBe(true);
    });
  },
);

describe.skipIf(!EXAMPLE_CORPUS_READY)(
  suite("invariant 4 — status phrasing in the corpus", EXAMPLE_CORPUS_READY, skipMsg.example),
  () => {
    let corpus: CompiledCorpus;
    beforeAll(async () => {
      corpus = await compileExampleCorpus();
    });

    it("ships a status phrase in both languages", () => {
      expect(corpus.logistics.status_phrase_en.trim().length).toBeGreaterThan(0);
      expect(corpus.logistics.status_phrase_ar.trim().length).toBeGreaterThan(0);
    });

    it("does not describe the owner as actively looking", () => {
      const haystack = [
        corpus.systemPrompt,
        corpus.logistics.status_phrase_en,
        corpus.logistics.status_phrase_ar,
      ]
        .join("\n")
        .toLowerCase();
      // Allowed inside a red-line rule ("never say actively looking"), so we only reject the
      // phrase when it is asserted about the owner in a status field.
      expect(corpus.logistics.status_phrase_en.toLowerCase()).not.toContain("actively looking");
      expect(corpus.logistics.status_phrase_en.toLowerCase()).not.toContain("job-seeking");
      expect(corpus.logistics.status_phrase_ar).not.toContain("بدور على شغل");
      expect(haystack).toContain("open to conversations");
    });

    it("carries a job_seeking red line with refusal templates", () => {
      const rule = corpus.redlines.find((r) => r.id === "job_seeking");
      expect(rule).toBeDefined();
      expect(rule?.refusal_en.length ?? 0).toBeGreaterThan(0);
      expect(rule?.refusal_ar.length ?? 0).toBeGreaterThan(0);
    });
  },
);

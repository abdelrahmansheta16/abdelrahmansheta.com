/**
 * Invariant 2 — the agent never states a salary figure, range, floor or rate.
 * Public CV metrics that happen to contain money or percentages must still pass.
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
  "My salary is 100k.",
  "The salary expectation is around 100k euros.",
  "My day rate is 600 EUR, negotiable.",
  "I'd want a package in the 90-110k range.",
  "Pay floor: $8,000 a month.",
];

const BLOCKED_AR = [
  "المرتب ١٠٠ ألف.",
  "بكام في الشهر؟ حوالي ٨٠ ألف جنيه.",
  "الراتب المتوقع تلاتين ألف درهم.",
  "سعر اليوم عندي ٦٠٠ يورو.",
];

const ALLOWED_EN = [
  "We cut LLM cost by 70% without touching quality.",
  "The platform processed 1.2 million orders in the first year.",
];

const ALLOWED_AR = ["قللنا تكلفة الـ LLM بنسبة سبعين في المية."];

describe.skipIf(!GUARD_READY)(
  suite("invariant 2 — salary red line", GUARD_READY, skipMsg.guard),
  () => {
    let guard: Guard;
    beforeAll(async () => {
      guard = await loadGuard();
    });

    it.each(BLOCKED_EN)("blocks EN: %s", (sentence) => {
      const verdict = guard.checkSentence(sentence, { locale: "en" });
      expect(verdict.ok).toBe(false);
      expect(verdict.rule).toBe("salary");
      expect(verdict.replacement ?? "").not.toBe("");
    });

    it.each(BLOCKED_AR)("blocks AR: %s", (sentence) => {
      const verdict = guard.checkSentence(sentence, { locale: "ar" });
      expect(verdict.ok).toBe(false);
      expect(verdict.rule).toBe("salary");
    });

    it.each([...ALLOWED_EN, ...ALLOWED_AR])("allows a public CV metric: %s", (sentence) => {
      const locale = /[؀-ۿ]/.test(sentence) ? "ar" : "en";
      expect(guard.checkSentence(sentence, { locale }).ok).toBe(true);
    });

    it("uses the last user turn as salary context across the boundary", () => {
      const verdict = guard.checkSentence("Around a hundred thousand.", {
        locale: "en",
        lastUserTurn: "What salary are you expecting?",
      });
      expect(verdict.ok).toBe(false);
      expect(verdict.rule).toBe("salary");
    });
  },
);

describe.skipIf(!EXAMPLE_CORPUS_READY)(
  suite("invariant 2 — no salary in the corpus", EXAMPLE_CORPUS_READY, skipMsg.example),
  () => {
    let corpus: CompiledCorpus;
    beforeAll(async () => {
      corpus = await compileExampleCorpus();
    });

    it("has no salary key in logistics (strict schema forbids it)", () => {
      expect(Object.keys(corpus.logistics)).not.toContain("salary");
    });

    it("carries a salary red line with refusal templates in both languages", () => {
      const rule = corpus.redlines.find((r) => r.id === "salary");
      expect(rule).toBeDefined();
      expect(rule?.refusal_en.length ?? 0).toBeGreaterThan(0);
      expect(rule?.refusal_ar.length ?? 0).toBeGreaterThan(0);
    });
  },
);

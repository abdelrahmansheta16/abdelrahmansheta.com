/**
 * Deterministic red-line guard (invariants 1-4). Pure functions, no I/O. Implemented in area A.
 * Runs on every assistant sentence before it reaches TTS or the browser, and at build time over the corpus.
 */
import type { GuardRule, GuardVerdict } from "./types";
import type { Locale } from "@/lib/tools/schema";

export interface GuardConfig {
  denylist: string[]; // policy/denylist.txt (already lower-cased by caller or not; guard normalises)
  allowedEmails: string[]; // ["hello@abdelrahmansheta.com"]
  allowedMetrics: string[]; // public CV metrics that contain digits/currency, e.g. "$1.2B", "99.95%"
  canary: string; // unique token planted in the system prompt
  refusals: Record<
    Exclude<GuardRule, "canary" | "json_shape"> | "generic",
    { en: string; ar: string }
  >;
  topics: string[]; // keywords that trigger the topic deflection
}

export interface Guard {
  /** Normalise Arabic-Indic digits, strip tatweel/tashkeel, unify letter variants. Used for matching only. */
  normaliseForMatch(text: string): string;
  /** Check one released sentence. `lastUserTurn` gives salary-lexicon context across the boundary. */
  checkSentence(
    sentence: string,
    ctx: { locale: Locale; lastUserTurn?: string; digitCarry?: string },
  ): GuardVerdict;
  /** Build-time lint over any text (corpus fields, transcripts). Returns every rule that fires. */
  lint(text: string): GuardRule[];
  /** Cheap input heuristics: prompt-injection phrases in EN/AR. */
  looksLikeInjection(userText: string): boolean;
}

export function createGuard(_config: GuardConfig): Guard {
  throw new Error("createGuard: implemented in area A");
}

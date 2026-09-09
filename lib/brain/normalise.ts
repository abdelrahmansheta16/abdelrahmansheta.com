/** Voice-channel text normalisation for TTS: digits → Egyptian/English number words, percent, years, tashkeel map. Area A. */
import type { Locale } from "@/lib/tools/schema";

export interface NormaliseOptions {
  locale: Locale;
  tashkeel?: Record<string, string>; // curated word → vowelled form
  keepLatin?: string[]; // tech terms never transliterated
}

/** Convert a sentence for speech. Text channel does NOT call this (digits allowed). */
export function normaliseForSpeech(_sentence: string, _opts: NormaliseOptions): string {
  throw new Error("normaliseForSpeech: implemented in area A");
}

/** 2023 → "ألفين وتلاتة وعشرين" (ar) / "twenty twenty-three" (en). Exposed for fixtures. */
export function numberToWords(
  _n: number,
  _locale: Locale,
  _kind: "cardinal" | "year" | "percent" = "cardinal",
): string {
  throw new Error("numberToWords: implemented in area A");
}

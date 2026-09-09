/**
 * Script heuristic used to tag each transcript turn with lang/dir. We count Arabic code points against
 * letters only, so "عملت deploy للـ backend" (heavy code-switching, still Masri) stays Arabic.
 */
import type { Locale } from "@/lib/tools/schema";

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN = /[A-Za-z]/;

/** Share of letter code points that are Arabic. Returns 0 for strings with no letters at all. */
export function arabicRatio(text: string): number {
  let arabic = 0;
  let letters = 0;
  for (const ch of text) {
    if (ARABIC.test(ch)) {
      arabic += 1;
      letters += 1;
    } else if (LATIN.test(ch)) {
      letters += 1;
    }
  }
  return letters === 0 ? 0 : arabic / letters;
}

/** Over half the letters Arabic means we render the turn as Arabic, RTL. */
export function detectLocale(text: string): Locale {
  return arabicRatio(text) > 0.5 ? "ar" : "en";
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * Splits a string into runs so an Arabic turn can wrap its Latin runs in <bdi> and keep "FastAPI 2.0"
 * from being mirrored by the bidi algorithm.
 */
export interface TextRun {
  text: string;
  latin: boolean;
}

export function splitBidiRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // A Latin run is Latin letters plus the digits, dots and dashes glued to them (e.g. "Next 16.3.4").
  const re = /[A-Za-z][A-Za-z0-9@._+/-]*(?:\s+[A-Za-z][A-Za-z0-9@._+/-]*)*/g;
  let index = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index;
    if (start > index) runs.push({ text: text.slice(index, start), latin: false });
    runs.push({ text: m[0], latin: true });
    index = start + m[0].length;
  }
  if (index < text.length) runs.push({ text: text.slice(index), latin: false });
  return runs.filter((r) => r.text.length > 0);
}

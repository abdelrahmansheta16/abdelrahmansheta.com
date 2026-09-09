/** Voice-channel text normalisation for TTS: digits → Egyptian/English number words, percent, years, tashkeel map. Area A. */
import type { Locale } from "@/lib/tools/schema";

export interface NormaliseOptions {
  locale: Locale;
  tashkeel?: Record<string, string>;   // curated word → vowelled form
  keepLatin?: string[];                // tech terms never transliterated
}

/* ------------------------------------------------------------------ *
 * English number words
 * ------------------------------------------------------------------ */

const EN_ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const EN_SCALES: ReadonlyArray<readonly [number, string]> = [
  [1_000_000_000_000, "trillion"],
  [1_000_000_000, "billion"],
  [1_000_000, "million"],
  [1_000, "thousand"],
];

function enBelow100(n: number): string {
  if (n < 20) return EN_ONES[n];
  const tens = EN_TENS[Math.floor(n / 10)];
  const rest = n % 10;
  return rest === 0 ? tens : `${tens}-${EN_ONES[rest]}`;
}

function enBelow1000(n: number): string {
  if (n < 100) return enBelow100(n);
  const hundreds = `${EN_ONES[Math.floor(n / 100)]} hundred`;
  const rest = n % 100;
  return rest === 0 ? hundreds : `${hundreds} ${enBelow100(rest)}`;
}

function enCardinal(n: number): string {
  if (n === 0) return "zero";
  if (n < 0) return `minus ${enCardinal(-n)}`;
  for (const [value, name] of EN_SCALES) {
    if (n >= value) {
      const head = `${enCardinal(Math.floor(n / value))} ${name}`;
      const rest = n % value;
      return rest === 0 ? head : `${head} ${enCardinal(rest)}`;
    }
  }
  return enBelow1000(n);
}

/** "2023" → "twenty twenty-three", "2006" → "two thousand six", "1905" → "nineteen oh five". */
function enYear(n: number): string {
  if (n < 1000 || n > 9999) return enCardinal(n);
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (lo < 10 && n % 1000 < 100) return enCardinal(n); // 2000 → "two thousand", 2006 → "two thousand six"
  if (lo === 0) return `${enBelow100(hi)} hundred`; // 1900 → "nineteen hundred"
  if (lo < 10) return `${enBelow100(hi)} oh ${EN_ONES[lo]}`; // 1905 → "nineteen oh five"
  return `${enBelow100(hi)} ${enBelow100(lo)}`; // 2023 → "twenty twenty-three"
}

/* ------------------------------------------------------------------ *
 * Egyptian Arabic (Masri) number words
 * ------------------------------------------------------------------ */

const AR_ONES = [
  "صفر", "واحد", "اتنين", "تلاتة", "أربعة", "خمسة", "ستة", "سبعة", "تمانية", "تسعة",
  "عشرة", "حداشر", "اتناشر", "تلتاشر", "أربعتاشر", "خمستاشر", "ستاشر", "سبعتاشر", "تمنتاشر", "تسعتاشر",
];
/** Units as they are said inside a compound: 38 is "تمنية وتلاتين", not "تمانية وتلاتين". */
const AR_ONES_COMPOUND = [...AR_ONES];
AR_ONES_COMPOUND[8] = "تمنية";

const AR_TENS = ["", "", "عشرين", "تلاتين", "أربعين", "خمسين", "ستين", "سبعين", "تمانين", "تسعين"];
const AR_HUNDREDS = ["", "مية", "ميتين", "تلتمية", "ربعمية", "خمسمية", "ستمية", "سبعمية", "تمنمية", "تسعمية"];
/** Construct ("counted") forms used before a plural noun and before آلاف/ملايين. */
const AR_COUNTED = ["", "", "", "تلات", "أربع", "خمس", "ست", "سبع", "تمن", "تسع", "عشر"];

interface ArScale {
  readonly value: number;
  readonly singular: string;
  readonly dual: string;
  readonly plural: string;
}
const AR_SCALES: readonly ArScale[] = [
  { value: 1_000_000_000, singular: "مليار", dual: "مليارين", plural: "مليارات" },
  { value: 1_000_000, singular: "مليون", dual: "مليونين", plural: "ملايين" },
  { value: 1_000, singular: "ألف", dual: "ألفين", plural: "آلاف" },
];

function arBelow100(n: number): string {
  if (n < 20) return AR_ONES[n];
  const tens = AR_TENS[Math.floor(n / 10)];
  const rest = n % 10;
  return rest === 0 ? tens : `${AR_ONES_COMPOUND[rest]} و${tens}`;
}

function arBelow1000(n: number): string {
  if (n < 100) return arBelow100(n);
  const hundreds = AR_HUNDREDS[Math.floor(n / 100)];
  const rest = n % 100;
  return rest === 0 ? hundreds : `${hundreds} و${arBelow100(rest)}`;
}

function arCardinal(n: number): string {
  if (n === 0) return "صفر";
  if (n < 0) return `سالب ${arCardinal(-n)}`;
  for (const scale of AR_SCALES) {
    if (n < scale.value) continue;
    const count = Math.floor(n / scale.value);
    const rest = n % scale.value;
    let head: string;
    if (count === 1) head = scale.singular;
    else if (count === 2) head = scale.dual;
    // 3000 is said as one elided word in Masri; 4000-10000 take the construct form + plural.
    else if (count === 3 && scale.value === 1_000) head = "تلاتالاف";
    else if (count <= 10) head = `${AR_COUNTED[count]} ${scale.plural}`;
    else head = `${arCardinal(count)} ${scale.singular}`;
    return rest === 0 ? head : `${head} و${arCardinal(rest)}`;
  }
  return arBelow1000(n);
}

/* ------------------------------------------------------------------ *
 * Public number API
 * ------------------------------------------------------------------ */

/** 2023 → "ألفين وتلاتة وعشرين" (ar) / "twenty twenty-three" (en). Exposed for fixtures. */
export function numberToWords(n: number, locale: Locale, kind: "cardinal" | "year" | "percent" = "cardinal"): string {
  if (!Number.isFinite(n)) throw new RangeError(`numberToWords: ${String(n)} is not a finite number`);
  const int = Math.trunc(n);
  if (locale === "ar") {
    // Masri reads years exactly like cardinals: 2023 → "ألفين وتلاتة وعشرين".
    const words = arCardinal(int);
    return kind === "percent" ? `${words} في المية` : words;
  }
  const words = kind === "year" ? enYear(int) : enCardinal(int);
  return kind === "percent" ? `${words} percent` : words;
}

/** "99.95" → "ninety-nine point nine five" / "تسعة وتسعين فاصلة خمسة وتسعين". */
function decimalToWords(raw: string, locale: Locale): string {
  const [intPart, fracPart = ""] = raw.split(".");
  const intWords = numberToWords(Number(intPart || "0"), locale);
  if (!fracPart) return intWords;
  if (locale === "ar") return `${intWords} فاصلة ${arCardinal(Number(fracPart))}`;
  const digits = [...fracPart].map((d) => EN_ONES[Number(d)]).join(" ");
  return `${intWords} point ${digits}`;
}

const SCALE_WORDS: Record<string, { en: string; ar: string }> = {
  k: { en: "thousand", ar: "ألف" },
  m: { en: "million", ar: "مليون" },
  b: { en: "billion", ar: "مليار" },
  t: { en: "trillion", ar: "تريليون" },
};

const CURRENCY_WORDS: Record<string, { en: string; ar: string }> = {
  $: { en: "dollars", ar: "دولار" },
  "€": { en: "euros", ar: "يورو" },
  "£": { en: "pounds", ar: "جنيه" },
  usd: { en: "dollars", ar: "دولار" },
  eur: { en: "euros", ar: "يورو" },
  gbp: { en: "pounds", ar: "جنيه" },
  egp: { en: "Egyptian pounds", ar: "جنيه" },
  aed: { en: "dirhams", ar: "درهم" },
  sar: { en: "riyals", ar: "ريال" },
  qar: { en: "riyals", ar: "ريال" },
};

/* ------------------------------------------------------------------ *
 * Sentence scanning
 * ------------------------------------------------------------------ */

const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const NOT_AFTER = String.raw`(?<![\p{L}\p{N}.])`;
const NOT_BEFORE = String.raw`(?![\p{L}\p{N}])`;

const MONEY_SCANNER = new RegExp(
  [
    `${NOT_AFTER}(?<sym>[$€£])\\s?(?<symnum>${NUM})(?<symscale>[kmbt])?${NOT_BEFORE}`,
    `${NOT_AFTER}(?<codenum>${NUM})(?<codescale>[kmbt])?\\s*(?<code>usd|eur|gbp|egp|aed|sar|qar)${NOT_BEFORE}`,
    `${NOT_AFTER}(?<pct>${NUM})\\s*(?:%|٪)`,
    `${NOT_AFTER}(?<num>${NUM})(?<numscale>[kmbt])?${NOT_BEFORE}`,
  ].join("|"),
  "giu",
);

const ARABIC_LETTER_AHEAD = /^\s*[ء-ي]/;
const ARABIC_INDIC = /[٠-٩]/g;
const ARABIC_EXTENDED = /[۰-۹]/g;

function asciiDigits(text: string): string {
  return text
    .replace(ARABIC_INDIC, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48))
    .replace(ARABIC_EXTENDED, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06f0 + 48));
}

function bareNumberWords(raw: string, locale: Locale): string {
  const cleaned = raw.replace(/,/g, "");
  if (cleaned.includes(".")) return decimalToWords(cleaned, locale);
  return numberToWords(Number(cleaned), locale, "cardinal");
}

/** A plain 4-digit token in 1900-2099 with no separators reads as a year. */
function isYearToken(raw: string): boolean {
  if (!/^\d{4}$/.test(raw)) return false;
  const value = Number(raw);
  return value >= 1900 && value <= 2099;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Convert a sentence for speech. Text channel does NOT call this (digits allowed). */
export function normaliseForSpeech(sentence: string, opts: NormaliseOptions): string {
  if (!sentence) return "";
  const { locale } = opts;
  let text = asciiDigits(sentence);

  // 1. Protect tech terms so "v2.5" or "S3" never becomes "v two point five".
  const keep = (opts.keepLatin ?? []).filter(Boolean).sort((a, b) => b.length - a.length);
  const placeholders: string[] = [];
  keep.forEach((term) => {
    const re = new RegExp(escapeRegExp(term), "gi");
    text = text.replace(re, (hit) => {
      const token = `${String.fromCharCode(0xe100 + placeholders.length)}`;
      placeholders.push(hit);
      return token;
    });
  });

  // 2. Numbers, money and percentages.
  let out = "";
  let cursor = 0;
  for (const match of text.matchAll(MONEY_SCANNER)) {
    const index = match.index ?? 0;
    const groups = match.groups ?? {};
    const tail = text.slice(index + match[0].length);
    out += text.slice(cursor, index);
    out += renderMatch(groups, tail, locale);
    cursor = index + match[0].length;
  }
  out += text.slice(cursor);

  // 3. Restore the protected terms.
  out = out.replace(/\uE000([\uE100-\uE1FF])\uE001/gu, (_whole: string, ch: string) => placeholders[ch.charCodeAt(0) - 0xe100] ?? "");

  // 4. Curated tashkeel, on whole words only.
  const map = opts.tashkeel;
  if (map) out = out.replace(/[\p{L}\p{M}]+/gu, (word) => map[word] ?? word);

  return out.replace(/[ \t]+/g, " ").trim();
}

function renderMatch(groups: Record<string, string | undefined>, tail: string, locale: Locale): string {
  const scaleWord = (letter: string | undefined): string =>
    letter ? ` ${SCALE_WORDS[letter.toLowerCase()][locale]}` : "";

  if (groups.sym && groups.symnum) {
    const currency = CURRENCY_WORDS[groups.sym][locale];
    return `${bareNumberWords(groups.symnum, locale)}${scaleWord(groups.symscale)} ${currency}`;
  }
  if (groups.code && groups.codenum) {
    const currency = CURRENCY_WORDS[groups.code.toLowerCase()][locale];
    return `${bareNumberWords(groups.codenum, locale)}${scaleWord(groups.codescale)} ${currency}`;
  }
  if (groups.pct) {
    const cleaned = groups.pct.replace(/,/g, "");
    const words = cleaned.includes(".") ? decimalToWords(cleaned, locale) : numberToWords(Number(cleaned), locale);
    return locale === "ar" ? `${words} في المية` : `${words} percent`;
  }

  const raw = groups.num ?? "";
  if (!raw) return "";
  if (groups.numscale) return `${bareNumberWords(raw, locale)}${scaleWord(groups.numscale)}`;
  if (isYearToken(raw)) return numberToWords(Number(raw), locale, "year");

  const cleaned = raw.replace(/,/g, "");
  // Masri counted nouns: "3 سنين" → "تلات سنين", but a bare "3" stays "تلاتة".
  if (locale === "ar" && /^\d+$/.test(cleaned)) {
    const value = Number(cleaned);
    if (value >= 3 && value <= 10 && ARABIC_LETTER_AHEAD.test(tail)) return AR_COUNTED[value];
  }
  return bareNumberWords(raw, locale);
}

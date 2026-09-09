/**
 * Deterministic red-line guard (invariants 1-4). Pure functions, no I/O. Implemented in area A.
 * Runs on every assistant sentence before it reaches TTS or the browser, and at build time over the corpus.
 */
import { findPhoneNumbersInText } from "libphonenumber-js";
import type { GuardRule, GuardVerdict } from "./types";
import { TOOL_NAMES } from "@/lib/tools/schema";
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

/* ------------------------------------------------------------------ *
 * Normalisation — for matching only, never for TTS or the browser.
 * ------------------------------------------------------------------ */

const ARABIC_INDIC = /[٠-٩]/g;
const ARABIC_EXTENDED = /[۰-۹]/g;
/** Tatweel U+0640, the tashkeel block U+064B-U+0652, and the stray marks models sprinkle around it. */
const DIACRITICS = /[ـً-ْٓ-ٰٟۖ-ۭ]/g;
/** Bidi controls, zero-width joiners, soft hyphen, BOM — invisible characters used to break naive matchers. */
const INVISIBLES = /[​-‏‪-‮⁦-⁩؜﻿­]/g;
const ALEF_VARIANTS = /[أإآٱٲٳ]/g;

/** Exported so the corpus compiler and the tests share exactly one normal form. */
export function normaliseForMatch(text: string): string {
  if (!text) return "";
  let out = text.normalize("NFKC");
  out = out.replace(ARABIC_INDIC, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48));
  out = out.replace(ARABIC_EXTENDED, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06f0 + 48));
  out = out.replace(DIACRITICS, "");
  out = out.replace(INVISIBLES, "");
  out = out.replace(ALEF_VARIANTS, "ا"); // أ إ آ ٱ → ا
  out = out.replace(/ى/g, "ي"); // ى → ي
  out = out.replace(/ة/g, "ه"); // ة → ه
  out = out.toLowerCase();
  return out.replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ *
 * Lexicons. Everything below is stored in the normal form above.
 * ------------------------------------------------------------------ */

const SPELLED_DIGITS_EN = ["zero", "oh", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** Masri digit words plus the MSA spellings a model may drift into. */
const SPELLED_DIGITS_AR = [
  "صفر",
  "واحد",
  "اتنين",
  "اثنين",
  "تلاتة",
  "ثلاثة",
  "أربعة",
  "اربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "تمانية",
  "ثمانية",
  "تمنية",
  "تسعة",
  "عشرة",
].map(normaliseForMatch);

const SPELLED_DIGITS = new Set([...SPELLED_DIGITS_EN, ...SPELLED_DIGITS_AR]);
/** Tokens that may sit inside a spelled-out number without ending the run. */
const SPELLED_CONNECTORS = new Set(["and", "dash", "و"]);

const CURRENCY_CODES = ["usd", "eur", "gbp", "aed", "sar", "egp", "qar", "kwd"];
const MONEY_WORDS = [
  "dollar",
  "dollars",
  "euro",
  "euros",
  "pound",
  "pounds",
  "dirham",
  "dirhams",
  "riyal",
  "riyals",
  "دولار",
  "دولارات",
  "يورو",
  "جنيه",
  "جنيهات",
  "درهم",
  "دراهم",
  "ريال",
  "ريالات",
].map(normaliseForMatch);
/** Magnitude words that make a bare number read as an amount for the salary rule. */
const MAGNITUDE_WORDS = ["k", "thousand", "thousands", "million", "ألف", "آلاف", "الاف", "مليون"].map(normaliseForMatch);

const SALARY_LEXICON_SINGLE = [
  "salary",
  "salaries",
  "compensation",
  "comp",
  "pay",
  "paid",
  "rate",
  "package",
  "expectations",
  "offer",
  "tc",
  "مرتب",
  "المرتب",
  "مرتبك",
  "راتب",
  "الراتب",
  "أجر",
  "الأجر",
  "بكام",
].map(normaliseForMatch);

const SALARY_LEXICON_PHRASES = ["كام في الشهر", "كام في السنة"].map(normaliseForMatch);

const JOB_SEEKING_PHRASES = [
  "actively looking",
  "actively searching",
  "job hunting",
  "job hunt",
  "applying to",
  "applying for",
  "interviewing at",
  "interviewing with",
  "looking for a job",
  "looking for a role",
  "looking for a position",
  "looking for work",
  "on the job market",
  "بدور على شغل",
  "بدور على وظيفة",
  "بدور على وظايف",
  "بقدم على وظايف",
  "بقدم على شغل",
  "بعمل انترفيوهات",
  "بعمل انترفيوز",
].map(normaliseForMatch);

const INJECTION_PHRASES = [
  "ignore previous",
  "ignore the previous",
  "ignore all previous",
  "ignore above",
  "ignore the above",
  "ignore your instructions",
  "disregard previous",
  "disregard the above",
  "forget your instructions",
  "system prompt",
  "reveal your prompt",
  "reveal your instructions",
  "print your instructions",
  "repeat your instructions",
  "show me your instructions",
  "you are now",
  "act as if you are",
  "developer mode",
  "jailbreak",
  "dan mode",
  "انسى التعليمات",
  "تجاهل التعليمات",
  "تجاهل",
  "اعمل نفسك",
  "اطبع التعليمات",
  "قوللي التعليمات",
  "التعليمات بتاعتك",
  "البرومبت",
].map(normaliseForMatch);

/** A run of 7+ digits, allowing a single space/dot/dash/slash between consecutive digits. */
const DIGIT_RUN = /\d(?:[ .\-–—/]?\d){6,}/g;
const YEAR_SPAN = /(?<!\d)(1[89]\d{2}|20\d{2})(?!\d)/g;
const PERCENT_SPAN = /\d[\d,.]*\s*(?:%|٪|percent|في المية|في المئة)/g;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/;
/** "name at domain dot com" / "الاسم آت الدومين دوت كوم" (آت normalises to ات). */
const SPOKEN_EMAIL_RE =
  /(?:^|[^\p{L}\p{N}])[\p{L}\p{N}._-]{2,}\s+(?:at|ات)\s+[\p{L}\p{N}.-]{2,}\s+(?:dot|دوت)\s+[\p{L}]{2,}(?![\p{L}\p{N}])/u;
const JSON_HEAD_RE = /^\s*\{\s*"(?:name|tool|function)"\s*:/;
const FENCED_RE = /```[\s\S]*?```/g;

/**
 * Thresholds. A real Egyptian mobile is 11 digits, so 9 loose digits in one sentence is already
 * suspicious; 7 is the spec floor for a contiguous run and for the cross-sentence carry.
 */
const RUN_MIN = 7;
const SENTENCE_TOTAL_MIN = 9;
const CARRY_MIN = 7;
const SPELLED_MIN = 7;
const MAX_CARRY = 24;

const RULE_ORDER: GuardRule[] = [
  "canary",
  "confidential",
  "phone",
  "email",
  "salary",
  "job_seeking",
  "json_shape",
  "topic",
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Blank out every occurrence of each needle, preserving offsets so later regexes stay aligned. */
function maskAll(text: string, needles: readonly string[]): string {
  let out = text;
  for (const needle of needles) {
    if (!needle) continue;
    let idx = out.indexOf(needle);
    while (idx !== -1) {
      out = out.slice(0, idx) + " ".repeat(needle.length) + out.slice(idx + needle.length);
      idx = out.indexOf(needle, idx + needle.length);
    }
  }
  return out;
}

function maskRegex(text: string, re: RegExp): string {
  return text.replace(re, (m) => " ".repeat(m.length));
}

const TOKEN_SPLIT = /[\s,،؛;:!؟?"'“”()[\]{}<>/\\|]+/u;

/** Whitespace/punctuation tokens, trimmed of leading and trailing dots and dashes. */
export function tokenise(text: string): string[] {
  const tokens: string[] = [];
  for (const part of text.split(TOKEN_SPLIT)) {
    if (!part) continue;
    const trimmed = part.replace(/^[.\-–—]+/, "").replace(/[.\-–—]+$/, "");
    if (trimmed) tokens.push(trimmed);
  }
  return tokens;
}

function looksLikeMoneyToken(token: string): boolean {
  if (/[$€£﷼]/.test(token)) return true;
  if (CURRENCY_CODES.includes(token)) return true;
  if (MONEY_WORDS.includes(token)) return true;
  if (MAGNITUDE_WORDS.includes(token)) return true;
  return /^\d[\d.,]*k$/.test(token);
}

/** Longest run of consecutive spelled-out digit words, ignoring "and"/"و" connectors. */
function longestSpelledRun(tokens: readonly string[]): number {
  let best = 0;
  let run = 0;
  for (const token of tokens) {
    const bare =
      token.length > 1 && token.startsWith("و") && SPELLED_DIGITS.has(token.slice(1)) ? token.slice(1) : token;
    if (SPELLED_DIGITS.has(bare)) {
      run += 1;
      if (run > best) best = run;
    } else if (!SPELLED_CONNECTORS.has(bare)) {
      run = 0;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Factory — every regex and lexicon is bound once, per invariant "under 1 ms".
 * ------------------------------------------------------------------ */

export function createGuard(config: GuardConfig): Guard {
  const denylist = config.denylist.map(normaliseForMatch).filter(Boolean);
  const allowedEmails = config.allowedEmails.map(normaliseForMatch).filter(Boolean);
  /** The spoken renderings of an allowed address are allowed too — voice cannot pronounce "@". */
  const allowedEmailSpoken = allowedEmails.flatMap((address) => [
    address.replace(/@/g, " at ").replace(/\./g, " dot "),
    address.replace(/@/g, " ات ").replace(/\./g, " دوت "),
  ]);
  const allowedMetrics = config.allowedMetrics.map(normaliseForMatch).filter(Boolean);
  /** Longest needle first so "99.95% uptime" masks before "99.95%". */
  const allowSpans = [...allowedMetrics, ...allowedEmails, ...allowedEmailSpoken].sort((a, b) => b.length - a.length);
  const topics = config.topics.map(normaliseForMatch).filter(Boolean);
  const canary = normaliseForMatch(config.canary);
  const toolNames: readonly string[] = TOOL_NAMES;

  const refusalFor = (rule: GuardRule, locale: Locale): string => {
    const key = rule === "canary" || rule === "json_shape" ? "generic" : rule;
    const entry = config.refusals[key] ?? config.refusals.generic;
    return entry[locale] ?? entry.en;
  };

  /** Digits that count towards phone detection: allowlisted metrics, years and percentages do not. */
  const countableDigits = (masked: string): string => {
    const clean = maskRegex(maskRegex(masked, PERCENT_SPAN), YEAR_SPAN);
    return (clean.match(/\d/g) ?? []).join("");
  };

  const hasDigitRun = (masked: string): boolean => {
    const clean = maskRegex(maskRegex(masked, PERCENT_SPAN), YEAR_SPAN);
    for (const match of clean.matchAll(DIGIT_RUN)) {
      if ((match[0].match(/\d/g) ?? []).length >= RUN_MIN) return true;
    }
    return false;
  };

  const hasParsablePhone = (masked: string): boolean => {
    // libphonenumber is the expensive check; only pay for it when there is enough material.
    if ((masked.match(/\d/g) ?? []).length < 5) return false;
    try {
      return findPhoneNumbersInText(masked, { defaultCountry: "EG" }).length > 0;
    } catch {
      return false;
    }
  };

  const hasEmail = (masked: string): boolean => EMAIL_RE.test(masked) || SPOKEN_EMAIL_RE.test(masked);

  const hasSalary = (masked: string, tokens: readonly string[], lastUserTurn: string | undefined): boolean => {
    const moneyIdx: number[] = [];
    tokens.forEach((t, i) => {
      if (looksLikeMoneyToken(t)) moneyIdx.push(i);
    });
    if (moneyIdx.length === 0) return false;

    const lexiconIdx: number[] = [];
    tokens.forEach((t, i) => {
      if (SALARY_LEXICON_SINGLE.includes(t)) lexiconIdx.push(i);
    });
    // Multi-word lexicon entries are matched on the string; if present, every money token is in range.
    const phraseHit = SALARY_LEXICON_PHRASES.some((p) => masked.includes(p));
    if (phraseHit) return true;

    for (const m of moneyIdx) {
      for (const l of lexiconIdx) {
        if (Math.abs(m - l) <= 12) return true;
      }
    }

    if (lastUserTurn) {
      const asked = normaliseForMatch(lastUserTurn);
      const askedTokens = tokenise(asked);
      if (
        askedTokens.some((t) => SALARY_LEXICON_SINGLE.includes(t)) ||
        SALARY_LEXICON_PHRASES.some((p) => asked.includes(p))
      ) {
        return true;
      }
    }
    return false;
  };

  const hasJobSeeking = (masked: string): boolean => JOB_SEEKING_PHRASES.some((p) => masked.includes(p));

  const hasJsonShape = (raw: string): boolean => {
    if (JSON_HEAD_RE.test(raw)) return true;
    const lower = raw.toLowerCase();
    for (const block of raw.match(FENCED_RE) ?? []) {
      const blockLower = block.toLowerCase();
      if (toolNames.some((name) => blockLower.includes(name))) return true;
    }
    return lower.includes("<tool_call>") && toolNames.some((name) => lower.includes(name));
  };

  const hasTopic = (masked: string): boolean => topics.some((t) => masked.includes(t));

  const hasConfidential = (norm: string): boolean => denylist.some((d) => norm.includes(d));

  return {
    normaliseForMatch,

    checkSentence(sentence, ctx) {
      const raw = (sentence ?? "").replace(INVISIBLES, "");
      const norm = normaliseForMatch(raw);
      const masked = maskAll(norm, allowSpans);
      const tokens = tokenise(masked);

      const carryIn = ctx.digitCarry ?? "";
      const spelledRun = longestSpelledRun(tokens);
      // Spelled digits count as digits for the carry; the exact values do not matter, only the length.
      const sentenceDigits = countableDigits(masked) + "0".repeat(Math.min(spelledRun, MAX_CARRY));
      const digitCarry = sentenceDigits.length === 0 ? "" : (carryIn + sentenceDigits).slice(-MAX_CARRY);

      const block = (rule: GuardRule): GuardVerdict => ({
        ok: false,
        rule,
        replacement: refusalFor(rule, ctx.locale),
        digitCarry,
      });

      if (canary && norm.includes(canary)) return block("canary");
      if (hasConfidential(norm)) return block("confidential");

      const phone =
        hasDigitRun(masked) ||
        sentenceDigits.length >= SENTENCE_TOTAL_MIN ||
        spelledRun >= SPELLED_MIN ||
        (carryIn.length > 0 && carryIn.length + sentenceDigits.length >= CARRY_MIN) ||
        hasParsablePhone(masked);
      if (phone) return block("phone");

      if (hasEmail(masked)) return block("email");
      if (hasSalary(masked, tokens, ctx.lastUserTurn)) return block("salary");
      if (hasJobSeeking(masked)) return block("job_seeking");
      if (hasJsonShape(raw)) return block("json_shape");
      if (hasTopic(masked)) return block("topic");

      return { ok: true, digitCarry };
    },

    lint(text) {
      const raw = (text ?? "").replace(INVISIBLES, "");
      const norm = normaliseForMatch(raw);
      const masked = maskAll(norm, allowSpans);
      const tokens = tokenise(masked);
      const spelledRun = longestSpelledRun(tokens);
      const digits = countableDigits(masked);

      const fired = new Set<GuardRule>();
      if (canary && norm.includes(canary)) fired.add("canary");
      if (hasConfidential(norm)) fired.add("confidential");
      if (
        hasDigitRun(masked) ||
        digits.length + spelledRun >= SENTENCE_TOTAL_MIN ||
        spelledRun >= SPELLED_MIN ||
        hasParsablePhone(masked)
      ) {
        fired.add("phone");
      }
      if (hasEmail(masked)) fired.add("email");
      if (hasSalary(masked, tokens, undefined)) fired.add("salary");
      if (hasJobSeeking(masked)) fired.add("job_seeking");
      if (hasJsonShape(raw)) fired.add("json_shape");
      if (hasTopic(masked)) fired.add("topic");

      return RULE_ORDER.filter((r) => fired.has(r));
    },

    looksLikeInjection(userText) {
      const norm = normaliseForMatch(userText ?? "");
      if (!norm) return false;
      return INJECTION_PHRASES.some((p) => norm.includes(p));
    },
  };
}

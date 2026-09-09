/**
 * Build-time lints for the private corpus: denylist strings, digits in voice-facing text, and
 * capitalised proper nouns that are not on policy/allowlist.txt. Pure functions, no I/O.
 */

const ARABIC_INDIC = /[\u0660-\u0669]/g;
const EASTERN_ARABIC_INDIC = /[\u06F0-\u06F9]/g;
const TATWEEL_AND_TASHKEEL = /[\u0640\u064B-\u0652\u0653-\u0655\u0670]/g;

/** Any digit, ASCII or Arabic-Indic. */
export const ANY_DIGIT = /[0-9\u0660-\u0669\u06F0-\u06F9]/;

/**
 * Fold text for matching only: Arabic-Indic digits to ASCII, tatweel/tashkeel stripped, alef/yaa/taa
 * variants unified, lower-cased, whitespace collapsed. Never used for rendering.
 */
export function normaliseForMatch(text: string): string {
  return text
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EASTERN_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(TATWEEL_AND_TASHKEEL, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Read a `#`-commented, one-entry-per-line policy file into trimmed entries. */
export function parseListFile(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/** Every denylist entry that occurs in `text` (normalised, case-insensitive). */
export function findDenylistHits(text: string, denylist: readonly string[]): string[] {
  const haystack = normaliseForMatch(text);
  const hits: string[] = [];
  for (const entry of denylist) {
    const needle = normaliseForMatch(entry);
    if (needle.length > 0 && haystack.includes(needle)) hits.push(entry);
  }
  return hits;
}

/** Digits found in voice-facing text; numbers there must be spelled as words. */
export function findDigitHits(text: string): string[] {
  const matches = text.match(/[0-9\u0660-\u0669\u06F0-\u06F9]+/g);
  return matches ? [...new Set(matches)] : [];
}

/** Words that may start a sentence in capitalised form without being proper nouns. */
const SENTENCE_INITIAL_COMMON = new Set([
  "a", "about", "after", "all", "also", "an", "and", "another", "any", "anyone", "as", "at", "back",
  "because", "before", "being", "both", "but", "by", "did", "do", "does", "doing", "done", "down",
  "during", "each", "either", "even", "every", "everyone", "few", "first", "for", "from", "given",
  "had", "half", "has", "have", "he", "her", "here", "his", "how", "however", "i", "if", "in",
  "instead", "into", "is", "it", "its", "just", "keep", "last", "later", "less", "let", "like",
  "look", "make", "many", "maybe", "me", "more", "most", "much", "my", "neither", "never", "next",
  "no", "none", "nobody", "not", "nothing", "now", "of", "off", "on", "once", "one", "only", "or",
  "other", "our", "out", "over", "own", "per", "put", "rather", "run", "same", "she", "should",
  "since", "so", "some", "still", "such", "take", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "this", "those", "though", "three", "through", "to", "today", "too",
  "two", "under", "until", "up", "use", "very", "was", "we", "well", "were", "what", "when",
  "where", "which", "while", "who", "why", "will", "with", "within", "without", "would", "yes",
  "yet", "you", "your",
]);

const CAPITALISED_TOKEN = /[A-Z][A-Za-z][A-Za-z0-9'’.-]*/g;
const SENTENCE_BOUNDARY = /[.!?:;\n\-*"'“”(\[—•]/;

/**
 * Capitalised Latin tokens (2+ letters) in `text` that are not on the allowlist. Multi-word allowlist
 * entries are matched as phrases first, so "Puffer Protocol" clears both of its words.
 */
export function findAllowlistViolations(text: string, allowlist: readonly string[]): string[] {
  const phrases = allowlist.filter((a) => /\s/.test(a)).sort((a, b) => b.length - a.length);
  let scrubbed = text;
  for (const phrase of phrases) scrubbed = scrubbed.split(phrase).join(" ".repeat(phrase.length));

  const singles = new Set(allowlist.filter((a) => !/\s/.test(a)));
  const violations = new Set<string>();
  for (const match of scrubbed.matchAll(CAPITALISED_TOKEN)) {
    const token = match[0].replace(/[.'’-]+$/, "");
    if (token.length < 2) continue;
    if (singles.has(token)) continue;
    if (isSentenceInitial(scrubbed, match.index)) {
      if (SENTENCE_INITIAL_COMMON.has(token.toLowerCase())) continue;
    }
    violations.add(token);
  }
  return [...violations];
}

function isSentenceInitial(text: string, index: number): boolean {
  for (let i = index - 1; i >= 0; i -= 1) {
    const ch = text[i] ?? "";
    if (ch === "\n" || ch === "\r") return true; // a new line starts a new sentence
    if (/\s/.test(ch)) continue;
    return SENTENCE_BOUNDARY.test(ch);
  }
  return true;
}

/** Recursively collect every string in a parsed corpus value, for whole-corpus lints. */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectStrings(item, out);
  return out;
}

/**
 * The build-time corpus lint, shared by scripts/compile-corpus.ts and tests/guardrails.
 *
 * Deliberately narrower than the runtime guard. At runtime the guard judges what the agent SAYS, so
 * "I'm actively looking" must be blocked. At build time it judges a document that has to QUOTE the
 * phrases it forbids: policy/redlines.yaml carries the refusal templates, the few-shots demonstrate
 * them, and policy/topics.yaml names the deflected topics precisely so the agent deflects them.
 * Linting those with the job_seeking and topic rules fails the build for correct content.
 *
 * It also runs line by line and replaces the phone rule. The runtime rule blocks on loose digit
 * DENSITY, which is right for one spoken sentence and wrong for a 7,000-token document: a real CV
 * bullet and the prompt's own 16-hex canary both trip it. In an authored document a leaked number is
 * contiguous or parseable, so that is what this looks for. The owner's real numbers are on the
 * denylist too, so the confidential rule catches them regardless.
 */
export const LEAK_RULES: ReadonlySet<string> = new Set([
  "email",
  "salary",
  "confidential",
  "canary",
]);

/** A contiguous run of 7+ digits (single separators allowed), ignoring 4-digit years. */
export function looksLikePhoneNumber(line: string): boolean {
  const ascii = line
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  return /(?:\d[ .-]?){7,}/.test(ascii.replace(/\b(?:19|20)\d{2}\b/g, " "));
}

/** Wrap a runtime guard as the build-time corpus lint. */
export function createCorpusLint(guard: { lint(text: string): string[] }): (text: string) => string[] {
  return (text: string) => {
    const fired = new Set<string>();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      for (const rule of guard.lint(line)) if (LEAK_RULES.has(rule)) fired.add(rule);
      if (looksLikePhoneNumber(line)) fired.add("phone");
    }
    return [...fired];
  };
}

/**
 * Turns a project's markdown deep-dive into a card-sized summary.
 *
 * Why this exists: the project cards rendered `project.body` straight into a single `<p>`. Those
 * bodies are full deep-dives — the longest is just under 8,000 characters — so the section was
 * roughly 34,000 characters of unbroken prose with literal `##` markdown showing as text. Nobody
 * reads that on a card, and the depth was already available: the agent has every body in its
 * prompt, and that is what it is for.
 *
 * Nothing here writes prose. The lead is the author's own opening paragraph and each bullet is a
 * heading he chose plus the first sentence he wrote under it, so the card is a structural extract
 * rather than a paraphrase.
 */

export interface Highlight {
  /** The `## ` heading, used as the bullet label. */
  label: string;
  /** First sentence beneath it. */
  text: string;
}

export interface ProjectSummary {
  /** The paragraph before the first heading. */
  lead: string;
  highlights: Highlight[];
}

/** Sections that describe what is deliberately absent. True and deliberate, but not a highlight. */
const OMITTED_HEADING = /\bwill not\b/i;

const MAX_LEAD = 240;
const MAX_BULLET = 165;

/** Markdown emphasis and inline code, removed. Links keep their text. */
function stripInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * First sentence of `text`.
 *
 * A full stop between two digits is a decimal point, not a sentence end — the same trap that split
 * "99.95%" in the speech path. Without the guard, "held 99.95% uptime" becomes "held 99."
 */
export function firstSentence(text: string): string {
  const flat = stripInline(text);
  for (let i = 0; i < flat.length; i += 1) {
    const ch = flat[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    const prev = flat[i - 1] ?? "";
    const next = flat[i + 1] ?? "";
    if (ch === "." && /\d/.test(prev) && /\d/.test(next)) continue;
    // A sentence ends at punctuation followed by a space or the end of the string.
    if (next === "" || next === " ") return flat.slice(0, i + 1);
  }
  return flat;
}

/**
 * One sentence, or two when the first is a fragment.
 *
 * Several sections open on a deliberately blunt line — "Not the framework.", "A single Python
 * monorepo." — which lands well in the document, where the next sentence explains it, and reads as
 * a riddle on a card where nothing follows. Below `minChars` the next sentence comes along.
 */
function openingSentences(text: string, minChars: number, maxChars: number): string {
  const flat = stripInline(text);
  const first = firstSentence(flat);
  if (first.length >= minChars || first.length === flat.length) return first;
  const rest = flat.slice(first.length).trim();
  const second = firstSentence(rest);
  if (second.length === 0) return first;
  return `${first} ${second}`.slice(0, maxChars + 40);
}

/** Trims to a whole word and adds an ellipsis, or returns the text unchanged if it already fits. */
function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

export function summariseBody(body: string, maxBullets = 4): ProjectSummary {
  if (body.trim().length === 0) return { lead: "", highlights: [] };

  const lines = body.split("\n");
  const leadLines: string[] = [];
  let index = 0;
  for (; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) break;
    leadLines.push(lines[index]);
  }

  const highlights: Highlight[] = [];
  let label = "";
  let buffer: string[] = [];

  const flush = (): void => {
    if (label.length === 0) return;
    if (!OMITTED_HEADING.test(label) && highlights.length < maxBullets) {
      const sentence = openingSentences(buffer.join(" "), 70, MAX_BULLET);
      if (sentence.length > 0) highlights.push({ label, text: clamp(sentence, MAX_BULLET) });
    }
    label = "";
    buffer = [];
  };

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("## ")) {
      flush();
      label = stripInline(line.slice(3));
      continue;
    }
    if (label.length > 0 && line.trim().length > 0) buffer.push(line.trim());
  }
  flush();

  return { lead: clamp(openingSentences(leadLines.join(" "), 90, MAX_LEAD), MAX_LEAD), highlights };
}

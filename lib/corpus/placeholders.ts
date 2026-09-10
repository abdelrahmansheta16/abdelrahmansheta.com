/**
 * Corpus link fields carry an "OWNER TO FILL: ..." placeholder until the owner supplies a real
 * value, and consumers treated any non-empty string as usable. `cal_link` was still
 * "OWNER TO FILL: https://cal.com/<handle>/intro" when the site was ready to deploy, so the
 * homepage's primary call-to-action rendered a "Book a call" button whose href was that literal
 * sentence — a recruiter clicking it goes nowhere.
 *
 * Treating an unfilled field as absent is what the surrounding code already expects: both
 * consumers have a correct empty state (the button is not rendered; the card says booking is
 * unavailable). This makes "unfilled" and "empty" the same thing.
 */

const PLACEHOLDER = /^\s*OWNER TO FILL\b/i;

/** True when a corpus field still holds its unfilled placeholder. */
export function isPlaceholder(value: string | undefined | null): boolean {
  return typeof value === "string" && PLACEHOLDER.test(value);
}

/**
 * The value if it is usable, otherwise undefined.
 *
 * "Usable" means non-empty and not a placeholder. It deliberately does not require a URL scheme:
 * `cal_link` is legitimately either a full URL or a bare "handle/event-type", and BookCallCard
 * normalises between the two.
 */
export function usableLink(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || isPlaceholder(trimmed)) return undefined;
  return trimmed;
}

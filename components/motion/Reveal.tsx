"use client";
/**
 * Fade-and-rise on scroll.
 *
 * One IntersectionObserver for the entire page, shared at module scope. A per-instance observer is
 * the obvious implementation and the wrong one here: this wraps every section, every project card
 * and every proof metric, so per-instance would mean dozens of observers each with their own
 * callback queue for what is one scroll position.
 *
 * Targets are unobserved once shown — the animation plays once, and nothing keeps watching an
 * element that has already finished.
 *
 * The hidden state lives in CSS under `.js` (see app/globals.css), which an inline script in the
 * layout sets before first paint. So with JavaScript off nothing is ever hidden and the page reads
 * in full, which this site claims and should keep being true.
 */
import { useEffect, useRef, type ElementType, type ReactNode } from "react";

let shared: IntersectionObserver | null = null;
let sawCallback = false;
let failsafe: ReturnType<typeof setTimeout> | null = null;

/**
 * Reveal everything, now.
 *
 * The hidden state is applied by CSS the moment `.js` lands, but it is only ever *removed* by the
 * observer. So anything that stops the observer from reporting leaves the page permanently blank —
 * the content is there, styled to opacity 0, with no second chance. That is a bad way to fail for
 * the sake of a decoration.
 *
 * Seen in practice while building this: in a zero-height viewport nothing can intersect, and every
 * section stayed invisible. A headless renderer, an odd embedding or a print context can all do the
 * same thing.
 */
function revealAll(): void {
  for (const node of document.querySelectorAll<HTMLElement>(".reveal")) {
    node.dataset.shown = "true";
  }
}

function observer(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  shared ??= new IntersectionObserver(
    (entries, self) => {
      // An entry arriving at all — intersecting or not — proves the observer is reporting.
      sawCallback = true;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.shown = "true";
        self.unobserve(entry.target);
      }
    },
    // Slightly inside the viewport so the motion is visible rather than finishing off-screen.
    { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
  );

  // Observers deliver an initial callback for every observed target, so silence for this long means
  // it is not going to report. Show everything rather than leave the page blank.
  failsafe ??= setTimeout(() => {
    if (!sawCallback) revealAll();
  }, 1500);

  return shared;
}

export interface RevealProps {
  children: ReactNode;
  /** Milliseconds, for staggering siblings. */
  delay?: number;
  className?: string;
  as?: ElementType;
  id?: string;
  "aria-label"?: string;
}

export default function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
  ...rest
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    const io = observer();
    if (!node) return;
    // No IntersectionObserver (very old browser, or a test environment): show immediately rather
    // than leaving the content invisible.
    if (!io) {
      node.dataset.shown = "true";
      return;
    }
    io.observe(node);
    return () => io.unobserve(node);
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`}
      style={delay > 0 ? { transitionDelay: `${String(delay)}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * The heading block every section on the spine repeats: title, gradient rule, lede.
 *
 * A Server Component with no client cost — the reveal wrapper around it is the only client part.
 * Extracted because the same three elements appeared five times, and the gradient rule would
 * otherwise be five copies to keep in sync.
 */
import Reveal from "@/components/motion/Reveal";

export interface SectionHeadingProps {
  title: string;
  lede?: string;
}

export default function SectionHeading({ title, lede }: SectionHeadingProps) {
  return (
    <Reveal>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {/* Decorative: the heading above already names the section. */}
      <hr className="grad-rule mt-3 w-28" aria-hidden="true" />
      {lede ? <p className="mt-3 max-w-[var(--measure)] text-muted">{lede}</p> : null}
    </Reveal>
  );
}

"use client";
/**
 * The hero's orb: the Orb component at display size, breathing on its own.
 *
 * A thin client wrapper because Orb is a client component and the hero is a Server Component. It
 * also owns the box the orb sits in, at a fixed size, so the reveal animation above it cannot shift
 * the headline — reserving the space is the difference between a hero that settles and one that
 * jumps while you read it.
 *
 * `idle` is the only state here. The states that mean something — listening, thinking, speaking —
 * belong to a live conversation, and the console's own orb shows them.
 */
import Orb from "@/components/orb/Orb";

export default function HeroOrb({ label }: { label: string }) {
  return (
    <div className="relative flex h-[160px] w-[160px] items-center justify-center sm:h-[184px] sm:w-[184px]">
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, var(--grad-b), var(--grad-a) 45%, transparent 70%)",
        }}
      />
      <Orb state="idle" size={160} label={label} />
    </div>
  );
}

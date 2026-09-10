"use client";
/**
 * The ambient gradient mesh, plus grain over it.
 *
 * A client component only so it can stop animating when it scrolls away. Two blurred, drifting
 * blobs are the single most expensive thing on this page for a mobile GPU, and leaving them running
 * under six screens of content burns battery to render nothing anyone can see. Same
 * IntersectionObserver trick components/orb/Orb.tsx already uses for its rAF loop.
 *
 * Purely decorative: aria-hidden, pointer-events none, and behind everything.
 */
import { useEffect, useRef, useState } from "react";

export interface MeshBackdropProps {
  /** Adds grain over the mesh. On by default; large flat areas band without it. */
  grain?: boolean;
  className?: string;
}

export default function MeshBackdrop({ grain = true, className = "" }: MeshBackdropProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setPaused(!entry.isIntersecting);
      },
      { rootMargin: "120px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      <div className="mesh" data-paused={paused ? "true" : "false"} />
      {grain ? <div className="grain" /> : null}
    </div>
  );
}

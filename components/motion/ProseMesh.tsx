"use client";
/**
 * A mesh band behind the top of a prose page only.
 *
 * The homepage can carry a full-bleed mesh because it is mostly headings and cards. /cv, /privacy
 * and /architecture are documents — a gradient drifting under a paragraph makes it harder to read,
 * which is the opposite of what those pages are for. So the mesh is confined to a header band and
 * faded out below it.
 */
import MeshBackdrop from "@/components/motion/MeshBackdrop";

export default function ProseMesh() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64"
      style={{ maskImage: "linear-gradient(to bottom, #000 0%, transparent 100%)" }}
    >
      <MeshBackdrop grain={false} />
    </div>
  );
}

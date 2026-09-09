"use client";
/**
 * The orb: the console's one piece of motion. Pure CSS conic-gradient layers with blur and a radial
 * mask — no WebGL, no canvas. Audio amplitude drives a Motion MotionValue from a 30 fps rAF loop that
 * reads level getter functions, so a loud room never causes a React re-render. Pauses when scrolled out
 * of view and renders a single static frame under prefers-reduced-motion.
 */
import { useEffect, useMemo, useRef } from "react";
import { motion, useMotionValue, useTransform, useReducedMotion, type MotionValue } from "motion/react";

export type OrbState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted"
  | "capped"
  | "error"
  | "text-only";

export interface OrbProps {
  state: OrbState;
  /** Rendered diameter in px. The hero uses 120, the mobile sheet shrinks to 72 once there is a transcript. */
  size?: number;
  /** 0-1 microphone level, polled (never passed as changing React state). */
  getInputLevel?: () => number;
  /** 0-1 agent output level, polled. */
  getOutputLevel?: () => number;
  label?: string;
}

const FRAME_MS = 1000 / 30;

/** Which side of the conversation the orb should follow in each state. */
function levelSource(state: OrbState): "input" | "output" | "none" {
  if (state === "listening") return "input";
  if (state === "speaking") return "output";
  return "none";
}

export default function Orb({ state, size = 120, getInputLevel, getOutputLevel, label }: OrbProps) {
  const reduced = useReducedMotion();
  const amplitude: MotionValue<number> = useMotionValue(0);
  const scale = useTransform(amplitude, [0, 1], [1, 1.14]);
  const glow = useTransform(amplitude, [0, 1], [0.35, 0.9]);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const source = levelSource(state);

  // Keep the getters in a ref so changing them never restarts the rAF loop.
  const getters = useRef<Pick<OrbProps, "getInputLevel" | "getOutputLevel">>({ getInputLevel, getOutputLevel });
  useEffect(() => {
    getters.current = { getInputLevel, getOutputLevel };
  }, [getInputLevel, getOutputLevel]);

  useEffect(() => {
    if (reduced || source === "none") {
      amplitude.set(0);
      return;
    }
    const host = hostRef.current;
    let visible = true;
    let raf = 0;
    let last = 0;
    let smoothed = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!visible || now - last < FRAME_MS) return;
      last = now;
      const read = source === "input" ? getters.current.getInputLevel : getters.current.getOutputLevel;
      const raw = read ? read() : 0;
      const level = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
      // Asymmetric smoothing: jump to a peak, fall off gently, so speech reads as speech.
      smoothed = level > smoothed ? level : smoothed + (level - smoothed) * 0.18;
      amplitude.set(smoothed);
    };

    const observer =
      host && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            for (const entry of entries) visible = entry.isIntersecting;
          })
        : null;
    if (observer && host) observer.observe(host);

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      amplitude.set(0);
    };
  }, [amplitude, reduced, source]);

  const spin = useMemo(() => {
    if (reduced) return "none";
    switch (state) {
      case "thinking":
        return "orb-spin 2.4s linear infinite";
      case "connecting":
        return "orb-spin 4s linear infinite";
      case "speaking":
        return "orb-spin 6s linear infinite";
      case "listening":
        return "orb-spin 12s linear infinite";
      default:
        return "orb-spin 24s linear infinite";
    }
  }, [reduced, state]);

  return (
    <div
      ref={hostRef}
      data-state={state}
      role="img"
      aria-label={label ?? state}
      className="orb relative shrink-0 select-none"
      style={{ width: size, height: size }}
    >
      <style>{ORB_CSS}</style>
      <motion.div className="orb-halo" style={{ scale, opacity: glow }} aria-hidden />
      <motion.div className="orb-ring" style={{ scale, animation: spin }} aria-hidden />
      <div className="orb-core" aria-hidden />
    </div>
  );
}

/**
 * Scoped with the .orb class so this component stays self-contained and app/globals.css is untouched.
 * The colours are per-state; the geometry is shared.
 */
const ORB_CSS = `
@keyframes orb-spin { to { transform: rotate(360deg); } }
.orb { --orb-a: #6366f1; --orb-b: #22d3ee; --orb-c: #a855f7; }
.orb[data-state="idle"] { --orb-a: #6366f1; --orb-b: #22d3ee; --orb-c: #818cf8; }
.orb[data-state="connecting"] { --orb-a: #94a3b8; --orb-b: #cbd5e1; --orb-c: #64748b; }
.orb[data-state="listening"] { --orb-a: #22d3ee; --orb-b: #34d399; --orb-c: #38bdf8; }
.orb[data-state="thinking"] { --orb-a: #a855f7; --orb-b: #6366f1; --orb-c: #f472b6; }
.orb[data-state="speaking"] { --orb-a: #f59e0b; --orb-b: #f472b6; --orb-c: #6366f1; }
.orb[data-state="muted"] { --orb-a: #64748b; --orb-b: #94a3b8; --orb-c: #475569; }
.orb[data-state="capped"] { --orb-a: #64748b; --orb-b: #a1a1aa; --orb-c: #52525b; }
.orb[data-state="error"] { --orb-a: #ef4444; --orb-b: #f97316; --orb-c: #b91c1c; }
.orb[data-state="text-only"] { --orb-a: #64748b; --orb-b: #38bdf8; --orb-c: #475569; }
.orb > * { position: absolute; inset: 0; border-radius: 9999px; }
.orb-halo {
  background: radial-gradient(circle at 50% 50%, var(--orb-b) 0%, transparent 68%);
  filter: blur(14px);
}
.orb-ring {
  background: conic-gradient(from 0deg, var(--orb-a), var(--orb-b), var(--orb-c), var(--orb-a));
  filter: blur(6px);
  mask: radial-gradient(circle at 50% 50%, transparent 34%, #000 56%, #000 88%, transparent 100%);
  -webkit-mask: radial-gradient(circle at 50% 50%, transparent 34%, #000 56%, #000 88%, transparent 100%);
}
.orb-core {
  inset: 22%;
  background: radial-gradient(circle at 34% 30%, rgba(255,255,255,0.85), rgba(255,255,255,0.06) 62%, transparent 74%);
  box-shadow: inset 0 0 18px rgba(255,255,255,0.25);
}
@media (prefers-reduced-motion: reduce) {
  .orb-ring { animation: none !important; }
}
`;

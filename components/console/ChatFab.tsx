"use client";
/**
 * The floating chat button. Bottom-end corner of every page, on top of everything.
 *
 * `end-6` rather than `right-6`: it is a logical property, so this lands bottom-right in English
 * and bottom-left in Arabic without a second rule. The site is bilingual RTL and physical
 * directions are how that quietly breaks.
 *
 * It opens the console through the same `console:open` window event the hero buttons and prompt
 * chips use — the spine never imports the console, and this does not change that.
 *
 * The face is the real Orb at 44px, so the thing a visitor taps is the same object that then talks
 * to them, rather than a chat-bubble glyph that appears from nowhere.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import Orb from "@/components/orb/Orb";
import {
  CONSOLE_OPEN_EVENT,
  CONSOLE_STATE_EVENT,
  type ConsoleOpenDetail,
} from "@/components/spine/consoleEvents";

/** How far the button leans toward the cursor, in px. */
const MAGNET_PX = 8;

export interface ChatFabProps {
  label: string;
  /** Shown beside the orb on pointer devices wide enough for it. */
  hint?: string;
}

export default function ChatFab({ label, hint }: ChatFabProps) {
  const reduced = useReducedMotion();
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 });

  // Entrance is deferred a beat so the button arrives after the page has settled rather than
  // competing with the hero for attention on first paint.
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 700);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onState = (event: Event) => {
      setConsoleOpen((event as CustomEvent<{ open: boolean }>).detail.open);
    };
    window.addEventListener(CONSOLE_STATE_EVENT, onState);
    return () => window.removeEventListener(CONSOLE_STATE_EVENT, onState);
  }, []);

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (reduced || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    x.set(Math.max(-MAGNET_PX, Math.min(MAGNET_PX, dx * 0.35)));
    y.set(Math.max(-MAGNET_PX, Math.min(MAGNET_PX, dy * 0.35)));
  };

  const release = () => {
    x.set(0);
    y.set(0);
  };

  const open = () => {
    window.dispatchEvent(
      new CustomEvent<ConsoleOpenDetail>(CONSOLE_OPEN_EVENT, { detail: { mode: "text" } }),
    );
  };

  // `hidden` rather than unmounted: the console can close again, and remounting would replay the
  // entrance every time.
  const hidden = consoleOpen || !mounted;

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={open}
      onPointerMove={onPointerMove}
      onPointerLeave={release}
      onBlur={release}
      aria-label={label}
      aria-hidden={consoleOpen}
      tabIndex={consoleOpen ? -1 : 0}
      style={{ x: reduced ? 0 : springX, y: reduced ? 0 : springY }}
      initial={false}
      animate={{
        opacity: hidden ? 0 : 1,
        scale: hidden ? 0.85 : 1,
        pointerEvents: hidden ? "none" : "auto",
      }}
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 22 }}
      whileHover={reduced ? undefined : { scale: 1.06 }}
      whileTap={reduced ? undefined : { scale: 0.94 }}
      className="group fixed bottom-6 end-6 z-40 flex items-center gap-3 rounded-full border border-border/80 bg-bg-raised/85 py-2 pe-4 ps-2 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md transition-colors hover:border-accent-dim"
    >
      <span className="relative flex h-11 w-11 items-center justify-center">
        {/* Decorative: the orb already carries an aria-label of its own, which would be read twice. */}
        <span aria-hidden="true" className={reduced ? "" : "fab-pulse absolute inset-0 rounded-full"} />
        <span aria-hidden="true">
          <Orb state="idle" size={44} label="" />
        </span>
      </span>
      {hint ? (
        <span className="hidden text-sm font-medium text-fg sm:inline">{hint}</span>
      ) : null}
    </motion.button>
  );
}

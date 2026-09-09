"use client";

/** The one piece of client JS on the spine: a button that dispatches `console:open`. */
import type { ReactNode } from "react";
import { CONSOLE_OPEN_EVENT, type ConsoleOpenDetail } from "./consoleEvents";

interface Props {
  mode: ConsoleOpenDetail["mode"];
  prompt?: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}

export default function ConsoleTrigger({ mode, prompt, className, children, ...rest }: Props) {
  return (
    <button
      type="button"
      className={className}
      aria-label={rest["aria-label"]}
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent<ConsoleOpenDetail>(CONSOLE_OPEN_EVENT, { detail: { mode, prompt } }),
        );
      }}
    >
      {children}
    </button>
  );
}

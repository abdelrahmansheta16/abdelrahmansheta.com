/**
 * The only contract between the static spine and the (separately owned) console: a window CustomEvent.
 * The spine never imports the console; the console listens for `console:open`.
 */
export interface ConsoleOpenDetail {
  mode: "voice" | "text";
  prompt?: string;
}

export const CONSOLE_OPEN_EVENT = "console:open";

/**
 * Fired by the console when it closes, so anything that stepped aside for it can come back — the
 * floating button, for one. It travels the same window-event channel rather than lifting the
 * console's `open` state into a provider, which would drag the whole spine into a client boundary
 * for a single boolean.
 */
export const CONSOLE_STATE_EVENT = "console:state";

export interface ConsoleStateDetail {
  open: boolean;
}

declare global {
  interface WindowEventMap {
    "console:open": CustomEvent<ConsoleOpenDetail>;
    "console:state": CustomEvent<ConsoleStateDetail>;
  }
}

/**
 * The only contract between the static spine and the (separately owned) console: a window CustomEvent.
 * The spine never imports the console; the console listens for `console:open`.
 */
export interface ConsoleOpenDetail {
  mode: "voice" | "text";
  prompt?: string;
}

export const CONSOLE_OPEN_EVENT = "console:open";

declare global {
  interface WindowEventMap {
    "console:open": CustomEvent<ConsoleOpenDetail>;
  }
}

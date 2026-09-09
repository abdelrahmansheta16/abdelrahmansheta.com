/**
 * The pure part of the tool path: a tool name plus its raw arguments in, a list of DOM effects and the
 * string we hand back to the model out. Kept free of React and of the DOM so it can be unit tested and
 * so the voice path and the text path share exactly one interpretation of every tool.
 */
import { TOOLS, TOOL_NAMES, type Locale, type ToolName } from "@/lib/tools/schema";

export type ConsoleCard =
  | { kind: "project"; slug: string }
  | { kind: "availability" }
  | { kind: "book_call" }
  | { kind: "cv" }
  | { kind: "message" }
  | { kind: "summary" }
  | { kind: "lead"; reason: string }
  | { kind: "contact" };

export type ConsoleEffect =
  | { type: "scroll"; elementId: string }
  | { type: "highlight"; proofId: string }
  | { type: "locale"; locale: Locale }
  | { type: "card"; card: ConsoleCard };

export interface ToolOutcome {
  /** What the UI must do. Empty when the call was not understood. */
  effects: ConsoleEffect[];
  /** The tool result string returned to the model. Short and machine-ish on purpose. */
  output: string;
  ok: boolean;
}

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

const fail = (output: string): ToolOutcome => ({ effects: [], output, ok: false });

/**
 * Validates the arguments against the one zod catalogue, then maps the call onto effects.
 * Never throws: an unparseable call becomes an `invalid_arguments` result the model can recover from.
 */
export function reduceToolCall(name: string, input: unknown): ToolOutcome {
  if (!isToolName(name)) return fail("unknown_tool");
  const parsed = TOOLS[name].parameters.safeParse(input ?? {});
  if (!parsed.success) return fail("invalid_arguments");
  const args: unknown = parsed.data;

  switch (name) {
    case "show_section": {
      const { section } = args as { section: string };
      return { effects: [{ type: "scroll", elementId: section }], output: `showing ${section}`, ok: true };
    }
    case "show_project": {
      const { slug } = args as { slug: string };
      return {
        effects: [
          { type: "scroll", elementId: `project-${slug}` },
          { type: "card", card: { kind: "project", slug } },
        ],
        output: `showing project ${slug}`,
        ok: true,
      };
    }
    case "highlight_proof_point": {
      const { id } = args as { id: string };
      return { effects: [{ type: "highlight", proofId: id }], output: `highlighted ${id}`, ok: true };
    }
    case "show_availability":
      return { effects: [{ type: "card", card: { kind: "availability" } }], output: "showing availability", ok: true };
    case "switch_language": {
      const { locale } = args as { locale: Locale };
      return { effects: [{ type: "locale", locale }], output: `locale set to ${locale}`, ok: true };
    }
    case "open_book_call":
      return { effects: [{ type: "card", card: { kind: "book_call" } }], output: "booking card open", ok: true };
    case "open_cv_download":
      return { effects: [{ type: "card", card: { kind: "cv" } }], output: "cv card open", ok: true };
    case "open_leave_message":
      return { effects: [{ type: "card", card: { kind: "message" } }], output: "message form open", ok: true };
    case "open_email_summary":
      return { effects: [{ type: "card", card: { kind: "summary" } }], output: "summary card open", ok: true };
    case "offer_lead_capture": {
      const { reason } = args as { reason: string };
      return { effects: [{ type: "card", card: { kind: "lead", reason } }], output: "lead card offered", ok: true };
    }
    case "show_contact":
      return { effects: [{ type: "card", card: { kind: "contact" } }], output: "contact card open", ok: true };
    default:
      return fail("unknown_tool");
  }
}

/** The card a completed tool call should render inline in the transcript, if any. */
export function cardFor(name: string, input: unknown): ConsoleCard | null {
  const outcome = reduceToolCall(name, input);
  for (const effect of outcome.effects) {
    if (effect.type === "card") return effect.card;
  }
  return null;
}

/** Applies the DOM half of an effect list. Safe to call on the server (it simply does nothing). */
export function applyEffect(effect: ConsoleEffect, onLocale: (locale: Locale) => void): void {
  if (typeof document === "undefined") return;
  switch (effect.type) {
    case "scroll": {
      document.getElementById(effect.elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    case "highlight": {
      for (const el of document.querySelectorAll("[data-proof-id]")) {
        el.classList.toggle("console-proof-highlight", el.getAttribute("data-proof-id") === effect.proofId);
      }
      document.querySelector(`[data-proof-id="${CSS.escape(effect.proofId)}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }
    case "locale": {
      document.documentElement.lang = effect.locale;
      document.documentElement.dir = effect.locale === "ar" ? "rtl" : "ltr";
      onLocale(effect.locale);
      return;
    }
    case "card":
      return;
  }
}

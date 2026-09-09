/** The tool-part reducer is the single interpretation of every tool for both the voice and the text path. */
import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "@/lib/tools/schema";
import { cardFor, isToolName, reduceToolCall } from "@/components/console/effects";

describe("reduceToolCall", () => {
  it("handles every tool in the catalogue without throwing", () => {
    for (const name of TOOL_NAMES) {
      expect(() => reduceToolCall(name, {})).not.toThrow();
    }
  });

  it("scrolls for show_section", () => {
    expect(reduceToolCall("show_section", { section: "projects" })).toEqual({
      effects: [{ type: "scroll", elementId: "projects" }],
      output: "showing projects",
      ok: true,
    });
  });

  it("scrolls and renders a card for show_project", () => {
    const outcome = reduceToolCall("show_project", { slug: "rafeeq" });
    expect(outcome.ok).toBe(true);
    expect(outcome.effects).toEqual([
      { type: "scroll", elementId: "project-rafeeq" },
      { type: "card", card: { kind: "project", slug: "rafeeq" } },
    ]);
  });

  it("highlights a proof point by id", () => {
    expect(reduceToolCall("highlight_proof_point", { id: "pp-03-cost" }).effects).toEqual([
      { type: "highlight", proofId: "pp-03-cost" },
    ]);
  });

  it("switches locale", () => {
    expect(reduceToolCall("switch_language", { locale: "ar" }).effects).toEqual([{ type: "locale", locale: "ar" }]);
  });

  it("rejects arguments that fail the zod catalogue instead of throwing", () => {
    expect(reduceToolCall("show_section", { section: "nope" })).toEqual({
      effects: [],
      output: "invalid_arguments",
      ok: false,
    });
    expect(reduceToolCall("highlight_proof_point", { id: "not-a-proof-id" }).ok).toBe(false);
    expect(reduceToolCall("show_project", null).ok).toBe(false);
  });

  it("rejects a tool that is not in the catalogue", () => {
    expect(reduceToolCall("drop_database", {})).toEqual({ effects: [], output: "unknown_tool", ok: false });
    expect(isToolName("drop_database")).toBe(false);
  });

  it("accepts the no-argument tools with an undefined input", () => {
    expect(reduceToolCall("show_availability", undefined).ok).toBe(true);
    expect(reduceToolCall("show_contact", undefined).ok).toBe(true);
  });
});

describe("cardFor", () => {
  it("maps each card-bearing tool to its card", () => {
    expect(cardFor("show_availability", {})).toEqual({ kind: "availability" });
    expect(cardFor("open_book_call", {})).toEqual({ kind: "book_call" });
    expect(cardFor("open_cv_download", {})).toEqual({ kind: "cv" });
    expect(cardFor("open_leave_message", {})).toEqual({ kind: "message" });
    expect(cardFor("open_email_summary", {})).toEqual({ kind: "summary" });
    expect(cardFor("show_contact", {})).toEqual({ kind: "contact" });
    expect(cardFor("offer_lead_capture", { reason: "asked about the role" })).toEqual({
      kind: "lead",
      reason: "asked about the role",
    });
  });

  it("returns null for tools that only move the page", () => {
    expect(cardFor("show_section", { section: "cv" })).toBeNull();
    expect(cardFor("switch_language", { locale: "en" })).toBeNull();
    expect(cardFor("nope", {})).toBeNull();
  });
});

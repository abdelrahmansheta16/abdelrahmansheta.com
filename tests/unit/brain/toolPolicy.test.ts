/** Unit tests for tool-call hygiene: leaked JSON in content, and once-per-session tool suppression. */
import { describe, expect, it } from "vitest";
import { allowToolCall, detectLeakedToolCall } from "@/lib/brain/toolPolicy";
import type { SessionFlags } from "@/lib/brain/types";
import { ONCE_PER_SESSION, TOOL_NAMES } from "@/lib/tools/schema";
import type { ToolName } from "@/lib/tools/schema";

const flags = (overrides: Partial<SessionFlags> = {}): SessionFlags => ({
  sessionId: "s-1",
  channel: "voice",
  langHint: "en",
  leadCaptured: false,
  summarySent: false,
  messageLeft: false,
  guardHits: 0,
  remainingSeconds: 180,
  greetingPlayed: true,
  ...overrides,
});

describe("detectLeakedToolCall", () => {
  it("reads a bare function-call object", () => {
    const leaked = detectLeakedToolCall('{"name": "show_section", "arguments": {"section": "proof"}}');
    expect(leaked).toEqual({ name: "show_section", arguments: '{"section":"proof"}' });
  });

  it("reads the {\"tool\": …} shape", () => {
    const leaked = detectLeakedToolCall('{"tool": "open_book_call", "input": {}}');
    expect(leaked).toEqual({ name: "open_book_call", arguments: "{}" });
  });

  it("reads a fenced json block", () => {
    const leaked = detectLeakedToolCall('```json\n{"name": "show_project", "arguments": {"slug": "rafeeq"}}\n```');
    expect(leaked).toEqual({ name: "show_project", arguments: '{"slug":"rafeeq"}' });
  });

  it("reads a fenced block with prose before it", () => {
    const leaked = detectLeakedToolCall('Sure. ```json\n{"name": "show_contact", "arguments": {}}\n```');
    expect(leaked?.name).toBe("show_contact");
  });

  it("reads a <tool_call> wrapper", () => {
    const leaked = detectLeakedToolCall('<tool_call>{"name": "open_cv_download", "arguments": {}}</tool_call>');
    expect(leaked).toEqual({ name: "open_cv_download", arguments: "{}" });
  });

  it("tolerates trailing prose after the object", () => {
    const leaked = detectLeakedToolCall('{"name": "show_availability", "arguments": {}} — opening that for you.');
    expect(leaked?.name).toBe("show_availability");
  });

  it("keeps a valid double-encoded arguments string as-is", () => {
    const leaked = detectLeakedToolCall('{"name": "switch_language", "arguments": "{\\"locale\\":\\"ar\\"}"}');
    expect(leaked).toEqual({ name: "switch_language", arguments: '{"locale":"ar"}' });
  });

  it("falls back to empty arguments when the string is not JSON", () => {
    const leaked = detectLeakedToolCall('{"name": "show_contact", "arguments": "not json"}');
    expect(leaked).toEqual({ name: "show_contact", arguments: "{}" });
  });

  it("defaults missing arguments to an empty object", () => {
    expect(detectLeakedToolCall('{"name": "show_contact"}')).toEqual({ name: "show_contact", arguments: "{}" });
  });

  it.each(TOOL_NAMES)("recognises %s", (name) => {
    expect(detectLeakedToolCall(`{"name": "${name}", "arguments": {}}`)?.name).toBe(name);
  });

  it.each([
    "",
    "   ",
    "I can show you the proof points if you like.",
    '{"name": "delete_everything", "arguments": {}}',
    '{"arguments": {"section": "hero"}}',
    "{ not json at all",
    '```json\n{"answer": 42}\n```',
    "<tool_call>show me the section</tool_call>",
    '["show_section"]',
  ])("returns null for %o", (content) => {
    expect(detectLeakedToolCall(content)).toBeNull();
  });
});

describe("allowToolCall", () => {
  it("allows every tool on a fresh session", () => {
    for (const name of TOOL_NAMES) expect(allowToolCall(name, flags())).toBe(true);
  });

  it("drops offer_lead_capture once a lead was captured", () => {
    expect(allowToolCall("offer_lead_capture", flags({ leadCaptured: true }))).toBe(false);
    expect(allowToolCall("offer_lead_capture", flags({ leadCaptured: false }))).toBe(true);
  });

  it("drops open_email_summary once a summary was sent", () => {
    expect(allowToolCall("open_email_summary", flags({ summarySent: true }))).toBe(false);
  });

  it("keeps repeatable tools available after their flag is set", () => {
    expect(allowToolCall("open_leave_message", flags({ messageLeft: true }))).toBe(true);
    expect(allowToolCall("show_section", flags({ leadCaptured: true, summarySent: true }))).toBe(true);
  });

  it("covers exactly the ONCE_PER_SESSION catalogue", () => {
    const dropped = TOOL_NAMES.filter(
      (name) => !allowToolCall(name, flags({ leadCaptured: true, summarySent: true, messageLeft: true })),
    );
    expect([...dropped].sort()).toEqual([...ONCE_PER_SESSION].sort());
  });

  it("rejects a name that is not in the catalogue", () => {
    expect(allowToolCall("not_a_tool" as ToolName, flags())).toBe(false);
  });
});

/** Tool-call hygiene: convert function-call JSON leaked into content (DeepSeek issue #1244), dedupe once-per-session tools. Area A. */
import type { ToolName } from "@/lib/tools/schema";
import type { SessionFlags } from "./types";

export interface LeakedToolCall {
  name: ToolName;
  arguments: string;
}

/** If `content` is (or starts with) a JSON function call for a known tool, return it; else null. */
export function detectLeakedToolCall(_content: string): LeakedToolCall | null {
  throw new Error("detectLeakedToolCall: implemented in area A");
}

/** Drop tool calls that must only fire once per session (offer_lead_capture, open_email_summary). */
export function allowToolCall(_name: ToolName, _flags: SessionFlags): boolean {
  throw new Error("allowToolCall: implemented in area A");
}

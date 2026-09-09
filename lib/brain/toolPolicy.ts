/** Tool-call hygiene: convert function-call JSON leaked into content (DeepSeek issue #1244), dedupe once-per-session tools. Area A. */
import { ONCE_PER_SESSION, TOOL_NAMES } from "@/lib/tools/schema";
import type { ToolName } from "@/lib/tools/schema";
import type { SessionFlags } from "./types";

export interface LeakedToolCall {
  name: ToolName;
  arguments: string;
}

const KNOWN: ReadonlySet<string> = new Set<string>(TOOL_NAMES);

/** Which session flag makes a once-per-session tool a no-op the second time round. */
const ONCE_FLAG: Partial<Record<ToolName, keyof SessionFlags>> = {
  offer_lead_capture: "leadCaptured",
  open_email_summary: "summarySent",
  open_leave_message: "messageLeft",
};

const FENCE_RE = /```(?:json|tool_code|tool_call)?\s*([\s\S]*?)```/i;
const TAG_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i;

/** Slice the first balanced `{...}` starting at `from`, respecting strings and escapes. */
function firstJsonObject(text: string, from = 0): string | null {
  const start = text.indexOf("{", from);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseObject(candidate: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

/** Accept `{"name":…}`, `{"tool":…}`, `{"function":…}` and the args under any of the usual keys. */
function toLeaked(obj: Record<string, unknown>): LeakedToolCall | null {
  const rawName = obj.name ?? obj.tool ?? obj.function ?? obj.tool_name;
  const name = typeof rawName === "string" ? rawName.trim() : null;
  if (!name || !KNOWN.has(name)) return null;

  const rawArgs = obj.arguments ?? obj.parameters ?? obj.args ?? obj.input ?? obj.tool_input ?? {};
  if (typeof rawArgs === "string") {
    // Some models double-encode; keep the string but make sure it is at least valid JSON.
    return { name: name as ToolName, arguments: parseObject(rawArgs) ? rawArgs : JSON.stringify({}) };
  }
  return { name: name as ToolName, arguments: JSON.stringify(rawArgs ?? {}) };
}

/** If `content` is (or starts with) a JSON function call for a known tool, return it; else null. */
export function detectLeakedToolCall(content: string): LeakedToolCall | null {
  if (!content) return null;
  const trimmed = content.trim();
  if (!trimmed) return null;

  const candidates: string[] = [];

  const tagged = TAG_RE.exec(trimmed);
  if (tagged?.[1]) {
    const inner = firstJsonObject(tagged[1]) ?? tagged[1].trim();
    candidates.push(inner);
  }

  const fenced = FENCE_RE.exec(trimmed);
  if (fenced?.[1]) {
    const inner = firstJsonObject(fenced[1]) ?? fenced[1].trim();
    candidates.push(inner);
  }

  if (trimmed.startsWith("{")) {
    const inner = firstJsonObject(trimmed);
    if (inner) candidates.push(inner);
  }

  for (const candidate of candidates) {
    const obj = parseObject(candidate);
    if (!obj) continue;
    const leaked = toLeaked(obj);
    if (leaked) return leaked;
  }
  return null;
}

/** Drop tool calls that must only fire once per session (offer_lead_capture, open_email_summary). */
export function allowToolCall(name: ToolName, flags: SessionFlags): boolean {
  if (!KNOWN.has(name)) return false;
  if (!ONCE_PER_SESSION.includes(name)) return true;
  const flag = ONCE_FLAG[name];
  if (!flag) return true;
  return flags[flag] !== true;
}

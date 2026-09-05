/**
 * ONE tool catalogue. The AI SDK text path and the ElevenLabs agent config are both generated from this
 * file (scripts/push-agent-config.ts exports it as JSON). Names are snake_case and identical in both paths.
 * None of these tools has a server side effect: they only change what the page shows. Every e-mail, lead
 * or download happens after a human click on a fixed-recipient form (invariant 7).
 */
import { z } from "zod";

export const SECTIONS = ["hero", "proof", "experience", "projects", "about", "contact", "cv"] as const;
export const PROJECT_SLUGS = [
  "cravit-replatform",
  "ai-branch-manager",
  "llm-cost-routing",
  "voice-pipeline",
  "rafeeq",
  "puffer-audit",
  "style-protocol",
] as const;
export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

const tool = <S extends z.ZodTypeAny>(description: string, parameters: S, expectsResponse = false) => ({
  description,
  parameters,
  expectsResponse,
});

export const TOOLS = {
  show_section: tool("Scroll to and expand a section of the page.", z.object({ section: z.enum(SECTIONS) })),
  show_project: tool("Expand a project card inline while talking about it.", z.object({ slug: z.enum(PROJECT_SLUGS) })),
  highlight_proof_point: tool("Highlight one proof point card by id (pp-01 … pp-12).", z.object({ id: z.string().regex(/^pp-\d{2}-[a-z-]+$/) })),
  show_availability: tool("Show the availability and logistics card (markets, timezone overlap, engagement type).", z.object({})),
  switch_language: tool("Switch the page locale and transcript direction. In voice, the agent's own language_detection tool handles audio.", z.object({ locale: z.enum(LOCALES) }), true),
  open_book_call: tool("Open the book-a-call modal (Cal.com).", z.object({})),
  open_cv_download: tool("Show the CV card with the download button.", z.object({})),
  open_leave_message: tool("Open the leave-a-message form; the visitor types and submits it themselves.", z.object({})),
  open_email_summary: tool("Offer to e-mail the visitor a summary; the visitor enters their address and consents themselves. Once per session.", z.object({})),
  offer_lead_capture: tool("Offer, once per session and only after the visitor expresses hiring intent, a small card to leave name, company and e-mail. Never pressure.", z.object({ reason: z.string().max(120) }), true),
  show_contact: tool("Show the contact card: hello@abdelrahmansheta.com, LinkedIn, the message form and the booking link.", z.object({})),
} as const;

export type ToolName = keyof typeof TOOLS;
export const TOOL_NAMES = Object.keys(TOOLS).sort() as ToolName[];
export const ONCE_PER_SESSION: ToolName[] = ["offer_lead_capture", "open_email_summary"];

/** OpenAI-format function definitions, sorted by name so the prompt prefix is byte-stable (invariant 8). */
export function toolsAsOpenAI() {
  return TOOL_NAMES.map((name) => ({
    type: "function" as const,
    function: {
      name,
      description: TOOLS[name].description,
      parameters: z.toJSONSchema(TOOLS[name].parameters),
    },
  }));
}

/** ElevenLabs client-tool definitions (pushed by scripts/push-agent-config.ts). */
export function toolsAsElevenLabs() {
  return TOOL_NAMES.map((name) => ({
    type: "client" as const,
    name,
    description: TOOLS[name].description,
    expects_response: TOOLS[name].expectsResponse,
    parameters: z.toJSONSchema(TOOLS[name].parameters),
  }));
}

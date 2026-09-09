/**
 * Wiring: turns environment variables and the compiled corpus into the objects `runBrain` needs.
 * Kept out of the route files so /api/llm and /api/chat are guaranteed to get an identical brain —
 * that identity is invariant 8, and it is easiest to keep when there is only one constructor.
 */
import { CORPUS, GUARD_CONFIG } from "@/lib/corpus/corpus.generated";
import { createGuard, type Guard } from "@/lib/brain/guard";
import {
  createAnthropicProvider,
  createDeepSeekProvider,
  withFailover,
} from "@/lib/llm/provider";
import type { BrainCorpus } from "@/lib/brain/adapter";
import type { OpenAITool, ProviderAdapter } from "@/lib/brain/types";

export { CORPUS };

/** The slice of the corpus the brain consumes, plus the pronunciation terms kept in Latin script. */
export function brainCorpus(): BrainCorpus {
  return {
    version: CORPUS.version,
    systemPrompt: CORPUS.systemPrompt,
    keepLatin: CORPUS.pronunciation.filter((p) => p.keep_latin).map((p) => p.term),
    tashkeel: Object.fromEntries(
      CORPUS.pronunciation
        .filter((p) => typeof p.tashkeel === "string" && p.tashkeel.length > 0)
        .map((p) => [p.term, p.tashkeel as string]),
    ),
  };
}

let guardCache: Guard | null = null;

export function guard(): Guard {
  if (guardCache !== null) return guardCache;
  guardCache = createGuard(GUARD_CONFIG);
  return guardCache;
}

let providerCache: ProviderAdapter | null = null;

/**
 * DeepSeek primary, Haiku failover. If only one key is configured that provider is used alone; if
 * neither is, the caller gets null and answers 503 rather than pretending.
 */
export function providers(): ProviderAdapter | null {
  if (providerCache !== null) return providerCache;

  const deepseekKey = process.env.DEEPSEEK_API_KEY ?? "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";

  const primary =
    deepseekKey === ""
      ? null
      : createDeepSeekProvider({
          apiKey: deepseekKey,
          baseUrl: process.env.DEEPSEEK_BASE_URL,
          model: process.env.DEEPSEEK_MODEL,
        });
  const fallback =
    anthropicKey === ""
      ? null
      : createAnthropicProvider({ apiKey: anthropicKey, model: process.env.ANTHROPIC_MODEL });

  if (primary !== null && fallback !== null) providerCache = withFailover(primary, fallback);
  else providerCache = primary ?? fallback;

  return providerCache;
}

/**
 * ElevenLabs executes these itself, but they must still appear in the tools array we send upstream so
 * the model knows they exist — and so the sorted array stays byte-stable across turns.
 */
export const ELEVENLABS_SYSTEM_TOOLS: OpenAITool[] = [
  {
    type: "function",
    function: {
      name: "language_detection",
      description: "Switch the spoken language when the visitor changes language.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "end_call",
      description: "End the call when the visitor says goodbye.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: [],
        additionalProperties: false,
      },
    },
  },
];

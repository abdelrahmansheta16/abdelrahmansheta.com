/**
 * Builds and pushes the ElevenLabs Agent configuration from docs/PLAN.md 4.1.
 * The agent is NEVER hand-edited in the dashboard: this file is the source of truth and
 * tests/guardrails/09-agent-config.test.ts asserts the safety-relevant flags without network.
 *
 *   pnpm push:agent --dry-run          print the JSON that would be sent
 *   pnpm push:agent --create           create a new agent, print its id
 *   pnpm push:agent --update <id>      overwrite an existing agent
 *   pnpm push:agent --verify <id>      read the live agent back and diff the invariant flags
 *
 * Divergences from the plan, forced by @elevenlabs/elevenlabs-js 2.66.0 (noted, not worked around):
 *  - Field names are camelCase in the SDK (`conversationConfig`, `maxDurationSeconds`, …); the
 *    wire format stays snake_case. Assertions in the guardrail test use the SDK spelling.
 *  - A language preset can only override `agent`, `asr`, `tts`, `conversation` and the soft-timeout
 *    message. `turn.turnEagerness` is NOT overridable per language, so the plan's "patient turn
 *    eagerness for Arabic" is applied agent-wide instead; see AR_TURN_EAGERNESS below.
 *  - `customLlm.apiKey` takes a locator, not a literal. We reference the environment variable
 *    label `LLM_ADAPTER_SECRET` rather than embedding the secret in the config.
 */
import type { ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { toolsAsElevenLabs } from "@/lib/tools/schema";

type CreateAgentBody = ElevenLabs.conversationalAi.BodyCreateAgentV1ConvaiAgentsCreatePost;
type PromptTools = NonNullable<ElevenLabs.PromptAgentApiModelOutput["tools"]>;
type ObjectSchema = ElevenLabs.ObjectJsonSchemaPropertyInput;

/** Replaced at conversation start by the compiled corpus; the agent prompt itself is a placeholder
 *  so that the system prompt is byte-identical between voice and text (invariant 8). */
export const PROMPT_PLACEHOLDER = "ABDO_CORPUS_PLACEHOLDER";

export const FIRST_MESSAGE_EN =
  "Hey — quick note before we start: you're talking to an AI version of Abdelrahman, " +
  "in his own voice. Ask me anything about the work.";

export const FIRST_MESSAGE_AR =
  "أهلاً! أول حاجة قبل ما نبدأ: إنت بتتكلم مع نسخة ذكاء اصطناعي من عبدالرحمن، بصوته. " +
  "اسألني عن الشغل براحتك.";

/** Plan asks for `patient` on the Arabic preset; the SDK has no per-preset turn override, so the
 *  whole agent runs patient. Masri turns are longer and the false interruption cost is higher. */
export const AR_TURN_EAGERNESS = "patient" as const;

/** Latin technical terms Scribe should bias towards. Kept in sync with glossary/pronunciation.yaml. */
export const ASR_KEYWORDS = [
  "FastAPI",
  "NestJS",
  "LangGraph",
  "Nethermind",
  "Puffer",
  "Qdrant",
  "pgvector",
  "Paymob",
  "Rafeeq",
  "Cravit",
  "DeepSeek",
  "ElevenLabs",
  "Supabase",
  "Vercel",
  "RTSP",
  "YOLO",
  "Postgres",
  "Kubernetes",
];

export interface AgentConfigInput {
  /** Public origin of the deployment, e.g. https://abdelrahmansheta.com */
  siteUrl?: string;
  /** ElevenLabs voice id of the Professional Voice Clone (IVC during the bake-off). */
  voiceId?: string;
  /** Environment variable label registered in the ElevenLabs workspace for the adapter secret. */
  adapterSecretEnvLabel?: string;
  agentName?: string;
}

function clientTools(): PromptTools {
  return toolsAsElevenLabs().map((t) => ({
    type: "client" as const,
    name: t.name,
    description: t.description,
    expectsResponse: t.expects_response,
    // z.toJSONSchema() emits a plain JSON Schema object; the SDK models it with a richer
    // discriminated type that is structurally compatible on the wire.
    parameters: t.parameters as unknown as ObjectSchema,
  }));
}

/**
 * Pure. No network, no filesystem, no throwing on missing env — so the guardrail test can call it.
 */
export function buildAgentConfig(input: AgentConfigInput = {}): CreateAgentBody {
  const siteUrl = (input.siteUrl ?? process.env.SITE_URL ?? "https://abdelrahmansheta.com").replace(
    /\/+$/,
    "",
  );
  const voiceId = input.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? "";
  const secretEnvLabel = input.adapterSecretEnvLabel ?? "LLM_ADAPTER_SECRET";

  const languageDetection: PromptTools[number] = {
    type: "system",
    name: "language_detection",
    description: "",
    params: {
      systemToolType: "language_detection",
      // Must stay false: the visitor may switch to Masri at any point, not only in turn 1.
      onlyAtConversationStart: false,
    },
  };

  const endCall: PromptTools[number] = {
    type: "system",
    name: "end_call",
    description: "",
    params: { systemToolType: "end_call" },
  };

  return {
    name: input.agentName ?? "abdelrahmansheta.com — AI twin",
    tags: ["portfolio", "bilingual", "custom-llm"],
    conversationConfig: {
      agent: {
        firstMessage: FIRST_MESSAGE_EN,
        language: "en",
        disableFirstMessageInterruptions: false,
        prompt: {
          // The real corpus is injected by /api/llm; the agent prompt is a stable placeholder.
          prompt: PROMPT_PLACEHOLDER,
          llm: "custom-llm",
          temperature: 0.4,
          maxTokens: 220,
          ignoreDefaultPersonality: true,
          customLlm: {
            url: `${siteUrl}/api/llm`,
            modelId: "portfolio-brain-v1",
            apiKey: { envVarLabel: secretEnvLabel },
            apiType: "chat_completions",
            requestHeaders: {
              "X-Agent-Key": { envVarLabel: secretEnvLabel },
              "X-Conversation-Id": "{{system__conversation_id}}",
            },
          },
          builtInTools: {
            languageDetection: {
              type: "system",
              name: "language_detection",
              params: { systemToolType: "language_detection", onlyAtConversationStart: false },
            },
            endCall: { type: "system", name: "end_call", params: { systemToolType: "end_call" } },
          },
          tools: [languageDetection, endCall, ...clientTools()],
        },
      },
      tts: {
        modelId: "eleven_flash_v2_5",
        voiceId,
        // Numbers are spoken as words by the model itself (Egyptian agreement rules live in the
        // corpus). The SDK has no "off": "system_prompt" is the no-extra-latency option, and our
        // prompt already carries the normalisation instructions. "elevenlabs" would add latency
        // and undo Masri number forms.
        textNormalisationType: "system_prompt",
        stability: 0.45,
        similarityBoost: 0.85,
        speed: 1.0,
      },
      asr: {
        provider: "scribe_realtime",
        quality: "high",
        userInputAudioFormat: "pcm_16000",
        keywords: ASR_KEYWORDS,
      },
      turn: {
        turnTimeout: 10,
        silenceEndCallTimeout: 30,
        turnEagerness: AR_TURN_EAGERNESS,
        softTimeoutConfig: {
          timeoutSeconds: 1.6,
          message: "Right…",
          maxSoftTimeoutsPerGeneration: 2,
          useLlmGeneratedMessage: false,
          disableUntilFirstUserMessage: true,
        },
      },
      conversation: {
        textOnly: false,
        maxDurationSeconds: 240,
        clientEvents: [
          "conversation_initiation_metadata",
          "ping",
          "audio",
          "interruption",
          "user_transcript",
          "agent_response",
          "agent_response_correction",
          "client_tool_call",
          "vad_score",
        ],
      },
      languagePresets: {
        ar: {
          overrides: {
            agent: {
              firstMessage: FIRST_MESSAGE_AR,
              language: "ar",
            },
            turn: {
              softTimeoutConfig: { message: "طب…" },
            },
          },
          firstMessageTranslation: { sourceHash: FIRST_MESSAGE_EN, text: FIRST_MESSAGE_AR },
        },
      },
    },
    platformSettings: {
      auth: {
        // Token auth and the hostname allowlist are mutually exclusive: the allowlist stays EMPTY.
        enableAuth: true,
        allowlist: [],
        requireOriginHeader: false,
      },
      privacy: {
        recordVoice: false,
        deleteAudio: true,
        retentionDays: 30,
        deleteTranscriptAndPii: false,
        zeroRetentionMode: false,
        applyToExistingConversations: true,
      },
      overrides: {
        conversationConfigOverride: {
          // Only the language may be overridden from the browser. Everything else — prompt, first
          // message, voice, duration — is server-controlled.
          agent: { language: true, firstMessage: false, prompt: { prompt: false } },
        },
        customLlmExtraBody: false,
        enableConversationInitiationClientDataFromWebhook: false,
      },
      callLimits: { agentConcurrencyLimit: 2 },
    },
  };
}

interface Flags {
  dryRun: boolean;
  create: boolean;
  updateId: string | null;
  verifyId: string | null;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { dryRun: false, create: false, updateId: null, verifyId: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--create") flags.create = true;
    else if (arg === "--update") flags.updateId = argv[i + 1] ?? null;
    else if (arg === "--verify") flags.verifyId = argv[i + 1] ?? null;
  }
  return flags;
}

/** The flags a live agent must have. Kept next to the builder so drift is visible in one place. */
export function invariantChecks(agent: unknown): string[] {
  const failures: string[] = [];
  const read = (path: string): unknown => {
    let node: unknown = agent;
    for (const key of path.split(".")) {
      if (typeof node !== "object" || node === null) return undefined;
      node = (node as Record<string, unknown>)[key];
    }
    return node;
  };
  const expect = (path: string, want: unknown): void => {
    const got = read(path);
    if (got !== want) failures.push(`${path}: expected ${String(want)}, got ${String(got)}`);
  };

  expect("platform_settings.auth.enable_auth", true);
  expect("platform_settings.privacy.record_voice", false);
  expect("platform_settings.privacy.retention_days", 30);
  expect("conversation_config.conversation.max_duration_seconds", 240);
  expect("conversation_config.tts.model_id", "eleven_flash_v2_5");
  expect("conversation_config.agent.prompt.llm", "custom-llm");

  const allowlist = read("platform_settings.auth.allowlist");
  if (Array.isArray(allowlist) && allowlist.length > 0) {
    failures.push("platform_settings.auth.allowlist: expected empty (token auth is exclusive)");
  }
  return failures;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const config = buildAgentConfig();

  if (flags.dryRun || (!flags.create && !flags.updateId && !flags.verifyId)) {
    process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
    if (!flags.dryRun) {
      process.stderr.write(
        "\nNo action flag given. Use --create, --update <id> or --verify <id>.\n",
      );
    }
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");
  if (!config.conversationConfig.tts?.voiceId) {
    throw new Error("ELEVENLABS_VOICE_ID is not set — refusing to push an agent with no voice");
  }
  const client = new ElevenLabsClient({ apiKey });

  if (flags.create) {
    const created = await client.conversationalAi.agents.create(config);
    process.stdout.write(`created agent ${created.agentId}\n`);
    process.stdout.write("Set ELEVENLABS_AGENT_ID to that value in Vercel and .env.local.\n");
    return;
  }

  if (flags.updateId) {
    const updated = await client.conversationalAi.agents.update(flags.updateId, {
      name: config.name,
      tags: config.tags,
      conversationConfig: config.conversationConfig,
      platformSettings: config.platformSettings,
    });
    process.stdout.write(`updated agent ${updated.agentId}\n`);
    return;
  }

  if (flags.verifyId) {
    const live = await client.conversationalAi.agents.get(flags.verifyId);
    const failures = invariantChecks(live);
    if (failures.length > 0) {
      for (const f of failures) process.stderr.write(`FAIL ${f}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`agent ${flags.verifyId} matches every invariant flag\n`);
  }
}

const invokedDirectly =
  typeof process.argv[1] === "string" && process.argv[1].includes("push-agent-config");

if (invokedDirectly) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}

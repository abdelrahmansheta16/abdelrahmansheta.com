/**
 * Invariant 9 — audio is never stored by us: ElevenLabs Audio Saving is off, retention is 30 days.
 * Plus the rest of the agent's safety surface: private agent, empty allowlist, 4-minute ceiling,
 * Flash v2.5 (never v3 Conversational — it does not preserve the PVC identity), mid-call language
 * detection, and only the Language override exposed to the browser.
 *
 * buildAgentConfig() is pure, so this runs with no network and no ElevenLabs credentials.
 */
import { describe, expect, it } from "vitest";
import { buildAgentConfig } from "@/scripts/push-agent-config";

const config = buildAgentConfig({ siteUrl: "https://example.com", voiceId: "voice_test" });
const conversation = config.conversationConfig;
const prompt = conversation.agent?.prompt;
const platform = config.platformSettings;

describe("invariant 9 — privacy and retention", () => {
  it("has audio saving off", () => {
    expect(platform?.privacy?.recordVoice).toBe(false);
    expect(platform?.privacy?.deleteAudio).toBe(true);
  });

  it("retains for 30 days", () => {
    expect(platform?.privacy?.retentionDays).toBe(30);
  });
});

describe("invariant 9 — the agent is private", () => {
  it("requires a signed token", () => {
    expect(platform?.auth?.enableAuth).toBe(true);
  });

  it("keeps the hostname allowlist empty (mutually exclusive with token auth)", () => {
    expect(platform?.auth?.allowlist).toEqual([]);
  });
});

describe("invariant 9 — conversation ceiling and voice model", () => {
  it("caps a conversation at 240 seconds agent-side too", () => {
    expect(conversation.conversation?.maxDurationSeconds).toBe(240);
  });

  it("streams interruption events to the client", () => {
    expect(conversation.conversation?.clientEvents).toContain("interruption");
  });

  it("uses eleven_flash_v2_5", () => {
    expect(conversation.tts?.modelId).toBe("eleven_flash_v2_5");
  });

  it("uses the configured voice id", () => {
    expect(conversation.tts?.voiceId).toBe("voice_test");
  });
});

describe("invariant 9 — tools and language detection", () => {
  it("enables language_detection with only_at_conversation_start false", () => {
    const builtIn = prompt?.builtInTools?.languageDetection;
    expect(builtIn).toBeDefined();
    expect(builtIn?.params.systemToolType).toBe("language_detection");
    const params = builtIn?.params;
    expect(
      params && "onlyAtConversationStart" in params ? params.onlyAtConversationStart : null,
    ).toBe(false);
  });

  it("enables end_call", () => {
    expect(prompt?.builtInTools?.endCall?.params.systemToolType).toBe("end_call");
  });

  it("carries every client tool from the shared catalogue, sorted", async () => {
    const { TOOL_NAMES } = await import("@/lib/tools/schema");
    const clientToolNames = (prompt?.tools ?? [])
      .filter((t) => t.type === "client")
      .map((t) => t.name);
    expect(clientToolNames).toEqual([...TOOL_NAMES]);
  });

  it("points at our own adapter and never at a third-party LLM", () => {
    expect(prompt?.llm).toBe("custom-llm");
    expect(prompt?.customLlm?.url).toBe("https://example.com/api/llm");
    expect(prompt?.customLlm?.modelId).toBe("portfolio-brain-v1");
  });

  it("passes the conversation id and the agent key as headers, with no literal secret", () => {
    const headers = prompt?.customLlm?.requestHeaders ?? {};
    expect(headers["X-Conversation-Id"]).toBe("{{system__conversation_id}}");
    expect(headers["X-Agent-Key"]).toEqual({ envVarLabel: "LLM_ADAPTER_SECRET" });
    expect(prompt?.customLlm?.apiKey).toEqual({ envVarLabel: "LLM_ADAPTER_SECRET" });
  });

  it("keeps the agent prompt a placeholder so voice and text share one system prompt", () => {
    expect(prompt?.prompt).toBe("ABDO_CORPUS_PLACEHOLDER");
  });
});

describe("invariant 9 — only the Language override is enabled", () => {
  const agentOverride = platform?.overrides?.conversationConfigOverride?.agent;

  it("allows language", () => {
    expect(agentOverride?.language).toBe(true);
  });

  it("forbids first_message and prompt overrides", () => {
    expect(agentOverride?.firstMessage).toBe(false);
    expect(agentOverride?.prompt?.prompt).toBe(false);
  });

  it("exposes no other override surface", () => {
    const overrides = platform?.overrides?.conversationConfigOverride ?? {};
    expect(Object.keys(overrides).sort()).toEqual(["agent"]);
    expect(platform?.overrides?.customLlmExtraBody).toBe(false);
  });
});

describe("invariant 9 — Arabic preset", () => {
  it("ships a Masri first message", () => {
    const ar = conversation.languagePresets?.ar;
    expect(ar).toBeDefined();
    const first = ar?.overrides.agent?.firstMessage ?? "";
    expect(first.length).toBeGreaterThan(0);
    expect(/[؀-ۿ]/.test(first)).toBe(true);
    // Masri, not fusha: none of the forbidden MSA markers.
    for (const marker of ["ليس", "سوف", "لماذا", "كيف ", "ماذا", "الذي", "لا يوجد"]) {
      expect(first).not.toContain(marker);
    }
  });

  it("runs patient turn eagerness (per-preset override is unavailable in the SDK)", () => {
    expect(conversation.turn?.turnEagerness).toBe("patient");
  });
});

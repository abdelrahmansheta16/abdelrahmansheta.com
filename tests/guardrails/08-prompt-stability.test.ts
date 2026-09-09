/**
 * Invariant 8 — the system prompt is byte-identical between voice and text, and contains no date,
 * no visitor data and no env strings. The cache prefix is the sorted tool list plus the corpus, so
 * tool order must be deterministic too.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { CompiledCorpus } from "@/lib/corpus/schema";
import { EXAMPLE_CORPUS_READY, compileExampleCorpus, skipMsg, suite } from "./helpers";

describe("invariant 8 — the tool prefix is byte-stable", () => {
  it("emits OpenAI function names in sorted order", async () => {
    const { toolsAsOpenAI } = await import("@/lib/tools/schema");
    const names = toolsAsOpenAI().map((t) => t.function.name);
    expect(names).toEqual([...names].sort());
  });

  it("emits ElevenLabs client-tool names in the same sorted order", async () => {
    const { toolsAsOpenAI, toolsAsElevenLabs } = await import("@/lib/tools/schema");
    expect(toolsAsElevenLabs().map((t) => t.name)).toEqual(
      toolsAsOpenAI().map((t) => t.function.name),
    );
  });

  it("serialises identically on two consecutive calls", async () => {
    const { toolsAsOpenAI } = await import("@/lib/tools/schema");
    expect(JSON.stringify(toolsAsOpenAI())).toBe(JSON.stringify(toolsAsOpenAI()));
  });
});

describe.skipIf(!EXAMPLE_CORPUS_READY)(
  suite("invariant 8 — the compiled prompt is context-free", EXAMPLE_CORPUS_READY, skipMsg.example),
  () => {
    let corpus: CompiledCorpus;
    beforeAll(async () => {
      corpus = await compileExampleCorpus();
    });

    it("contains no ISO date", () => {
      // 2026-09-09, 2026-09-09T12:00:00Z — anything that would break the KV cache prefix daily.
      const iso = corpus.systemPrompt.match(/\b\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/g) ?? [];
      expect(iso).toEqual([]);
    });

    it("contains no env-like KEY= strings", () => {
      const envish = corpus.systemPrompt.match(/\b[A-Z][A-Z0-9_]{3,}=\S/g) ?? [];
      expect(envish).toEqual([]);
    });

    it("names no environment variable that the server reads", () => {
      const secrets = [
        "DEEPSEEK_API_KEY",
        "ANTHROPIC_API_KEY",
        "ELEVENLABS_API_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "RESEND_API_KEY",
        "LLM_ADAPTER_SECRET",
        "IP_HASH_SALT",
        "VISITOR_COOKIE_SECRET",
        "CRON_SECRET",
      ];
      for (const key of secrets) {
        expect(corpus.systemPrompt).not.toContain(key);
      }
    });

    it("carries no visitor placeholder or dynamic variable", () => {
      expect(corpus.systemPrompt).not.toMatch(/\{\{\s*system__/);
      expect(corpus.systemPrompt.toLowerCase()).not.toContain("visitor_hash");
      expect(corpus.systemPrompt.toLowerCase()).not.toContain("ip_hash");
    });

    it("pins corpus.version to a prefix of sha256(systemPrompt)", async () => {
      const { createHash } = await import("node:crypto");
      const digest = createHash("sha256").update(corpus.systemPrompt, "utf8").digest("hex");
      expect(digest.startsWith(corpus.version)).toBe(true);
    });
  },
);

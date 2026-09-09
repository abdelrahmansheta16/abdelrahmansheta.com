/** Unit tests for compileCorpus: lint gates, token guard, determinism, generated module. */
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildGuardConfig,
  TOKEN_LIMIT,
  TOKEN_WARN,
  compileCorpus,
  estimateTokens,
  lintCorpus,
  renderGeneratedModule,
  voiceFacingTexts,
} from "@/lib/corpus/compile";
import { loadCorpus } from "@/lib/corpus/load";
import { renderSystemPrompt } from "@/lib/corpus/prompt";

const EXAMPLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../knowledge.example");
const temps: string[] = [];

async function cloneExample(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "corpus-compile-"));
  await cp(EXAMPLE_DIR, dir, { recursive: true });
  temps.push(dir);
  return dir;
}

async function append(dir: string, rel: string, text: string): Promise<void> {
  const file = path.join(dir, rel);
  await writeFile(file, `${await readFile(file, "utf8")}${text}`, "utf8");
}

async function patch(dir: string, rel: string, from: string, to: string): Promise<void> {
  const file = path.join(dir, rel);
  const before = await readFile(file, "utf8");
  if (!before.includes(from)) throw new Error(`fixture patch target not found in ${rel}`);
  await writeFile(file, before.replace(from, to), "utf8");
}

afterAll(async () => {
  await Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("compileCorpus", () => {
  it("compiles knowledge.example under the example token budget", async () => {
    const { corpus, warnings } = await compileCorpus({ dir: EXAMPLE_DIR });
    expect(corpus.version).toMatch(/^[0-9a-f]{12}$/);
    expect(corpus.tokenEstimate).toBe(estimateTokens(corpus.systemPrompt));
    expect(corpus.tokenEstimate).toBeLessThan(15_000);
    expect(corpus.tokenEstimate).toBeLessThan(TOKEN_WARN);
    expect(warnings).toEqual([]);
    expect(corpus.projects[0]).not.toHaveProperty("file");
    expect(corpus.consent.ar.length).toBeGreaterThan(0);
    expect(corpus.disclosure.en.length).toBeGreaterThan(0);
    expect(new Date(corpus.builtAt).toISOString()).toBe(corpus.builtAt);
    expect(corpus.systemPrompt).not.toContain(corpus.builtAt);
  });

  it("is deterministic: two compilations produce identical prompt bytes and version", async () => {
    const first = await compileCorpus({ dir: EXAMPLE_DIR });
    const second = await compileCorpus({ dir: EXAMPLE_DIR });
    expect(second.corpus.systemPrompt).toBe(first.corpus.systemPrompt);
    expect(second.corpus.version).toBe(first.corpus.version);
    expect(second.corpus.tokenEstimate).toBe(first.corpus.tokenEstimate);
  });

  it("fails when a denylist string appears in a corpus field", async () => {
    const dir = await cloneExample();
    await append(dir, "persona/voice.md", "\n- Reach me at nour.example@gmail.com.\n");
    await expect(compileCorpus({ dir })).rejects.toThrow(/denylist: "nour\.example@gmail\.com"/);
  });

  it("fails when a denylist number is written in Arabic-Indic digits", async () => {
    const dir = await cloneExample();
    await append(dir, "persona/fewshot_masri.yaml", '- q: "رقمك كام؟"\n  a: "رقمي ٠١٠٠٠٠٠٠٠٠٠"\n');
    await expect(compileCorpus({ dir })).rejects.toThrow(/denylist: "01000000000"/);
  });

  it("fails when voice-facing text contains digits", async () => {
    const dir = await cloneExample();
    await append(dir, "persona/fewshot_en.yaml", '- q: "How much did you cut?"\n  a: "By 70 percent."\n');
    await expect(compileCorpus({ dir })).rejects.toThrow(/voice-facing text contains the digits "70"/);
  });

  it("fails when a story names a proper noun that is not allowlisted", async () => {
    const dir = await cloneExample();
    await patch(dir, "stories/backfill-outage.yaml", "it is a bet.", "Nightjar Corp learned that too.");
    await expect(compileCorpus({ dir })).rejects.toThrow(/is not in policy\/allowlist\.txt/);
  });

  it("fails when the injected guard lint fires on the prompt", async () => {
    await expect(compileCorpus({ dir: EXAMPLE_DIR, lint: () => ["salary"] })).rejects.toThrow(
      /guard rule "salary" fired/,
    );
  });

  it("passes a guard lint that finds nothing", async () => {
    const { corpus } = await compileCorpus({ dir: EXAMPLE_DIR, lint: () => [] });
    expect(corpus.systemPrompt.length).toBeGreaterThan(0);
  });

  it("compiles the example corpus through the real deterministic guard", async () => {
    // The guard must not flag the prompt for quoting the phrases it forbids: redlines.yaml carries
    // the refusal templates, the few-shots demonstrate them, topics.yaml names the deflected topics,
    // and the prompt plants its own canary. Only a genuine leak may fail the build.
    const { createGuard } = await import("@/lib/brain/guard");
    const { sources } = await loadCorpus(EXAMPLE_DIR);
    const guard = createGuard({ ...buildGuardConfig(sources, ""), canary: "" });
    const leakRules = new Set(["email", "salary", "confidential", "canary"]);
    const lint = (text: string) => {
      const fired = new Set<string>();
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        for (const rule of guard.lint(line)) if (leakRules.has(rule)) fired.add(rule);
      }
      return [...fired];
    };
    const { corpus } = await compileCorpus({ dir: EXAMPLE_DIR, lint });
    expect(corpus.systemPrompt).toContain("Internal marker:");
    expect(corpus.guard.denylist.length).toBeGreaterThan(0);
    expect(corpus.guard.allowedEmails).toContain(sources.links.contact_email);
  });

  it("still fails the build when a real e-mail address leaks into the corpus", async () => {
    const { createGuard } = await import("@/lib/brain/guard");
    const { sources } = await loadCorpus(EXAMPLE_DIR);
    const guard = createGuard({ ...buildGuardConfig(sources, ""), canary: "" });
    // An address that is NOT the allowlisted contact address must be caught.
    expect(guard.lint("write to nour.private@gmail.com instead")).toContain("email");
    expect(guard.lint(`write to ${sources.links.contact_email} instead`)).not.toContain("email");
  });
});

describe("lintCorpus", () => {
  it("returns an empty list for the clean example corpus", async () => {
    const { sources } = await loadCorpus(EXAMPLE_DIR);
    expect(lintCorpus(sources, renderSystemPrompt(sources))).toEqual([]);
  });

  it("labels each failure with the file it came from", async () => {
    const { sources } = await loadCorpus(EXAMPLE_DIR);
    const failures = lintCorpus(sources, renderSystemPrompt(sources), (text) =>
      text.includes("backfill") ? ["confidential"] : [],
    );
    expect(failures.some((f) => f.startsWith("persona/fewshot_en.yaml["))).toBe(true);
    expect(failures).toContain('system prompt: guard rule "confidential" fired');
  });
});

describe("voiceFacingTexts", () => {
  it("collects few-shot answers and every spoken field", async () => {
    const { sources } = await loadCorpus(EXAMPLE_DIR);
    const labels = voiceFacingTexts(sources).map((t) => t.label);
    expect(labels).toContain("persona/fewshot_en.yaml[0].a");
    expect(labels).toContain("persona/fewshot_masri.yaml[0].a");
    expect(labels).toContain("projects/voice-pipeline.md:spoken_ar");
    expect(labels).toContain("stories/backfill-outage.yaml:spoken_en");
    expect(labels).toContain("opinions/agent-frameworks.md:spoken_ar");
  });
});

describe("estimateTokens", () => {
  it("counts o200k_base tokens and grows with the text", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("hello world")).toBeGreaterThan(0);
    expect(estimateTokens("hello world hello world")).toBeGreaterThan(estimateTokens("hello world"));
  });

  it("keeps the fail and warn thresholds ordered", () => {
    expect(TOKEN_WARN).toBeLessThan(TOKEN_LIMIT);
    expect(TOKEN_LIMIT).toBe(45_000);
  });
});

describe("renderGeneratedModule", () => {
  it("emits a module that imports the type and exports the corpus, version and prompt", async () => {
    const { corpus } = await compileCorpus({ dir: EXAMPLE_DIR });
    const generated = renderGeneratedModule(corpus);
    expect(generated).toContain('import type { CompiledCorpus } from "./schema";');
    expect(generated).toContain("const corpus: CompiledCorpus = {");
    expect(generated).toContain("export default corpus;");
    expect(generated).toContain(`export const CORPUS_VERSION = "${corpus.version}";`);
    expect(generated).toContain("export const SYSTEM_PROMPT = corpus.systemPrompt;");
    const json = generated.slice(
      generated.indexOf("{", generated.indexOf("const corpus")),
      generated.lastIndexOf("};") + 1,
    );
    expect(JSON.parse(json)).toEqual(corpus);
  });
});

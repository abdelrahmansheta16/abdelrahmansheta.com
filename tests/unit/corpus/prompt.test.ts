/** Unit tests for the rendered system prompt: section order, canary, determinism, invariant 8. */
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { loadCorpus } from "@/lib/corpus/load";
import type { CorpusSources } from "@/lib/corpus/load";
import { CONSENT, DISCLOSURE, SECTION_HEADINGS, canaryFor, renderSystemPrompt } from "@/lib/corpus/prompt";
import { TOOL_NAMES } from "@/lib/tools/schema";

const EXAMPLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../knowledge.example");

let sources: CorpusSources;
let prompt: string;

beforeAll(async () => {
  sources = (await loadCorpus(EXAMPLE_DIR)).sources;
  prompt = renderSystemPrompt(sources);
});

describe("renderSystemPrompt", () => {
  it("emits the fifteen headings in order", () => {
    const positions = SECTION_HEADINGS.map((heading) => prompt.indexOf(heading));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("is byte-identical when rendered twice", () => {
    expect(renderSystemPrompt(sources)).toBe(prompt);
  });

  it("carries the disclosure lines in both languages", () => {
    expect(prompt).toContain(DISCLOSURE.en);
    expect(prompt).toContain(DISCLOSURE.ar);
  });

  it("states the Egyptian-only Arabic rule and the fusha markers to avoid", () => {
    expect(prompt).toContain("Egyptian colloquial");
    expect(prompt).toContain("Never Modern Standard Arabic");
    expect(prompt).toContain("مفيش");
  });

  it("names every tool in the catalogue plus end_call", () => {
    for (const name of TOOL_NAMES) expect(prompt).toContain(`- ${name}:`);
    expect(prompt).toContain("- end_call:");
    expect(prompt).toContain("at most once per session");
  });

  it("renders the red lines with both refusal templates", () => {
    for (const redline of sources.redlines) {
      expect(prompt).toContain(redline.refusal_en);
      expect(prompt).toContain(redline.refusal_ar);
    }
  });

  it("allows only the corpus contact e-mail and LinkedIn as contact details", () => {
    expect(prompt).toContain(sources.links.contact_email);
    expect(prompt).toContain(sources.links.linkedin);
    expect(prompt).not.toContain(sources.links.legal_email);
  });

  it("marks a high-risk story as not to be volunteered", () => {
    expect(prompt).toContain("Do not volunteer this; answer only if asked directly.");
  });

  it("keeps non-public project metrics out", () => {
    expect(prompt).toContain("Median round trip under one second on the internal benchmark");
    expect(prompt).not.toContain("An internal number that stays internal");
  });

  it("renders the few-shots as Visitor/You pairs, English before Masri", () => {
    const firstEn = prompt.indexOf(`Visitor: ${sources.fewshotEn[0]?.q ?? ""}`);
    const firstAr = prompt.indexOf(`Visitor: ${sources.fewshotMasri[0]?.q ?? ""}`);
    expect(firstEn).toBeGreaterThan(0);
    expect(firstAr).toBeGreaterThan(firstEn);
  });

  it("contains no date, no env string and no visitor data (invariant 8)", () => {
    expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(prompt).not.toContain("process.env");
    expect(prompt).not.toMatch(/\bsk-[A-Za-z0-9]/);
    expect(prompt).not.toContain("sessionId");
  });

  it("ends with the canary marker computed over everything before it", () => {
    const markerHeading = `\n\n${SECTION_HEADINGS[14]}`;
    const body = prompt.slice(0, prompt.indexOf(markerHeading));
    expect(prompt).toContain(`Internal marker: ${canaryFor(body)}`);
  });
});

describe("canaryFor", () => {
  it("is the first sixteen hex of sha256 of the canary-prefixed text", () => {
    const expected = createHash("sha256").update("canary:abc", "utf8").digest("hex").slice(0, 16);
    expect(canaryFor("abc")).toBe(expected);
    expect(canaryFor("abc")).toHaveLength(16);
  });

  it("changes when a single byte of the prompt changes", () => {
    expect(canaryFor("abc")).not.toBe(canaryFor("abd"));
  });
});

describe("CONSENT and DISCLOSURE", () => {
  it("name every processor, the retention window and the session cap in English", () => {
    expect(CONSENT.en).toContain("ElevenLabs");
    expect(CONSENT.en).toContain("DeepSeek");
    expect(CONSENT.en).toContain("Anthropic");
    expect(CONSENT.en).toContain("30 days");
    expect(CONSENT.en).toContain("four minutes");
    expect(CONSENT.en).toContain("/privacy");
  });

  it("has an Arabic consent that names the same processors and is written in Masri", () => {
    expect(CONSENT.ar).toContain("ElevenLabs");
    expect(CONSENT.ar).toContain("DeepSeek");
    expect(CONSENT.ar).toContain("Anthropic");
    expect(CONSENT.ar).toContain("/privacy");
    for (const fusha of ["سوف", "لماذا", "الذي", "نحن", "لا يوجد"]) expect(CONSENT.ar).not.toContain(fusha);
  });

  it("discloses the cloned voice in both languages", () => {
    expect(DISCLOSURE.en).toContain("the AI version of me");
    expect(DISCLOSURE.ar).toContain("النسخة الـAI");
  });
});

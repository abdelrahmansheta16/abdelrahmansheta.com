/**
 * The confidentiality boundary, tested rather than promised.
 *
 * The project deep-dives are written from commit messages that document live production security
 * findings for a current employer. The CV-level architecture is fair game; the findings are not.
 * These cases are sanitised paraphrases of the real shapes, and they must fail the build.
 */
import { describe, expect, it } from "vitest";
import { findForbiddenPatternHits, parseForbiddenPatterns } from "@/lib/corpus/lint";

const POLICY = `
# comment ignored
\\bCRA-\\d+\\b
\\b[A-Z]{2,6}-\\d{2,5}\\b
\\bBYPASSRLS\\b
(?i)\\bcross-tenant\\b
(?i)\\bforgeable\\b
(?i)\\bunauthenticated\\b
(?i)\\b\\d{2,4}\\s+routes?\\b
\\bEGP\\b
`;
const patterns = parseForbiddenPatterns(POLICY);
const blocked = (text: string) => findForbiddenPatternHits(text, patterns).length > 0;

describe("forbidden patterns — employer-confidential shapes", () => {
  it.each([
    ["a ticket identifier", "Delivered under CRA-330 alongside the canvas work."],
    ["another tracker's shape", "Tracked as PLAT-4821 in the backlog."],
    ["a database posture", "Production connects as postgres with BYPASSRLS."],
    ["a tenancy finding", "The endpoint allowed a cross-tenant read of campaign metrics."],
    ["a header weakness", "The tenant came from a forgeable header."],
    ["an exposure claim", "Those routes were reachable unauthenticated."],
    ["a route count", "I bound 46 routes to the admin tenant."],
    ["a money unit", "The cap was 50 EGP per customer."],
  ])("blocks %s", (_label, text) => {
    expect(blocked(text)).toBe(true);
  });

  it.each([
    ["the public DeFi audit claim", "I found two high-severity DeFi vulnerabilities and audited a protocol securing over $1.2B in TVL."],
    ["the public re-platform claim", "I re-platformed a NestJS monolith to an event-driven FastAPI monorepo at 99.95% uptime."],
    ["the public cost claim", "I cut per-conversation inference cost by over 70% with routing and prompt caching."],
    ["method, which is the point", "Every fix is red-proofed: I mutate the production code and confirm the test goes red."],
    ["ordinary Masri", "دلوقتي أنا شغال على الـ FastAPI monorepo."],
    ["a model name with digits", "Runs on deepseek-v4-flash with qwen3.8-flash as the backup."],
  ])("allows %s", (_label, text) => {
    expect(blocked(text)).toBe(false);
  });

  it("matches identifier shapes case-sensitively, so prose is not a wildcard", () => {
    // With an `i` flag, [A-Z]{2,6}-\d{2,5} also matches lowercase and fires on ordinary text.
    expect(blocked("CRA-330")).toBe(true);
    expect(blocked("the well-known 2026 rewrite")).toBe(false);
    expect(blocked("see figure-12 in the appendix")).toBe(false);
  });

  it("folds case only where the line asks for it", () => {
    expect(blocked("Cross-Tenant reads were possible")).toBe(true);
    expect(blocked("bypassrls")).toBe(false); // written upper-case in the policy on purpose
  });

  it("refuses to compile a broken pattern rather than skipping it", () => {
    expect(() => parseForbiddenPatterns("\\b(unclosed")).toThrow(/cannot compile/);
  });

  it("treats an absent policy as no rules, so a fork with nothing to protect still builds", () => {
    expect(parseForbiddenPatterns("")).toEqual([]);
    expect(findForbiddenPatternHits("anything at all", [])).toEqual([]);
  });
});

describe("the example corpus must never reach production", () => {
  it("refuses the fallback in a production build", async () => {
    const { assertExampleCorpusAllowed } = await import("@/scripts/compile-corpus");
    expect(() => { assertExampleCorpusAllowed({ VERCEL_ENV: "production" }); }).toThrow(
      /no corpus available for a production build/,
    );
    expect(() => { assertExampleCorpusAllowed({ NODE_ENV: "production" }); }).toThrow();
  });

  it("allows it for local work and preview deploys", async () => {
    const { assertExampleCorpusAllowed } = await import("@/scripts/compile-corpus");
    expect(() => { assertExampleCorpusAllowed({ VERCEL_ENV: "preview" }); }).not.toThrow();
    expect(() => { assertExampleCorpusAllowed({}); }).not.toThrow();
  });

  it("allows a fork to demo the example deliberately", async () => {
    const { assertExampleCorpusAllowed } = await import("@/scripts/compile-corpus");
    expect(() => {
      assertExampleCorpusAllowed({ VERCEL_ENV: "production", ALLOW_EXAMPLE_CORPUS: "1" });
    }).not.toThrow();
  });

  it("an explicit KNOWLEDGE_DIR always wins, production or not", async () => {
    const { resolveCorpusDir } = await import("@/scripts/compile-corpus");
    await expect(
      resolveCorpusDir({ VERCEL_ENV: "production", KNOWLEDGE_DIR: "knowledge.example" }),
    ).resolves.toMatch(/knowledge\.example$/);
  });
});

describe("canaryFor — the gate must not fail on a coin flip", () => {
  it("never emits a digit, so the marker line cannot trip the phone rule", async () => {
    const { canaryFor } = await import("@/lib/corpus/prompt");
    // The hex version tripped the guard whenever a hash happened to carry enough digits, which made
    // the build pass or fail on corpus content that had nothing to do with the failure.
    for (let i = 0; i < 500; i += 1) {
      expect(canaryFor(`corpus revision ${String(i)}`)).toMatch(/^[a-z]{16}$/);
    }
  });

  it("is still content-derived and deterministic", async () => {
    const { canaryFor } = await import("@/lib/corpus/prompt");
    expect(canaryFor("abc")).toBe(canaryFor("abc"));
    expect(canaryFor("abc")).not.toBe(canaryFor("abd"));
  });
})

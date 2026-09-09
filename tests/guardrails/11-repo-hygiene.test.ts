/**
 * Repo-level hygiene that protects several invariants at once: the compiled corpus must never be
 * committed to this public repo, and every environment variable the code reads must be documented
 * in .env.example so nothing is silently required at deploy time.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, readIfExists, trackedFiles, walk } from "./helpers";

const GENERATED = "lib/corpus/corpus.generated.ts";

/** Provided by the platform or the toolchain, never by us. */
const AMBIENT = new Set([
  "NODE_ENV",
  "CI",
  "PORT",
  "TZ",
  "NEXT_RUNTIME",
  "NEXT_PHASE",
  "ANALYZE",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_REGION",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "npm_lifecycle_event",
  "npm_package_version",
]);

describe("hygiene — the compiled corpus stays out of git", () => {
  it("is gitignored", () => {
    expect(readIfExists(".gitignore") ?? "").toContain(GENERATED);
  });

  it("is untracked", () => {
    expect(trackedFiles(GENERATED)).toEqual([]);
  });

  it("no corpus artefact is tracked at all", () => {
    expect(trackedFiles("lib/corpus/*.generated.*", "generated/**")).toEqual([]);
  });

  it("public/cv.pdf is generated, not committed", () => {
    expect(trackedFiles("public/cv.pdf")).toEqual([]);
  });
});

describe("hygiene — .env.example documents every variable the code reads", () => {
  const example = readIfExists(".env.example") ?? "";
  const documented = new Set(
    example
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"))
      .map((l) => l.split("=")[0].trim()),
  );

  it("has a .env.example", () => {
    expect(example.length).toBeGreaterThan(0);
  });

  it("lists every process.env.X referenced under app/, lib/ and scripts/", () => {
    const files = [
      ...walk("app", [".ts", ".tsx", ".mts"]),
      ...walk("lib", [".ts", ".tsx", ".mts"]),
      ...walk("scripts", [".ts", ".tsx", ".mts"]),
    ].filter((f) => !f.endsWith(path.normalize(GENERATED)));

    const referenced = new Map<string, string>();
    const patterns = [
      /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
      /process\.env\[["']([^"']+)["']\]/g,
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const pattern of patterns) {
        for (const match of src.matchAll(pattern)) {
          const name = match[1];
          if (!AMBIENT.has(name)) {
            referenced.set(name, path.relative(REPO_ROOT, file));
          }
        }
      }
    }

    const undocumented = [...referenced.entries()]
      .filter(([name]) => !documented.has(name))
      .map(([name, file]) => `${name} (first seen in ${file})`)
      .sort();

    expect(undocumented, "add these to .env.example").toEqual([]);
  });

  it("holds no value for anything that looks like a secret", () => {
    const filled = example
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"))
      .filter((l) => /(_KEY|_SECRET|_TOKEN|_SALT|SERVICE_ROLE)$/.test(l.split("=")[0].trim()))
      .filter((l) => (l.split("=")[1] ?? "").split("#")[0].trim().length > 0);
    expect(filled).toEqual([]);
  });
});

describe("hygiene — no real contact details in the tracked tree", () => {
  it("contains no phone-number-looking literal in app/, lib/ or scripts/", () => {
    const files = [
      ...walk("app", [".ts", ".tsx", ".mts"]),
      ...walk("lib", [".ts", ".tsx", ".mts"]),
      ...walk("scripts", [".ts", ".tsx", ".mts"]),
    ].filter((f) => !f.endsWith(path.normalize(GENERATED)));

    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      // +20 1xx xxx xxxx and Arabic-Indic runs of seven or more digits.
      if (/\+20[\s-]?1\d[\s-]?\d{3}[\s-]?\d{4}/.test(src) || /[٠-٩۰-۹]{7,}/.test(src)) {
        hits.push(path.relative(REPO_ROOT, file));
      }
    }
    expect(hits).toEqual([]);
  });
});

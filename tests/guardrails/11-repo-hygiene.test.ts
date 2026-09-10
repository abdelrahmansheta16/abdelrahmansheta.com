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

/**
 * `botid` was a dependency, and `isHuman()` called `checkBotId()`, but nothing wired the plugin into
 * the build or declared a protected route — so the check could never reach a verdict and every
 * `isHuman()` gate in front of every paid endpoint returned true for everyone. A dependency that is
 * imported but not installed looks exactly like one that works, which is why this is asserted rather
 * than assumed.
 */
describe("hygiene — bot protection is actually wired", () => {
  const config = readIfExists("next.config.ts") ?? "";
  const layout = readIfExists("app/[locale]/layout.tsx") ?? "";

  it("applies withBotId in next.config.ts", () => {
    expect(config).toContain("withBotId");
    expect(config).toMatch(/export default withBotId\(/);
  });

  it("renders BotIdClient in the root layout", () => {
    expect(layout).toContain("BotIdClient");
  });

  it("declares every endpoint that isHuman() guards", () => {
    const guarded = new Set<string>();
    for (const file of walk("app/api", [".ts"])) {
      // Route handlers only: _lib/http.ts defines isHuman and _lib/sideEffects.ts calls it, and
      // neither of those is an endpoint a visitor can reach.
      if (!file.endsWith(`${path.sep}route.ts`)) continue;
      if (!readFileSync(file, "utf8").includes("isHuman()")) continue;
      const route = path
        .relative(REPO_ROOT, file)
        .split(path.sep)
        .join("/")
        .replace(/^app/, "")
        .replace(/\/route\.ts$/, "");
      guarded.add(route);
    }
    expect(guarded.size, "expected some routes to call isHuman()").toBeGreaterThan(0);
    const undeclared = [...guarded].filter((r) => !layout.includes(`"${r}"`)).sort();
    expect(undeclared, "add these to PROTECTED_ROUTES in the root layout").toEqual([]);
  });
});

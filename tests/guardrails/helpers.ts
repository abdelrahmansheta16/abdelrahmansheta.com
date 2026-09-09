/**
 * Shared plumbing for tests/guardrails. Implementations for the guard, the corpus compiler and the
 * API routes land on separate branches, so every guardrail file uses these synchronous probes to
 * decide whether it can run for real or must skip with a message that names the missing piece.
 * Once the implementation is merged the probe flips to true and the assertions run unchanged.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Marker every Wave-1 stub uses: `throw new Error("x: implemented in area A")`. */
const STUB_MARKER = "implemented in area";

export function repoPath(...parts: string[]): string {
  return path.join(REPO_ROOT, ...parts);
}

export function readIfExists(rel: string): string | null {
  const abs = repoPath(rel);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
}

export function dirExists(rel: string): boolean {
  const abs = repoPath(rel);
  return existsSync(abs) && statSync(abs).isDirectory();
}

/** True when the module exists and no longer throws its Wave-1 stub error. */
export function moduleIsImplemented(rel: string): boolean {
  const src = readIfExists(rel);
  return src !== null && !src.includes(STUB_MARKER);
}

export const GUARD_READY = moduleIsImplemented("lib/brain/guard.ts");
export const COMPILER_READY = moduleIsImplemented("lib/corpus/compile.ts");
export const KNOWLEDGE_EXAMPLE = "knowledge.example";
export const EXAMPLE_CORPUS_READY = COMPILER_READY && dirExists(KNOWLEDGE_EXAMPLE);

export const skipMsg = {
  guard: "lib/brain/guard.ts is still the Wave-1 stub (area A). Runs for real once merged.",
  compiler: "lib/corpus/compile.ts is still the Wave-1 stub (area B). Runs for real once merged.",
  example: `${KNOWLEDGE_EXAMPLE}/ does not exist yet (area B). Runs for real once merged.`,
} as const;

/** Files tracked by git, relative to the repo root. Empty array when git is unavailable. */
export function trackedFiles(...pathspec: string[]): string[] {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--", ...pathspec], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return out.split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

/** Every file under `rel` matching one of `extensions`, recursively. */
export function walk(rel: string, extensions: string[]): string[] {
  const abs = repoPath(rel);
  if (!existsSync(abs)) return [];
  const found: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (extensions.some((e) => entry.name.endsWith(e))) found.push(full);
    }
  };
  visit(abs);
  return found;
}

/**
 * Build the Guard from knowledge.example's own sources, for suites that lint the example prompt.
 * Using the deployed GUARD_CONFIG there would allowlist the OWNER's addresses while linting the
 * example's, so the example's own fake contact address would read as a leak.
 */
export async function loadExampleGuard() {
  const [{ buildGuardConfig }, { createGuard }, { loadCorpus }] = await Promise.all([
    import("@/lib/corpus/compile"),
    import("@/lib/brain/guard"),
    import("@/lib/corpus/load"),
  ]);
  const { sources } = await loadCorpus(repoPath(KNOWLEDGE_EXAMPLE));
  // canary "" on purpose: the compiled prompt carries its own marker by design.
  return createGuard({ ...buildGuardConfig(sources, ""), canary: "" });
}

/** Lazily build the Guard from the compiled GUARD_CONFIG. Only call inside a non-skipped suite. */
export async function loadGuard() {
  const [{ createGuard }, generated] = await Promise.all([
    import("@/lib/brain/guard"),
    import("@/lib/corpus/corpus.generated"),
  ]);
  return createGuard(generated.GUARD_CONFIG);
}

/**
 * Compile knowledge.example/ through the real compiler and the real guard.
 *
 * The guard config is derived from the EXAMPLE's own sources, not from the generated corpus: the
 * generated one carries the owner's denylist and allowlisted addresses, so linting the example with
 * it flags the example's own fake contact address. Deriving per corpus is also what the compiler
 * does, so this exercises the same path a fork would take.
 */
export async function compileExampleCorpus() {
  const [{ buildGuardConfig, compileCorpus }, { createGuard }, { loadCorpus }, { createCorpusLint }] =
    await Promise.all([
      import("@/lib/corpus/compile"),
      import("@/lib/brain/guard"),
      import("@/lib/corpus/load"),
      import("@/lib/corpus/lint"),
    ]);
  const dir = repoPath(KNOWLEDGE_EXAMPLE);
  let lint: ((text: string) => string[]) | undefined;
  if (GUARD_READY) {
    const { sources } = await loadCorpus(dir);
    // canary "" on purpose: the compiled prompt carries its own marker by design.
    lint = createCorpusLint(createGuard({ ...buildGuardConfig(sources, ""), canary: "" }));
  }
  const { corpus } = await compileCorpus({ dir, lint });
  return corpus;
}

/** Suite title that carries the skip reason, so a skipped guardrail explains itself in the report. */
export function suite(base: string, ready: boolean, why: string): string {
  return ready ? base : `${base}  [SKIPPED: ${why}]`;
}

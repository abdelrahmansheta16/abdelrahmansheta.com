/**
 * CLI: resolve a corpus directory, compile it, and write lib/corpus/corpus.generated.ts (gitignored).
 * Exits 1 on any lint failure. Flags: --dry-run (compile and report, write nothing).
 */
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileCorpus, renderGeneratedModule } from "../lib/corpus/compile";
import { loadCorpus } from "../lib/corpus/load";
import { findPhoneNumbersInText } from "libphonenumber-js";
import type { CorpusSources } from "../lib/corpus/load";
import { fetchCorpus } from "./fetch-corpus";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = path.join(repoRoot, "lib/corpus/corpus.generated.ts");

async function exists(dir: string): Promise<boolean> {
  try {
    await access(dir);
    return true;
  } catch {
    return false;
  }
}

/** KNOWLEDGE_DIR > a sibling private checkout > the GitHub tarball > knowledge.example. */
export async function resolveCorpusDir(env: Record<string, string | undefined> = process.env): Promise<string> {
  if (env.KNOWLEDGE_DIR) return path.resolve(env.KNOWLEDGE_DIR);
  const sibling = path.resolve(repoRoot, "..", "portfolio-corpus");
  if (await exists(sibling)) return sibling;
  if (env.CORPUS_REPO_TOKEN) return fetchCorpus({ token: env.CORPUS_REPO_TOKEN });
  return path.join(repoRoot, "knowledge.example");
}

/**
 * Uses the deterministic guard as the corpus lint when area A has implemented it. The canary is passed
 * empty on purpose: the guard's canary rule would otherwise fire on the marker the prompt itself carries.
 */
/**
 * The corpus lint uses the same guard as runtime, but only its LEAK rules.
 *
 * The distinction matters. At runtime the guard judges what the agent SAYS, so "I'm actively looking"
 * must be blocked. At build time it judges a document that must be able to QUOTE the phrases it
 * forbids: policy/redlines.yaml carries the refusal templates ("I'm not job hunting"), the few-shots
 * demonstrate the correct refusal, and policy/topics.yaml lists "politics" precisely so the agent
 * deflects it. Linting those with the job_seeking and topic rules fails every build for doing the
 * right thing. What the corpus must never contain is an actual leak, so phone, email, salary,
 * confidential and canary stay fatal. The allowlists come from buildGuardConfig, so the build and
 * the running agent can never disagree about which CV figures are public.
 */
const LEAK_RULES = new Set(["email", "salary", "confidential", "canary"]);

/**
 * Build-time phone detection, deliberately narrower than the runtime rule.
 *
 * The runtime guard also blocks on loose digit DENSITY, which is the right anti-evasion heuristic for
 * one spoken sentence but wrong for a static document: a real CV bullet ("2,100+ React components ...
 * 22,000+ accounts ... 38,000+ orders") trips it, and so does the prompt's own 16-hex canary marker.
 * In an authored document a leaked number is contiguous or parseable, so that is what we look for.
 * The owner's real numbers are on policy/denylist.txt as well, caught by the confidential rule.
 */
function findPhoneLeak(line: string): boolean {
  const digitsOnly = line.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  // A contiguous run of 7+ digits, optionally broken by single spaces/dashes/dots between groups.
  if (/(?:\d[ .-]?){7,}/.test(digitsOnly.replace(/\b(?:19|20)\d{2}\b/g, " "))) return true;
  return findPhoneNumbersInText(digitsOnly, "EG").length > 0;
}

async function tryGuardLint(
  sources: CorpusSources,
): Promise<{ lint?: (t: string) => string[]; warning?: string }> {
  try {
    const { createGuard } = await import("../lib/brain/guard");
    const { buildGuardConfig } = await import("../lib/corpus/compile");
    // canary "" on purpose: the compiled prompt carries the marker by design.
    const guard = createGuard({ ...buildGuardConfig(sources, ""), canary: "" });
    guard.lint("warm up");
    return {
      lint: (text: string) => {
        const fired = new Set<string>();
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          for (const rule of guard.lint(line)) if (LEAK_RULES.has(rule)) fired.add(rule);
          if (findPhoneLeak(line)) fired.add("phone");
        }
        return [...fired];
      },
    };
  } catch (error) {
    return { warning: `guard lint skipped: ${(error as Error).message}` };
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const dir = await resolveCorpusDir();
  process.stdout.write(`corpus dir: ${dir}\n`);

  const { sources } = await loadCorpus(dir);
  const { lint, warning } = await tryGuardLint(sources);

  const { corpus, warnings } = await compileCorpus({ dir, lint });
  if (!dryRun) await writeFile(OUT_FILE, renderGeneratedModule(corpus), "utf8");

  process.stdout.write(`version: ${corpus.version}\n`);
  process.stdout.write(`tokens: ${corpus.tokenEstimate}\n`);
  for (const w of [...(warning ? [warning] : []), ...warnings]) process.stdout.write(`warning: ${w}\n`);
  process.stdout.write(dryRun ? "dry run: nothing written\n" : `written: ${path.relative(repoRoot, OUT_FILE)}\n`);
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

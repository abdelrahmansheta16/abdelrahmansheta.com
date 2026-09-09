/**
 * CLI: resolve a corpus directory, compile it, and write lib/corpus/corpus.generated.ts (gitignored).
 * Exits 1 on any lint failure. Flags: --dry-run (compile and report, write nothing).
 */
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileCorpus, renderGeneratedModule } from "../lib/corpus/compile";
import { loadCorpus } from "../lib/corpus/load";
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
async function tryGuardLint(sources: CorpusSources): Promise<{ lint?: (t: string) => string[]; warning?: string }> {
  try {
    const { createGuard } = await import("../lib/brain/guard");
    const refusal = (id: string) => {
      const found = sources.redlines.find((r) => r.id === id);
      return { en: found?.refusal_en ?? "", ar: found?.refusal_ar ?? "" };
    };
    const guard = createGuard({
      denylist: sources.denylist,
      allowedEmails: [sources.links.contact_email],
      allowedMetrics: sources.proofPoints.map((p) => p.metric),
      canary: "",
      refusals: {
        phone: refusal("contact"),
        email: refusal("contact"),
        salary: refusal("salary"),
        job_seeking: refusal("job_seeking"),
        confidential: refusal("confidential"),
        topic: { en: sources.topics.deflect_en, ar: sources.topics.deflect_ar },
        generic: { en: sources.topics.deflect_en, ar: sources.topics.deflect_ar },
      },
      topics: sources.topics.deflect,
    });
    return { lint: (text: string) => guard.lint(text) };
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

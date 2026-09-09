/** Corpus compiler API. Area B. scripts/compile-corpus.ts is a thin CLI over this. */
import type { CompiledCorpus } from "./schema";

export interface CompileOptions {
  dir: string; // path to a corpus directory (private repo checkout or knowledge.example)
  lint?: (text: string) => string[]; // optional guard lint; every hit fails the build
}

export interface CompileResult {
  corpus: CompiledCorpus;
  warnings: string[];
}

export async function compileCorpus(_opts: CompileOptions): Promise<CompileResult> {
  throw new Error("compileCorpus: implemented in area B");
}

/** Serialise to lib/corpus/corpus.generated.ts (gitignored). */
export function renderGeneratedModule(_corpus: CompiledCorpus): string {
  throw new Error("renderGeneratedModule: implemented in area B");
}

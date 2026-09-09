/**
 * Downloads the private knowledge repo as a tarball into a temp directory, for CI and Vercel builds
 * where the corpus is not checked out next to this repo. The token is never logged.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const CORPUS_REPO = "abdelrahmansheta16/portfolio-corpus";
export const CORPUS_REF = "main";

export interface FetchOptions {
  token: string;
  repo?: string;
  ref?: string;
}

/**
 * Fetches `repo` at `ref` and extracts it. Returns the path of the extracted corpus root (the single
 * directory GitHub puts inside its tarball).
 */
export async function fetchCorpus(opts: FetchOptions): Promise<string> {
  const repo = opts.repo ?? CORPUS_REPO;
  const ref = opts.ref ?? CORPUS_REF;
  if (opts.token.trim().length === 0) throw new Error("fetchCorpus: an empty token was passed");

  const url = `https://api.github.com/repos/${repo}/tarball/${ref}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "portfolio-corpus-compiler",
    },
  });
  if (!response.ok) {
    throw new Error(`fetchCorpus: GitHub returned ${response.status} ${response.statusText} for ${repo}@${ref}`);
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "portfolio-corpus-"));
  const tarball = path.join(workDir, "corpus.tar.gz");
  await writeFile(tarball, Buffer.from(await response.arrayBuffer()));

  const extractDir = path.join(workDir, "extracted");
  await mkdir(extractDir, { recursive: true });
  await run("tar", ["-xzf", tarball, "-C", extractDir]);

  const entries = await readdir(extractDir, { withFileTypes: true });
  const root = entries.find((entry) => entry.isDirectory());
  if (!root) throw new Error(`fetchCorpus: the tarball for ${repo}@${ref} contained no directory`);
  return path.join(extractDir, root.name);
}

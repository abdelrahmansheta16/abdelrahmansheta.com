/** Unit tests for the corpus CLI helpers: directory resolution and the private-repo tarball fetch. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCorpusDir } from "@/scripts/compile-corpus";
import { CORPUS_REF, CORPUS_REPO, fetchCorpus } from "@/scripts/fetch-corpus";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveCorpusDir", () => {
  it("prefers KNOWLEDGE_DIR and resolves it to an absolute path", async () => {
    await expect(resolveCorpusDir({ KNOWLEDGE_DIR: "knowledge.example" })).resolves.toBe(
      path.resolve("knowledge.example"),
    );
  });

  it("falls back to knowledge.example when there is no sibling checkout and no token", async () => {
    const sibling = path.resolve(REPO_ROOT, "..", "portfolio-corpus");
    const resolved = await resolveCorpusDir({});
    expect([sibling, path.join(REPO_ROOT, "knowledge.example")]).toContain(resolved);
  });

  it("never returns a relative path", async () => {
    expect(path.isAbsolute(await resolveCorpusDir({ KNOWLEDGE_DIR: "./knowledge.example" }))).toBe(true);
  });
});

describe("fetchCorpus", () => {
  it("targets the private corpus repo on main by default", () => {
    expect(CORPUS_REPO).toBe("abdelrahmansheta16/portfolio-corpus");
    expect(CORPUS_REF).toBe("main");
  });

  it("refuses an empty token before touching the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchCorpus({ token: "   " })).rejects.toThrow(/empty token/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends a bearer token and reports a failed download without leaking it", async () => {
    const fetchSpy = vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" }));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchCorpus({ token: "secret-token", repo: "owner/repo", ref: "main" })).rejects.toThrow(
      /GitHub returned 404 Not Found for owner\/repo@main/,
    );
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/owner/repo/tarball/main");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    const message = await fetchCorpus({ token: "secret-token", repo: "owner/repo" }).catch((e: Error) => e.message);
    expect(message).not.toContain("secret-token");
  });
});

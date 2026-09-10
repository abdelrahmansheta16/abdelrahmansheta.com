/** Unit tests for loading + zod validation of a corpus directory, using knowledge.example. */
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { loadCorpus } from "@/lib/corpus/load";
import { ProfileSchema, ProjectFrontmatterSchema, StorySchema } from "@/lib/corpus/schema";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EXAMPLE_DIR = path.resolve(HERE, "../../../knowledge.example");

const temps: string[] = [];

/** Copy knowledge.example somewhere writable so a test can break it on purpose. */
export async function cloneExample(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "corpus-test-"));
  await cp(EXAMPLE_DIR, dir, { recursive: true });
  temps.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("loadCorpus", () => {
  it("loads and validates every file in knowledge.example", async () => {
    const { sources, warnings } = await loadCorpus(EXAMPLE_DIR);
    expect(sources.profile.name).toBe("Nour Example");
    expect(sources.proofPoints.length).toBeGreaterThan(0);
    expect(sources.redlines.map((r) => r.id).sort()).toEqual(["confidential", "contact", "job_seeking", "salary"]);
    // Two projects, one per public_level: the guardrails need a summary_only fixture to assert
    // against, and loaded sources still carry its body — the compiler is what drops it.
    expect(sources.projects.map((p) => p.public_level).sort()).toEqual(["public", "summary_only"]);
    expect(sources.projects.find((p) => p.public_level === "summary_only")?.body).toContain(
      "PRIVATEBODYCANARY",
    );
    expect(sources.stories).toHaveLength(1);
    expect(sources.opinions).toHaveLength(1);
    expect(sources.denylist).toContain("nour.example@gmail.com");
    expect(sources.denylist.some((entry) => entry.startsWith("#"))).toBe(false);
    expect(warnings).toEqual([]);
  });

  it("round-trips the schemas: what it loads still validates", async () => {
    const { sources } = await loadCorpus(EXAMPLE_DIR);
    expect(ProfileSchema.safeParse(sources.profile).success).toBe(true);
    const project = sources.projects[0];
    expect(project).toBeDefined();
    if (project) {
      const { body: _body, file: _file, ...frontmatter } = project;
      expect(ProjectFrontmatterSchema.safeParse(frontmatter).success).toBe(true);
      expect(project.body.length).toBeGreaterThan(0);
    }
    const story = sources.stories[0];
    expect(story).toBeDefined();
    if (story) {
      const { file: _storyFile, ...rest } = story;
      expect(StorySchema.safeParse(rest).success).toBe(true);
    }
  });

  it("reports the file path when a required file is missing", async () => {
    await expect(loadCorpus(path.join(EXAMPLE_DIR, "does-not-exist"))).rejects.toThrow(
      /facts\/profile\.json: file is missing/,
    );
  });

  it("keeps projects, stories and opinions optional, with one warning each", async () => {
    const dir = await cloneExample();
    for (const folder of ["projects", "stories", "opinions"]) {
      await rm(path.join(dir, folder), { recursive: true, force: true });
    }
    const { sources, warnings } = await loadCorpus(dir);
    expect(sources.projects).toEqual([]);
    expect(sources.stories).toEqual([]);
    expect(sources.opinions).toEqual([]);
    expect(warnings).toEqual([
      "projects/ is missing; continuing without it",
      "stories/ is missing; continuing without it",
      "opinions/ is missing; continuing without it",
    ]);
  });

  it("reports a readable path for a schema violation", async () => {
    const dir = await cloneExample();
    const file = path.join(dir, "facts/proof_points.json");
    const points: unknown = JSON.parse(await readFile(file, "utf8"));
    const [first] = points as Array<Record<string, unknown>>;
    if (first) first.claim = "Cut cost by a lot.";
    await writeFile(file, JSON.stringify(points), "utf8");
    await expect(loadCorpus(dir)).rejects.toThrow(/facts\/proof_points\.json: 0\.claim/);
  });
});

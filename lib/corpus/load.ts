/**
 * Reads a corpus directory (the private repo checkout or knowledge.example/) from disk and validates
 * every file with the zod schemas in ./schema. Pure loading: no linting, no rendering.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import { parseForbiddenPatterns, parseListFile } from "./lint";
import type { z } from "zod";
import {
  FaqSchema,
  FewshotSchema,
  LinksSchema,
  LogisticsSchema,
  OpinionFrontmatterSchema,
  ProfileSchema,
  ProjectFrontmatterSchema,
  ProofPointSchema,
  PronunciationSchema,
  RedlineSchema,
  StorySchema,
  TopicsSchema,
} from "./schema";
import type {
  Faq,
  Fewshot,
  Links,
  Logistics,
  OpinionFrontmatter,
  Profile,
  ProjectFrontmatter,
  ProofPoint,
  Pronunciation,
  Redline,
  Story,
  Topics,
} from "./schema";

export interface ProjectDoc extends ProjectFrontmatter {
  body: string;
  file: string;
}
export interface StoryDoc extends Story {
  file: string;
}
export interface OpinionDoc extends OpinionFrontmatter {
  body: string;
  file: string;
}

/** Everything the prompt renderer needs, already validated. */
export interface CorpusSources {
  profile: Profile;
  proofPoints: ProofPoint[];
  logistics: Logistics;
  links: Links;
  redlines: Redline[];
  denylist: string[];
  forbiddenPatterns: RegExp[];
  allowlist: string[];
  topics: Topics;
  voiceGuide: string;
  fewshotMasri: Fewshot[];
  fewshotEn: Fewshot[];
  faq: Faq[];
  pronunciation: Pronunciation[];
  projects: ProjectDoc[];
  stories: StoryDoc[];
  opinions: OpinionDoc[];
}

export interface LoadResult {
  sources: CorpusSources;
  warnings: string[];
}

function formatIssues(file: string, error: z.ZodError): Error {
  const detail = error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "<root>"}: ${issue.message}`)
    .join("; ");
  return new Error(`${file}: ${detail}`);
}

function parseWith<S extends z.ZodTypeAny>(schema: S, data: unknown, file: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw formatIssues(file, result.error);
  return result.data;
}

/** Like readText, but an absent file is an empty one. For policy files a fork need not carry. */
async function readOptionalText(dir: string, rel: string): Promise<string> {
  try {
    return await readFile(path.join(dir, rel), "utf8");
  } catch {
    return "";
  }
}

async function readText(dir: string, rel: string): Promise<string> {
  try {
    return await readFile(path.join(dir, rel), "utf8");
  } catch {
    throw new Error(`${rel}: file is missing from the corpus directory ${dir}`);
  }
}

async function readYaml(dir: string, rel: string): Promise<unknown> {
  return parseYaml(await readText(dir, rel));
}

async function readJson(dir: string, rel: string): Promise<unknown> {
  const raw = await readText(dir, rel);
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${rel}: invalid JSON (${(error as Error).message})`);
  }
}

/** Sorted file names in an optional folder; returns [] and a warning when the folder is absent. */
async function listOptional(
  dir: string,
  rel: string,
  ext: string,
  warnings: string[],
): Promise<string[]> {
  try {
    const entries = await readdir(path.join(dir, rel));
    const files = entries.filter((f) => f.endsWith(ext)).sort();
    if (files.length === 0) warnings.push(`${rel}/ contains no ${ext} files`);
    return files;
  } catch {
    warnings.push(`${rel}/ is missing; continuing without it`);
    return [];
  }
}

export async function loadCorpus(dir: string): Promise<LoadResult> {
  const warnings: string[] = [];

  const profile = parseWith(ProfileSchema, await readJson(dir, "facts/profile.json"), "facts/profile.json");
  const proofPoints = parseWith(
    ProofPointSchema.array(),
    await readJson(dir, "facts/proof_points.json"),
    "facts/proof_points.json",
  );
  const logistics = parseWith(LogisticsSchema, await readYaml(dir, "facts/logistics.yaml"), "facts/logistics.yaml");
  const links = parseWith(LinksSchema, await readYaml(dir, "facts/links.yaml"), "facts/links.yaml");
  const redlines = parseWith(RedlineSchema.array(), await readYaml(dir, "policy/redlines.yaml"), "policy/redlines.yaml");
  const topics = parseWith(TopicsSchema, await readYaml(dir, "policy/topics.yaml"), "policy/topics.yaml");
  const faq = parseWith(FaqSchema.array(), await readYaml(dir, "faq/recruiter.yaml"), "faq/recruiter.yaml");
  const pronunciation = parseWith(
    PronunciationSchema.array(),
    await readYaml(dir, "glossary/pronunciation.yaml"),
    "glossary/pronunciation.yaml",
  );
  const fewshotMasri = parseWith(
    FewshotSchema.array(),
    await readYaml(dir, "persona/fewshot_masri.yaml"),
    "persona/fewshot_masri.yaml",
  );
  const fewshotEn = parseWith(
    FewshotSchema.array(),
    await readYaml(dir, "persona/fewshot_en.yaml"),
    "persona/fewshot_en.yaml",
  );

  const denylist = parseListFile(await readText(dir, "policy/denylist.txt"));
  const allowlist = parseListFile(await readText(dir, "policy/allowlist.txt"));
  // Optional: a corpus without the file simply has no shape rules, which is the right default for
  // knowledge.example and for a fork that has no employer material to protect.
  const forbiddenPatterns = parseForbiddenPatterns(
    await readOptionalText(dir, "policy/forbidden_patterns.txt"),
  );
  const voiceGuide = (await readText(dir, "persona/voice.md")).trimEnd();

  const projects: ProjectDoc[] = [];
  for (const file of await listOptional(dir, "projects", ".md", warnings)) {
    const rel = `projects/${file}`;
    const parsed = matter(await readText(dir, rel));
    const frontmatter = parseWith(ProjectFrontmatterSchema, parsed.data, rel);
    projects.push({ ...frontmatter, body: parsed.content.trim(), file: rel });
  }

  const stories: StoryDoc[] = [];
  for (const file of await listOptional(dir, "stories", ".yaml", warnings)) {
    const rel = `stories/${file}`;
    stories.push({ ...parseWith(StorySchema, await readYaml(dir, rel), rel), file: rel });
  }

  const opinions: OpinionDoc[] = [];
  for (const file of await listOptional(dir, "opinions", ".md", warnings)) {
    const rel = `opinions/${file}`;
    const parsed = matter(await readText(dir, rel));
    const frontmatter = parseWith(OpinionFrontmatterSchema, parsed.data, rel);
    opinions.push({ ...frontmatter, body: parsed.content.trim(), file: rel });
  }

  return {
    warnings,
    sources: {
      profile,
      proofPoints,
      logistics,
      links,
      redlines,
      denylist,
      forbiddenPatterns,
      allowlist,
      topics,
      voiceGuide,
      fewshotMasri,
      fewshotEn,
      faq,
      pronunciation,
      projects,
      stories,
      opinions,
    },
  };
}

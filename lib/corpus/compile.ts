/** Corpus compiler API. Area B. scripts/compile-corpus.ts is a thin CLI over this. */
import { createHash } from "node:crypto";
import { getEncoding } from "js-tiktoken";
import type { CompiledCorpus, Redline } from "./schema";
import type { GuardConfig } from "@/lib/brain/guard";
import { loadCorpus } from "./load";
import type { CorpusSources } from "./load";
import {
  collectStrings,
  findAllowlistViolations,
  findDenylistHits,
  findDigitHits,
  findForbiddenPatternHits,
} from "./lint";
import { CONSENT, DISCLOSURE, renderSystemPrompt } from "./prompt";

export interface CompileOptions {
  dir: string; // path to a corpus directory (private repo checkout or knowledge.example)
  lint?: (text: string) => string[]; // optional guard lint; every hit fails the build
}

export interface CompileResult {
  corpus: CompiledCorpus;
  warnings: string[];
}

/** Above this the build fails: the prompt would eat the context window and the cache discount. */
export const TOKEN_LIMIT = 45_000;
/** Above this the build warns. */
export const TOKEN_WARN = 35_000;

interface NamedText {
  label: string;
  text: string;
}

/** Fields that are read out loud, where digits must be spelled as words. */
export function voiceFacingTexts(sources: CorpusSources): NamedText[] {
  const out: NamedText[] = [];
  sources.fewshotEn.forEach((pair, i) => out.push({ label: `persona/fewshot_en.yaml[${i}].a`, text: pair.a }));
  sources.fewshotMasri.forEach((pair, i) => out.push({ label: `persona/fewshot_masri.yaml[${i}].a`, text: pair.a }));
  for (const project of sources.projects) {
    if (project.spoken_en) out.push({ label: `${project.file}:spoken_en`, text: project.spoken_en });
    if (project.spoken_ar) out.push({ label: `${project.file}:spoken_ar`, text: project.spoken_ar });
  }
  for (const story of sources.stories) {
    if (story.spoken_en) out.push({ label: `${story.file}:spoken_en`, text: story.spoken_en });
    if (story.spoken_ar) out.push({ label: `${story.file}:spoken_ar`, text: story.spoken_ar });
  }
  for (const opinion of sources.opinions) {
    if (opinion.spoken_ar) out.push({ label: `${opinion.file}:spoken_ar`, text: opinion.spoken_ar });
  }
  return out;
}

/** Everything the optional guard lint runs over, besides the final prompt. */
function guardLintTargets(sources: CorpusSources): NamedText[] {
  const out = voiceFacingTexts(sources);
  sources.faq.forEach((entry, i) => {
    if (entry.a_en) out.push({ label: `faq/recruiter.yaml[${i}].a_en`, text: entry.a_en });
    if (entry.a_ar) out.push({ label: `faq/recruiter.yaml[${i}].a_ar`, text: entry.a_ar });
  });
  for (const redline of sources.redlines) {
    out.push({ label: `policy/redlines.yaml:${redline.id}.refusal_en`, text: redline.refusal_en });
    out.push({ label: `policy/redlines.yaml:${redline.id}.refusal_ar`, text: redline.refusal_ar });
  }
  out.push({ label: "policy/topics.yaml:deflect_en", text: sources.topics.deflect_en });
  out.push({ label: "policy/topics.yaml:deflect_ar", text: sources.topics.deflect_ar });
  return out;
}

/** Text that the proper-noun allowlist governs: stories and opinions. */
function allowlistTargets(sources: CorpusSources): NamedText[] {
  const out: NamedText[] = [];
  for (const story of sources.stories) {
    const fields = [
      story.title,
      story.situation,
      story.stakes,
      story.action,
      story.tradeoff,
      story.result,
      story.lesson,
      story.privacy_notes,
      story.spoken_en ?? "",
    ];
    out.push({ label: story.file, text: fields.filter((f) => f.length > 0).join("\n") });
  }
  for (const opinion of sources.opinions) {
    const fields = [opinion.claim ?? "", opinion.why ?? "", opinion.nuance ?? "", opinion.body];
    out.push({ label: opinion.file, text: fields.filter((f) => f.length > 0).join("\n") });
  }
  return out;
}

/** Every lint that can fail the build, as readable `path: problem` lines. */
export function lintCorpus(
  sources: CorpusSources,
  systemPrompt: string,
  guardLint?: (text: string) => string[],
): string[] {
  const failures: string[] = [];

  const everyField = [
    ...collectStrings(sources.profile),
    ...collectStrings(sources.proofPoints),
    ...collectStrings(sources.logistics),
    ...collectStrings(sources.links),
    ...collectStrings(sources.redlines),
    ...collectStrings(sources.topics),
    ...collectStrings(sources.faq),
    ...collectStrings(sources.fewshotEn),
    ...collectStrings(sources.fewshotMasri),
    ...collectStrings(sources.pronunciation),
    ...collectStrings(sources.projects),
    ...collectStrings(sources.stories),
    ...collectStrings(sources.opinions),
    sources.voiceGuide,
  ];
  for (const text of everyField) {
    for (const hit of findForbiddenPatternHits(text, sources.forbiddenPatterns)) {
      failures.push(`a corpus field matches forbidden pattern /${hit}/`);
    }
    for (const hit of findDenylistHits(text, sources.denylist)) {
      failures.push(`denylist: "${hit}" appears in a corpus field`);
    }
  }
  for (const hit of findForbiddenPatternHits(systemPrompt, sources.forbiddenPatterns)) {
    failures.push(`system prompt: matches forbidden pattern /${hit}/`);
  }
  for (const hit of findDenylistHits(systemPrompt, sources.denylist)) {
    failures.push(`denylist: "${hit}" appears in the compiled system prompt`);
  }

  for (const { label, text } of voiceFacingTexts(sources)) {
    for (const digits of findDigitHits(text)) {
      failures.push(`${label}: voice-facing text contains the digits "${digits}"; spell numbers as words`);
    }
  }

  for (const { label, text } of allowlistTargets(sources)) {
    for (const token of findAllowlistViolations(text, sources.allowlist)) {
      failures.push(`${label}: "${token}" is not in policy/allowlist.txt`);
    }
  }

  if (guardLint) {
    for (const { label, text } of guardLintTargets(sources)) {
      for (const rule of guardLint(text)) failures.push(`${label}: guard rule "${rule}" fired`);
    }
    for (const rule of guardLint(systemPrompt)) {
      failures.push(`system prompt: guard rule "${rule}" fired`);
    }
  }

  return [...new Set(failures)];
}

/** o200k_base token count; the same tokeniser family the providers bill on. */
export function estimateTokens(text: string): number {
  return getEncoding("o200k_base").encode(text).length;
}

/**
 * Public CV figures the agent is allowed to say. Without these the phone and salary rules fire on
 * ordinary answers ("we run 2,100 endpoints at 99.95% uptime"). Longest forms first so the guard
 * masks the whole phrase, not just the bare number.
 */
function guardAllowedMetrics(sources: CorpusSources): string[] {
  const base = [
    "2,100+ REST endpoints",
    "2,100+ React components",
    "2,100 endpoints",
    "99.95% uptime",
    "$1.2 billion",
    "$1.2B TVL",
    "$1.2B",
    "22,000+ customer accounts",
    "38,000+ orders",
    "45,000+ lines",
    "7,500+ monthly active users",
    "6,500+ automated tests",
    "350+ Alembic migrations",
    "600+ ORM models",
    "160+ scheduled jobs",
    "144 REST endpoints",
    "1,000+ transactions",
    "22,000",
    "38,000",
    "45,000",
    "7,500",
    "6,500",
    "2,100",
    "1,000",
    "99.95%",
    "70%",
  ];
  const fromMetrics = sources.proofPoints.map((p) => p.metric);
  return [...new Set([...base, ...fromMetrics])].sort((a, b) => b.length - a.length);
}

/**
 * The guard's runtime configuration. Built from the same sources as the prompt so build-time lint and
 * runtime enforcement can never disagree. `canary` is the real marker here: at runtime the guard must
 * block an assistant sentence that recites it. The build-time lint deliberately passes "" instead,
 * because the compiled prompt contains the marker by design.
 */
export function buildGuardConfig(sources: CorpusSources, systemPrompt: string): GuardConfig {
  const byId = new Map(sources.redlines.map((r) => [r.id, r]));
  const generic = {
    en: "I can't go into that here. Ask me about the work instead.",
    ar: "مش هقدر أدخل في ده هنا. اسألني عن الشغل أحسن.",
  };
  const pick = (id: Redline["id"]) => {
    const r = byId.get(id);
    return r ? { en: r.refusal_en, ar: r.refusal_ar } : generic;
  };
  const marker = /Internal marker: ([a-z]{16})/.exec(systemPrompt);
  return {
    denylist: sources.denylist,
    allowedEmails: [sources.links.contact_email, sources.links.legal_email],
    allowedMetrics: guardAllowedMetrics(sources),
    canary: marker ? marker[1] : "",
    refusals: {
      phone: pick("contact"),
      email: pick("contact"),
      salary: pick("salary"),
      confidential: pick("confidential"),
      job_seeking: pick("job_seeking"),
      topic: { en: sources.topics.deflect_en, ar: sources.topics.deflect_ar },
      generic,
    },
    topics: sources.topics.deflect,
  };
}

export async function compileCorpus(opts: CompileOptions): Promise<CompileResult> {
  const { sources, warnings } = await loadCorpus(opts.dir);
  const systemPrompt = renderSystemPrompt(sources);

  const failures = lintCorpus(sources, systemPrompt, opts.lint);
  if (failures.length > 0) {
    throw new Error(`corpus lint failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  }

  const tokenEstimate = estimateTokens(systemPrompt);
  if (tokenEstimate > TOKEN_LIMIT) {
    throw new Error(`system prompt is ${tokenEstimate} tokens, over the ${TOKEN_LIMIT} token limit`);
  }
  if (tokenEstimate > TOKEN_WARN) {
    warnings.push(`system prompt is ${tokenEstimate} tokens, over the ${TOKEN_WARN} warning threshold`);
  }

  const corpus: CompiledCorpus = {
    version: createHash("sha256").update(systemPrompt, "utf8").digest("hex").slice(0, 12),
    builtAt: new Date().toISOString(),
    tokenEstimate,
    systemPrompt,
    profile: sources.profile,
    proofPoints: sources.proofPoints,
    logistics: sources.logistics,
    links: sources.links,
    redlines: sources.redlines,
    topics: sources.topics,
    pronunciation: sources.pronunciation,
    // Non-public metrics are dropped here, not just filtered at each render site. The prompt and the
    // spine both filter already, but the compiled module is bundled into the deployed output, so a
    // metric marked public:false would otherwise be readable in the shipped source even though no
    // page renders it. Stripping at the compiler means it never leaves the private corpus.
    projects: sources.projects.map(({ file: _file, ...project }) => ({
      ...project,
      metrics: project.metrics.filter((metric) => metric.public),
    })),
    consent: { en: CONSENT.en, ar: CONSENT.ar },
    disclosure: { en: DISCLOSURE.en, ar: DISCLOSURE.ar },
    guard: buildGuardConfig(sources, systemPrompt),
  };

  return { corpus, warnings };
}

/** Serialise to lib/corpus/corpus.generated.ts (gitignored). */
export function renderGeneratedModule(corpus: CompiledCorpus): string {
  return [
    "// GENERATED by scripts/compile-corpus.ts. Do not edit and do not commit; this file is gitignored.",
    'import type { CompiledCorpus } from "./schema";',
    "",
    `const corpus: CompiledCorpus = ${JSON.stringify(corpus, null, 2)};`,
    "",
    "export default corpus;",
    "export const CORPUS = corpus;",
    "export const GUARD_CONFIG = corpus.guard;",
    `export const CORPUS_VERSION = ${JSON.stringify(corpus.version)};`,
    "export const SYSTEM_PROMPT = corpus.systemPrompt;",
    "",
  ].join("\n");
}

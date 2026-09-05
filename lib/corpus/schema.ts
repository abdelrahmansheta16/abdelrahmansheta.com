/** zod schemas for every file in the private corpus repo. knowledge.example/ must validate against these too. */
import { z } from "zod";
import { PROJECT_SLUGS } from "@/lib/tools/schema";

const ym = z.string().regex(/^\d{4}(-\d{2})?$/);

export const RoleSchema = z.object({
  company: z.string(),
  company_url: z.string().url().optional(),
  title: z.string(),
  location: z.string().optional(),
  start: ym,
  end: ym.nullable(),
  stack: z.array(z.string()).default([]),
  domain: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
});

export const ProfileSchema = z.object({
  name: z.string(),
  headline: z.string(),
  subheadline: z.string().optional(),
  location: z.string(),
  languages: z.array(z.string()),
  summary: z.string(),
  education: z.array(z.object({ degree: z.string(), institution: z.string(), start: z.string(), end: z.string() })),
  certificates: z.array(z.string()).default([]),
  notable: z.array(z.string()).default([]),
  skills: z.record(z.string(), z.array(z.string())),
  roles: z.array(RoleSchema).min(1),
  scope_notes: z.record(z.string(), z.string()).default({}),
});

export const ProofPointSchema = z.object({
  id: z.string().regex(/^pp-\d{2}-[a-z-]+$/),
  lanes: z.array(z.enum(["A", "B", "C", "D"])),
  claim: z.string().max(200).regex(/^I[\s']/, "claim must be first person"),
  metric: z.string().min(1).regex(/\d/, "metric must contain a number"),
  domain_tags: z.array(z.string()),
  seniority_signal: z.enum(["ic", "senior", "staff", "lead", "founder"]),
  evidence_role: z.string(),
  verified: z.literal(true),
  note: z.string().optional(),
});

export const LogisticsSchema = z
  .object({
    status_phrase_en: z.string(),
    status_phrase_ar: z.string(),
    based_in: z.string(),
    timezone: z.string(),
    markets: z.record(z.string(), z.object({ answer: z.string(), note_en: z.string(), note_ar: z.string() })),
    overlap: z.record(z.string(), z.string()),
    engagement: z.object({ employment: z.boolean(), contract: z.boolean() }),
    notice_period: z.string(),
    interview_preferences_en: z.string(),
    interview_preferences_ar: z.string(),
  })
  .strict(); // a `salary` key here is a build failure by construction

export const LinksSchema = z.object({
  site: z.string().url(),
  linkedin: z.string().url(),
  github: z.string().url(),
  contact_email: z.string().email(),
  legal_email: z.string().email(),
  cal_link: z.string(),
  cv_public_path: z.string(),
});

export const RedlineSchema = z.object({
  id: z.enum(["contact", "salary", "confidential", "job_seeking"]),
  rule: z.string(),
  refusal_en: z.string(),
  refusal_ar: z.string(),
});

export const FaqSchema = z.object({
  q: z.string(),
  policy: z.enum(["answer", "deflect", "refuse"]),
  redline: z.string().optional(),
  source: z.string().optional(),
  a_en: z.string().optional(),
  a_ar: z.string().optional(),
});

export const FewshotSchema = z.object({ q: z.string(), a: z.string() });

export const PronunciationSchema = z.object({
  term: z.string(),
  keep_latin: z.boolean().default(true),
  alias: z.string().optional(),
  tashkeel: z.string().optional(),
});

export const TopicsSchema = z.object({ deflect: z.array(z.string()), deflect_en: z.string(), deflect_ar: z.string() });

export const ProjectFrontmatterSchema = z.object({
  slug: z.enum(PROJECT_SLUGS),
  name: z.string(),
  employer: z.string(),
  period: z.string(),
  public_level: z.enum(["public", "summary_only"]),
  stack: z.array(z.string()).default([]),
  metrics: z.array(z.object({ text: z.string(), verified: z.boolean(), public: z.boolean() })).default([]),
  ui_section: z.string().default("projects"),
  spoken_en: z.string().optional(),
  spoken_ar: z.string().optional(),
});

export const StorySchema = z.object({
  id: z.string(),
  title: z.string(),
  competencies: z.array(z.string()),
  situation: z.string(),
  stakes: z.string(),
  action: z.string(),
  tradeoff: z.string(),
  result: z.string(),
  lesson: z.string(),
  privacy_notes: z.string().default(""),
  followup_risk: z.enum(["low", "med", "high"]).default("low"),
  spoken_en: z.string().optional(),
  spoken_ar: z.string().optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type ProofPoint = z.infer<typeof ProofPointSchema>;
export type Logistics = z.infer<typeof LogisticsSchema>;
export type Links = z.infer<typeof LinksSchema>;
export type Redline = z.infer<typeof RedlineSchema>;
export type Faq = z.infer<typeof FaqSchema>;
export type Fewshot = z.infer<typeof FewshotSchema>;
export type Pronunciation = z.infer<typeof PronunciationSchema>;
export type Topics = z.infer<typeof TopicsSchema>;
export type ProjectFrontmatter = z.infer<typeof ProjectFrontmatterSchema>;
export type Story = z.infer<typeof StorySchema>;

/** Shape of lib/corpus/corpus.generated.ts (gitignored). */
export interface CompiledCorpus {
  version: string;                 // first 12 hex of sha256(systemPrompt)
  builtAt: string;
  tokenEstimate: number;
  systemPrompt: string;            // CORPUS_STATIC, byte-identical for voice and text
  profile: Profile;
  proofPoints: ProofPoint[];
  logistics: Logistics;
  links: Links;
  redlines: Redline[];
  topics: Topics;
  pronunciation: Pronunciation[];
  projects: Array<ProjectFrontmatter & { body: string }>;
  consent: { en: string; ar: string };
  disclosure: { en: string; ar: string };
}

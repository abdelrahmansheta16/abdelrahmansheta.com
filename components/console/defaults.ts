/**
 * Fallback props so <Console/> renders on its own (Storybook, a unit test, a page that has not wired the
 * corpus yet). Deliberately generic: no phone number, no personal address, nothing that is not already
 * on the public site.
 */
import type { ConsoleCorpus } from "@/components/console/types";
import type { Bilingual } from "@/components/console/strings";

export const DEFAULT_CONSENT: Bilingual = {
  en: "This is my cloned voice. Answers come from my CV and project notes. Transcripts are kept, pseudonymised, for 30 days; audio is not stored. Sessions run four minutes.",
  ar: "دا صوتي متعمل بالـAI. الردود كلها من الـCV وملاحظات المشاريع. النص بيتحفظ من غير اسم لمدة ٣٠ يوم، والصوت مش بيتخزن. المكالمة ٤ دقايق.",
};

export const DEFAULT_DISCLOSURE: Bilingual = {
  en: "You are talking to an AI version of Abdelrahman, not to him.",
  ar: "إنت بتتكلم مع نسخة AI من عبدالرحمن، مش هو نفسه.",
};

export const DEFAULT_CORPUS: ConsoleCorpus = {
  links: {
    site: "https://abdelrahmansheta.com",
    linkedin: "https://www.linkedin.com/in/abdelrahmansheta",
    github: "https://github.com/abdelrahmansheta16",
    contact_email: "hello@abdelrahmansheta.com",
    legal_email: "legal@abdelrahmansheta.com",
    cal_link: "abdelrahmansheta/intro",
    cv_public_path: "/cv.pdf",
  },
  logistics: {
    status_phrase_en: "Open to conversations.",
    status_phrase_ar: "مفتوح لأي كلام جديد.",
    based_in: "Cairo, Egypt",
    timezone: "Africa/Cairo (UTC+3)",
    markets: {},
    overlap: {},
    engagement: { employment: true, contract: true },
    notice_period: "—",
    interview_preferences_en: "",
    interview_preferences_ar: "",
  },
  proofPoints: [],
  projects: [],
};

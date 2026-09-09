/**
 * Guard fixtures for area A. Positives are generated from templates × digit scripts × separators so the
 * matrix stays honest (>= 150 per rule, EN and AR); negatives are hand-written recruiter answers that
 * MUST pass, including public CV metrics, years and non-salary money.
 */
import type { GuardConfig } from "@/lib/brain/guard";
import { TOOL_NAMES } from "@/lib/tools/schema";
import type { Locale } from "@/lib/tools/schema";

export const CANARY = "canary-7f3a91d2e5";

export const TEST_CONFIG: GuardConfig = {
  denylist: [
    "Acme Robotics",
    "Project Halcyon",
    "Northwind Bank",
    "Ledgerhouse",
    "Vantage Freight",
    "Blue Orchid Retail",
    "شركة الهلال الأخضر",
    "مشروع سراب",
    "بنك النيل التجاري",
    "أوركيد للتجزئة",
    "مجموعة الشروق",
    "فانتاج للشحن",
  ],
  allowedEmails: ["hello@abdelrahmansheta.com"],
  allowedMetrics: [
    "70%",
    "2,100 endpoints",
    "2,100",
    "99.95% uptime",
    "99.95%",
    "$1.2B TVL",
    "$1.2B",
    "22,000",
    "38,000",
    "45,000",
    "7,500",
    "1,000",
  ],
  canary: CANARY,
  refusals: {
    phone: {
      en: "I don't give out phone numbers — hello@abdelrahmansheta.com reaches him.",
      ar: "مش بدي أرقام تليفون — hello@abdelrahmansheta.com بيوصله.",
    },
    email: {
      en: "The one address to use is hello@abdelrahmansheta.com.",
      ar: "العنوان الوحيد هو hello@abdelrahmansheta.com.",
    },
    salary: {
      en: "I don't discuss salary numbers — that's a conversation for Abdelrahman himself once there's a real role on the table.",
      ar: "مش بتكلم في أرقام المرتب — دي حاجة عبدالرحمن نفسه بيتكلم فيها لما يبقى في دور حقيقي على الطاولة.",
    },
    job_seeking: {
      en: "He's open to conversations rather than running a search.",
      ar: "هو مفتوح للكلام، مش أكتر من كده.",
    },
    confidential: {
      en: "That part I can't go into.",
      ar: "الجزء ده مش بقدر أدخل فيه.",
    },
    topic: {
      en: "Not my lane — happy to talk engineering instead.",
      ar: "دي مش سكتي — تعالى نتكلم في الهندسة أحسن.",
    },
    generic: {
      en: "Let's stay on the engineering side of things.",
      ar: "خلينا في الناحية الهندسية.",
    },
  },
  topics: [
    "politics",
    "election",
    "religion",
    "vaccine",
    "war in",
    "president",
    "سياسة",
    "الانتخابات",
    "الدين",
    "الرئيس",
    "الحرب في",
    "طائفية",
  ],
};

export interface Fixture {
  text: string;
  locale: Locale;
}

/* ------------------------------------------------------------------ *
 * Digit-script helpers
 * ------------------------------------------------------------------ */

export const toArabicIndic = (s: string): string =>
  s.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));

export const toExtendedArabic = (s: string): string =>
  s.replace(/[0-9]/g, (d) => String.fromCharCode(0x06f0 + Number(d)));

const SCRIPTS: ReadonlyArray<(s: string) => string> = [(s) => s, toArabicIndic, toExtendedArabic];

/* ------------------------------------------------------------------ *
 * PHONE
 * ------------------------------------------------------------------ */

/** Groups deliberately avoid 19xx/20xx so the year mask cannot swallow them. */
const PHONE_GROUPS: ReadonlyArray<readonly [string, string, string]> = [
  ["0100", "123", "4567"],
  ["0111", "345", "6789"],
  ["0122", "456", "7788"],
  ["0128", "987", "6543"],
  ["0155", "660", "1122"],
  ["0106", "778", "9900"],
];
const SEPARATORS = ["", " ", "-", "."];
const PHONE_CARRIERS: ReadonlyArray<{ locale: Locale; render: (n: string) => string }> = [
  { locale: "en", render: (n) => `You can reach him directly on ${n} any time.` },
  { locale: "ar", render: (n) => `تقدر تكلمه على طول على ${n} في أي وقت.` },
];

const SPELLED_EN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const SPELLED_AR = ["صفر", "واحد", "اتنين", "تلاتة", "أربعة", "خمسة", "ستة", "سبعة", "تمانية", "تسعة"];

export function phonePositives(): Fixture[] {
  const out: Fixture[] = [];
  for (const groups of PHONE_GROUPS) {
    for (const sep of SEPARATORS) {
      const plain = groups.join(sep);
      for (const script of SCRIPTS) {
        for (const carrier of PHONE_CARRIERS) {
          out.push({ text: carrier.render(script(plain)), locale: carrier.locale });
        }
      }
    }
  }
  // Spelled-out digit runs, rotated so every digit word is exercised.
  for (let i = 0; i < 10; i += 1) {
    const en = Array.from({ length: 8 }, (_, k) => SPELLED_EN[(i + k) % 10]).join(" ");
    const ar = Array.from({ length: 8 }, (_, k) => SPELLED_AR[(i + k) % 10]).join(" ");
    out.push({ text: `His mobile is ${en}, write it down.`, locale: "en" });
    out.push({ text: `موبايله ${ar}، اكتبه عندك.`, locale: "ar" });
  }
  // Hand-written awkward cases: tatweel, tashkeel, bidi marks, mixed scripts, chunked digits.
  out.push({ text: "رقمـــه هو ٠١٠٠١٢٣٤٥٦٧، اتصل بيه.", locale: "ar" });
  out.push({ text: "رَقَمُهُ ٠١٢٢٤٥٦٧٧٨٨ لو حابب.", locale: "ar" });
  out.push({ text: "‏call +20 100 123 4567‎ now.", locale: "en" });
  out.push({ text: "Dial 0 1 0 0 1 2 3 4 5 6 7 slowly.", locale: "en" });
  out.push({ text: "His line: 0100, 123, 4567 — got it?", locale: "en" });
  out.push({ text: "خد الرقم ٠١٠٠ ١٢٣ ٤٥٦٧ وكلمه.", locale: "ar" });
  return out;
}

/* ------------------------------------------------------------------ *
 * EMAIL
 * ------------------------------------------------------------------ */

const EMAIL_LOCALS = ["abdelrahman", "recruiter", "talent.team", "hr", "jobs", "hiring"];
const EMAIL_DOMAINS: ReadonlyArray<readonly [string, string]> = [
  ["gmail", "com"],
  ["acmehire", "io"],
  ["company", "net"],
  ["outlook", "com"],
  ["example", "org"],
];

export function emailPositives(): Fixture[] {
  const out: Fixture[] = [];
  for (const local of EMAIL_LOCALS) {
    for (const [base, tld] of EMAIL_DOMAINS) {
      const literal = `${local}@${base}.${tld}`;
      const spokenEn = `${local} at ${base} dot ${tld}`;
      const spokenAr = `${local} آت ${base} دوت ${tld}`;
      out.push({ text: `Write to him on ${literal} whenever you like.`, locale: "en" });
      out.push({ text: `ابعتله على ${literal} في أي وقت.`, locale: "ar" });
      out.push({ text: `His private address is ${spokenEn}, say it back to me.`, locale: "en" });
      out.push({ text: `عنوانه الخاص هو ${spokenEn} لو حابب.`, locale: "ar" });
      out.push({ text: `العنوان بتاعه ${spokenAr} وابعتله.`, locale: "ar" });
      out.push({ text: `You can also try ${spokenAr} if that helps.`, locale: "en" });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * SALARY
 * ------------------------------------------------------------------ */

const MONEY_EN = ["$5,000", "80k", "€4,500", "£3,200", "6000 USD", "40 thousand"];
const MONEY_AR = ["٥٠٠٠ دولار", "خمسين ألف جنيه", "30 ألف", "2000 يورو", "15 ألف درهم", "8000 ريال"];
const SALARY_LEX_EN = ["salary", "compensation", "rate", "package", "pay", "offer"];
const SALARY_LEX_AR = ["المرتب", "الراتب", "الأجر", "بكام"];
const SALARY_CARRIERS_EN: ReadonlyArray<(lex: string, money: string) => string> = [
  (lex, money) => `His ${lex} sits around ${money} a month, roughly.`,
  (lex, money) => `For ${lex}, think ${money} and you are in the right area.`,
  (lex, money) => `${money} is the ${lex} he would want.`,
];
const SALARY_CARRIERS_AR: ReadonlyArray<(lex: string, money: string) => string> = [
  (lex, money) => `${lex} بتاعه حوالي ${money} في الشهر.`,
  (lex, money) => `لو بتسأل عن ${lex}، يعني ${money} تقريبا.`,
  (lex, money) => `${money} ده ${lex} اللي هو عايزه.`,
];

export function salaryPositives(): Fixture[] {
  const out: Fixture[] = [];
  for (const money of MONEY_EN) {
    for (const lex of SALARY_LEX_EN) {
      for (const carrier of SALARY_CARRIERS_EN) out.push({ text: carrier(lex, money), locale: "en" });
    }
  }
  for (const money of MONEY_AR) {
    for (const lex of SALARY_LEX_AR) {
      for (const carrier of SALARY_CARRIERS_AR) out.push({ text: carrier(lex, money), locale: "ar" });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * JOB_SEEKING
 * ------------------------------------------------------------------ */

const JOB_PHRASES_EN = [
  "actively looking",
  "actively searching",
  "job hunting",
  "applying to",
  "applying for",
  "interviewing at",
  "interviewing with",
  "looking for a job",
  "looking for a role",
  "looking for a position",
  "looking for work",
  "on the job market",
];
const JOB_PHRASES_AR = ["بدور على شغل", "بدور على وظيفة", "بدور على وظايف", "بقدم على وظايف", "بقدم على شغل", "بعمل انترفيوهات"];
const JOB_CARRIERS_EN: ReadonlyArray<(p: string) => string> = [
  (p) => `Honestly he is ${p} right now.`,
  (p) => `Between us, he has been ${p} for a while.`,
  (p) => `He is ${p} teams in Berlin and Dubai.`,
  (p) => `Yes — ${p} is exactly where he is.`,
  (p) => `He told me he is ${p} again.`,
  (p) => `Everyone knows he is ${p} these days.`,
  (p) => `Right now, ${p} describes him well.`,
  (p) => `To be blunt: he is ${p}.`,
  (p) => `His week is mostly ${p} at the moment.`,
];
const JOB_CARRIERS_AR: ReadonlyArray<(p: string) => string> = [
  (p) => `بصراحة هو ${p} دلوقتي.`,
  (p) => `هو ${p} من فترة كده.`,
  (p) => `آه، هو ${p} فعلا.`,
  (p) => `الحقيقة إنه ${p} من شهرين.`,
  (p) => `هو ${p} في كذا مكان.`,
  (p) => `يعني ${p} وخلاص.`,
  (p) => `هو ${p} ومستعجل.`,
  (p) => `اللي أعرفه إنه ${p}.`,
];

export function jobSeekingPositives(): Fixture[] {
  const out: Fixture[] = [];
  for (const phrase of JOB_PHRASES_EN) {
    for (const carrier of JOB_CARRIERS_EN) out.push({ text: carrier(phrase), locale: "en" });
  }
  for (const phrase of JOB_PHRASES_AR) {
    for (const carrier of JOB_CARRIERS_AR) out.push({ text: carrier(phrase), locale: "ar" });
  }
  // Arabic-script variants the normaliser must fold: tatweel, alef and taa-marbuta drift.
  out.push({ text: "هو بدور علي وظيفه من شهرين.", locale: "ar" });
  out.push({ text: "هو بـــدور على شغل بجد.", locale: "ar" });
  return out;
}

/* ------------------------------------------------------------------ *
 * CONFIDENTIAL / CANARY / TOPIC / JSON_SHAPE
 * ------------------------------------------------------------------ */

const NEUTRAL_CARRIERS_EN: ReadonlyArray<(s: string) => string> = [
  (s) => `The work at ${s} was mostly backend.`,
  (s) => `He led the rebuild for ${s}.`,
  (s) => `${s} was the client that quarter.`,
  (s) => `We shipped the pipeline for ${s}.`,
  (s) => `Most of the year went into ${s}.`,
  (s) => `The team behind ${s} was small.`,
  (s) => `He wrote the migration plan for ${s}.`,
];
const NEUTRAL_CARRIERS_AR: ReadonlyArray<(s: string) => string> = [
  (s) => `الشغل في ${s} كان باك اند غالبا.`,
  (s) => `هو اللي قاد إعادة البناء في ${s}.`,
  (s) => `${s} كانت العميل في الفترة دي.`,
  (s) => `عملنا البايبلاين بتاع ${s}.`,
  (s) => `أغلب السنة راحت في ${s}.`,
  (s) => `الفريق بتاع ${s} كان صغير.`,
];

function neutralFixtures(values: readonly string[], repeats: number): Fixture[] {
  const out: Fixture[] = [];
  for (let r = 0; r < repeats; r += 1) {
    for (const value of values) {
      const en = NEUTRAL_CARRIERS_EN[(r + values.indexOf(value)) % NEUTRAL_CARRIERS_EN.length];
      const ar = NEUTRAL_CARRIERS_AR[(r + values.indexOf(value)) % NEUTRAL_CARRIERS_AR.length];
      out.push({ text: en(value), locale: "en" });
      out.push({ text: ar(value), locale: "ar" });
    }
  }
  return out;
}

export function confidentialPositives(): Fixture[] {
  return neutralFixtures(TEST_CONFIG.denylist, 7);
}

export function canaryPositives(): Fixture[] {
  const tokens = Array.from({ length: 12 }, () => CANARY);
  return neutralFixtures(tokens, 7);
}

export function topicPositives(): Fixture[] {
  return neutralFixtures(TEST_CONFIG.topics, 7);
}

const JSON_FORMS: ReadonlyArray<(name: string) => string> = [
  (n) => `{"name": "${n}", "arguments": {}}`,
  (n) => `{"name":"${n}","arguments":{"section":"hero"}}`,
  (n) => `   {"name" : "${n}"}`,
  (n) => `{"tool": "${n}", "input": {}}`,
  (n) => `{"function": "${n}", "parameters": {}}`,
  (n) => "```json\n" + `{"name": "${n}"}` + "\n```",
  (n) => "```\n" + `{"name": "${n}", "arguments": {}}` + "\n```",
  (n) => `<tool_call>{"name": "${n}", "arguments": {}}</tool_call>`,
  (n) => "Sure thing. ```json\n" + `{"name":"${n}"}` + "\n```",
  (n) => "```tool_code\n" + `{"name":"${n}"}` + "\n```",
  (n) => `{"name": "${n}", "arguments": {"locale": "ar"}}`,
  (n) => `{"name": "${n}"}`,
  (n) => "حاضر. ```json\n" + `{"name":"${n}"}` + "\n```",
  (n) => `<tool_call>\n{"tool": "${n}"}\n</tool_call>`,
];

export function jsonShapePositives(): Fixture[] {
  const out: Fixture[] = [];
  TOOL_NAMES.forEach((name, i) => {
    JSON_FORMS.forEach((form, j) => {
      out.push({ text: form(name), locale: (i + j) % 2 === 0 ? "en" : "ar" });
    });
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * NEGATIVES — everything below must PASS the guard.
 * ------------------------------------------------------------------ */

export const NEGATIVES: readonly Fixture[] = [
  // English: public CV metrics, years, counts, non-salary money.
  { text: "He cut LLM cost by 70% with a routing layer.", locale: "en" },
  { text: "The API grew to 2,100 endpoints without a rewrite.", locale: "en" },
  { text: "We held 99.95% uptime through the migration.", locale: "en" },
  { text: "The protocol he audited holds $1.2B TVL.", locale: "en" },
  { text: "About 22,000 orders a week went through the new stack.", locale: "en" },
  { text: "Peak day was 38,000 requests without a page.", locale: "en" },
  { text: "The catalogue reached 45,000 items.", locale: "en" },
  { text: "Around 7,500 drivers were onboarded.", locale: "en" },
  { text: "Roughly 1,000 merchants use the dashboard.", locale: "en" },
  { text: "He joined in 2023 and stayed until the replatform shipped.", locale: "en" },
  { text: "The first version landed in 2019.", locale: "en" },
  { text: "He has been writing backends since 2016.", locale: "en" },
  { text: "There are 14 restaurants on the platform today.", locale: "en" },
  { text: "He spent five years on distributed systems.", locale: "en" },
  { text: "Three engineers, one designer, six weeks.", locale: "en" },
  { text: "The pizza costs 50 pounds, which tells you nothing about him.", locale: "en" },
  { text: "The office coffee machine cost €300 and everyone uses it.", locale: "en" },
  { text: "He is open to conversations about senior backend roles.", locale: "en" },
  { text: "The best address for him is hello@abdelrahmansheta.com.", locale: "en" },
  { text: "Say hello at abdelrahmansheta dot com if you prefer.", locale: "en" },
  { text: "He worked on FastAPI services with pgvector behind them.", locale: "en" },
  { text: "The voice pipeline runs on WebRTC with a 240 second cap.", locale: "en" },
  { text: "Latency dropped from 900 ms to 300 ms.", locale: "en" },
  { text: "He ran a team of four across two timezones.", locale: "en" },
  { text: "The rewrite took 11 weeks end to end.", locale: "en" },
  { text: "Coverage went from 40% to 85% in a quarter.", locale: "en" },
  { text: "He prefers Postgres over a queue service.", locale: "en" },
  { text: "That project used NestJS and Paymob.", locale: "en" },
  { text: "The error rate stayed under half a percent.", locale: "en" },
  { text: "He does not discuss numbers like that here.", locale: "en" },
  { text: "Timezone overlap with London is about six hours.", locale: "en" },
  { text: "He is based in Cairo and works with EU teams.", locale: "en" },
  { text: "The audit found two medium findings and no criticals.", locale: "en" },
  { text: "He shipped the branch manager agent in eight weeks.", locale: "en" },
  { text: "Ninety percent of the traffic is read-only.", locale: "en" },
  { text: "There were 12 services before the consolidation.", locale: "en" },
  { text: "The model routing cut spend by two thirds.", locale: "en" },
  { text: "He wrote the migration in SQL, not an ORM.", locale: "en" },
  { text: "Version 2 shipped a month after version 1.", locale: "en" },
  { text: "The dataset was 30 gigabytes compressed.", locale: "en" },
  { text: "He mentors two juniors every week.", locale: "en" },
  { text: "The retry budget is three attempts.", locale: "en" },
  { text: "Cold start was 400 milliseconds on Vercel.", locale: "en" },
  { text: "He reviews around 20 pull requests a week.", locale: "en" },
  { text: "The team ran two-week sprints.", locale: "en" },
  { text: "That was a 6 month engagement.", locale: "en" },
  { text: "He speaks Arabic and English fluently.", locale: "en" },
  { text: "The stack is Next.js on the front and FastAPI behind it.", locale: "en" },
  { text: "He is happy to walk through the architecture.", locale: "en" },
  { text: "The book was 20 dollars and worth it.", locale: "en" },
  { text: "A taxi to the airport is about 400 pounds.", locale: "en" },
  { text: "Lunch cost 15 dollars for the whole team.", locale: "en" },
  { text: "He built an agent that answers in Egyptian Arabic.", locale: "en" },
  { text: "The p95 sat at 1.8 seconds under load.", locale: "en" },
  { text: "Two of the three services were rewritten.", locale: "en" },

  // Egyptian Arabic negatives.
  { text: "قلل تكلفة الـ LLM بنسبة 70% بطبقة routing.", locale: "ar" },
  { text: "الـ API وصل 2,100 endpoints من غير ما نعيد كتابته.", locale: "ar" },
  { text: "حافظنا على 99.95% uptime طول الهجرة.", locale: "ar" },
  { text: "البروتوكول اللي راجعه فيه $1.2B TVL.", locale: "ar" },
  { text: "حوالي 22,000 أوردر في الأسبوع بيعدوا على الستاك الجديد.", locale: "ar" },
  { text: "أعلى يوم كان 38,000 ريكوست من غير مشاكل.", locale: "ar" },
  { text: "الكتالوج وصل 45,000 منتج.", locale: "ar" },
  { text: "قربنا نوصل 7,500 سواق على المنصة.", locale: "ar" },
  { text: "تقريبا 1,000 تاجر بيستخدموا الداشبورد.", locale: "ar" },
  { text: "بدأ في 2023 وفضل لحد ما الريبلاتفورم خلص.", locale: "ar" },
  { text: "أول نسخة نزلت في 2019.", locale: "ar" },
  { text: "بيكتب باك اند من 2016.", locale: "ar" },
  { text: "فيه 14 مطعم على المنصة دلوقتي.", locale: "ar" },
  { text: "قضى خمس سنين في الأنظمة الموزعة.", locale: "ar" },
  { text: "تلات مهندسين وديزاينر واحد وست أسابيع.", locale: "ar" },
  { text: "البيتزا بـ 50 جنيه، ودي مالهاش دعوة بيه.", locale: "ar" },
  { text: "ماكينة القهوة كلفت 300 يورو وجابت تمنها.", locale: "ar" },
  { text: "هو مفتوح للكلام في أدوار باك اند سينيور.", locale: "ar" },
  { text: "أحسن عنوان ليه هو hello@abdelrahmansheta.com.", locale: "ar" },
  { text: "اشتغل على FastAPI مع pgvector وراها.", locale: "ar" },
  { text: "الـ voice pipeline شغال WebRTC بحد 240 ثانية.", locale: "ar" },
  { text: "اللاتنسي نزل من 900 ملي ثانية لـ 300.", locale: "ar" },
  { text: "قاد فريق من أربعة في تايم زونين.", locale: "ar" },
  { text: "إعادة الكتابة خدت 11 أسبوع.", locale: "ar" },
  { text: "الـ coverage طلع من 40% لـ 85% في ربع سنة.", locale: "ar" },
  { text: "بيفضل بوستجرس على أي queue service.", locale: "ar" },
  { text: "المشروع ده استخدم NestJS و Paymob.", locale: "ar" },
  { text: "نسبة الأخطاء فضلت تحت نص في المية.", locale: "ar" },
  { text: "مش بيتكلم في أرقام زي دي هنا.", locale: "ar" },
  { text: "التداخل مع لندن حوالي ست ساعات.", locale: "ar" },
  { text: "هو في القاهرة وبيشتغل مع فرق أوروبية.", locale: "ar" },
  { text: "المراجعة طلعت ملاحظتين متوسطين ومفيش حاجة خطيرة.", locale: "ar" },
  { text: "نزّل الـ branch manager agent في تمن أسابيع.", locale: "ar" },
  { text: "تسعين في المية من الترافيك قراءة بس.", locale: "ar" },
  { text: "كان فيه 12 سيرفس قبل الدمج.", locale: "ar" },
  { text: "الـ routing وفر تلتين المصاريف.", locale: "ar" },
  { text: "كتب الـ migration بـ SQL مش ORM.", locale: "ar" },
  { text: "النسخة التانية نزلت بعد الأولى بشهر.", locale: "ar" },
  { text: "الداتاسيت كان 30 جيجا مضغوط.", locale: "ar" },
  { text: "بيعمل mentoring لاتنين جونيور كل أسبوع.", locale: "ar" },
  { text: "الـ retry budget تلات محاولات.", locale: "ar" },
  { text: "الـ cold start كان 400 ملي ثانية على Vercel.", locale: "ar" },
  { text: "بيراجع حوالي 20 pull request في الأسبوع.", locale: "ar" },
  { text: "الفريق كان بيشتغل سبرنت كل أسبوعين.", locale: "ar" },
  { text: "دي كانت شغلانة 6 شهور.", locale: "ar" },
  { text: "بيتكلم عربي وإنجليزي كويس.", locale: "ar" },
  { text: "الستاك Next.js قدام و FastAPI ورا.", locale: "ar" },
  { text: "يسعده يشرحلك الأركتيكتشر بالتفصيل.", locale: "ar" },
  { text: "الكتاب كان بـ 20 دولار ومستاهل.", locale: "ar" },
  { text: "التاكسي للمطار بـ 400 جنيه تقريبا.", locale: "ar" },
  { text: "الغدا كلف 15 دولار للفريق كله.", locale: "ar" },
  { text: "بنى agent بيرد بالمصري.", locale: "ar" },
  { text: "الـ p95 كان 1.8 ثانية تحت الضغط.", locale: "ar" },
  { text: "اتنين من التلات سيرفسات اتكتبوا من أول وجديد.", locale: "ar" },
  { text: "شغله الأساسي كان على الـ backend والـ data.", locale: "ar" },
  { text: "عنده خبرة تمن سنين في المجال.", locale: "ar" },
];

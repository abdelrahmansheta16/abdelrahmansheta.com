/**
 * Every string the console renders, keyed by locale. Arabic here is Egyptian (Masri), never fusha:
 * "إزاي" not "كيف", "مش" not "ليس", "عايز" not "أريد". The console owns these instead of messages/*.json
 * so this area can ship without touching the shared i18n catalogue.
 */
import type { Locale } from "@/lib/tools/schema";
import type { ApiReason } from "@/lib/client/api";

export type Bilingual = Readonly<Record<Locale, string>>;

export const S = {
  badge: { en: "AI version of Abdelrahman", ar: "النسخة الـAI من عبدالرحمن" },
  // The privacy page tells a visitor to quote this when asking for their data to be deleted,
  // so it has to be somewhere they can actually read it.
  sessionCode: { en: "Session code", ar: "كود الجلسة" },
  openConsole: { en: "Talk to me", ar: "اتكلم معايا" },
  typeInstead: { en: "Type instead", ar: "اكتب بدل ما تتكلم" },
  close: { en: "Close", ar: "اقفل" },
  send: { en: "Send", ar: "ابعت" },
  inputPlaceholder: { en: "Ask me anything about my work", ar: "اسألني أي حاجة عن شغلي" },
  you: { en: "You", ar: "إنت" },
  agent: { en: "Abdelrahman", ar: "عبدالرحمن" },
  transcriptLabel: { en: "Conversation transcript", ar: "نص المحادثة" },
  talk: { en: "Talk", ar: "اتكلم" },
  endCall: { en: "End", ar: "قفل" },
  mute: { en: "Mute", ar: "اكتم" },
  unmute: { en: "Unmute", ar: "شغّل الميك" },
  langAuto: { en: "Auto", ar: "تلقائي" },
  langEn: { en: "EN", ar: "EN" },
  langAr: { en: "مصري", ar: "مصري" },
  languageLabel: { en: "Reply language", ar: "لغة الرد" },
  continueByText: { en: "Continue by text", ar: "كمّل بالكتابة" },
  thinking: { en: "Thinking", ar: "بفكر" },
  listening: { en: "Listening", ar: "سامعك" },
  speaking: { en: "Speaking", ar: "بتكلم" },
  connecting: { en: "Connecting", ar: "بيوصل" },
  idle: { en: "Ready", ar: "جاهز" },
  ended: { en: "Session ended", ar: "المكالمة خلصت" },
  muted: { en: "Muted", ar: "الميك مكتوم" },
  textOnly: { en: "Text only", ar: "كتابة بس" },
  sessionMeter: { en: "Time left in this call", ar: "الوقت الفاضل في المكالمة" },
  voiceSoon: { en: "Voice is coming soon — type instead", ar: "الصوت لسه جاي — اكتبلي بدالها" },
  voiceResting: { en: "Voice is resting today — type instead", ar: "الصوت مرتاح النهاردة — اكتبلي بدالها" },
  micDenied: {
    en: "This app's built-in browser blocked the microphone.",
    ar: "المتصفح اللي جوه التطبيق دا مانع الميكروفون.",
  },
  openInSafari: { en: "Open in Safari", ar: "افتحها في Safari" },
  copyLink: { en: "Copy link", ar: "انسخ اللينك" },
  copied: { en: "Copied", ar: "اتنسخ" },
  swipeHint: { en: "Swipe down to close", ar: "اسحب لتحت تقفل" },
  // Cards
  cardProject: { en: "Project", ar: "مشروع" },
  cardAvailability: { en: "Availability", ar: "الإتاحة" },
  cardContact: { en: "Contact", ar: "التواصل" },
  cardCv: { en: "CV", ar: "الـCV" },
  downloadCv: { en: "Download the CV (PDF)", ar: "نزّل الـCV (PDF)" },
  bookCall: { en: "Book a call", ar: "احجز مكالمة" },
  bookCallUnavailable: { en: "Booking link is not configured yet.", ar: "لينك الحجز لسه مش متظبط." },
  leaveMessage: { en: "Leave a message", ar: "سيبلي رسالة" },
  yourName: { en: "Your name", ar: "اسمك" },
  yourEmail: { en: "Your e-mail", ar: "إيميلك" },
  yourCompany: { en: "Company", ar: "الشركة" },
  yourMessage: { en: "Message", ar: "الرسالة" },
  optional: { en: "optional", ar: "اختياري" },
  submit: { en: "Send", ar: "ابعت" },
  noThanks: { en: "No thanks", ar: "لأ شكراً" },
  sent: { en: "Sent. I'll come back to you myself.", ar: "اتبعتت. هرد عليك بنفسي." },
  emailSummary: { en: "E-mail me a summary", ar: "ابعتلي ملخص على الإيميل" },
  summaryConsent: {
    en: "Send this conversation's summary to my e-mail. One e-mail, no list.",
    ar: "ابعتلي ملخص الكلام دا على إيميلي. إيميل واحد بس، ومفيش قوايم.",
  },
  leadIntro: { en: "Want me to follow up?", ar: "عايزني أرجعلك؟" },
  consentRequired: { en: "Tick the box first.", ar: "علّم على المربع الأول." },
} as const satisfies Record<string, Bilingual>;

export type StringKey = keyof typeof S;

export function t(key: StringKey, locale: Locale): string {
  return S[key][locale];
}

/** Friendly copy for every reason the API routes can return. */
export const REASON_COPY: Readonly<Record<ApiReason, Bilingual>> = {
  bot_detected: {
    en: "That looked automated, so I stopped it. Try again in a moment.",
    ar: "الطلب دا باين آلي، فوقفته. جرّب تاني بعد شوية.",
  },
  no_session: { en: "Say something first, then I can send this.", ar: "اتكلم الأول، وبعدين أقدر أبعت دي." },
  session_expired: { en: "This session timed out. Start a new one.", ar: "الجلسة دي خلصت. ابدأ واحدة جديدة." },
  invalid_input: { en: "Something in the form isn't right.", ar: "فيه حاجة في الفورم مش مظبوطة." },
  consent_required: { en: "I need the consent box ticked.", ar: "لازم تعلّم على مربع الموافقة." },
  already_sent: { en: "Already sent once this session.", ar: "اتبعتت خلاص في الجلسة دي." },
  email_capped: { en: "I've hit today's e-mail limit. Try tomorrow.", ar: "وصلت لحد الإيميلات النهاردة. جرّب بكرة." },
  guard_blocked: { en: "I can't put that in an e-mail.", ar: "دي حاجة مش هحطها في إيميل." },
  llm_unavailable: { en: "The model is down. Try again shortly.", ar: "الموديل واقع دلوقتي. جرّب كمان شوية." },
  killed: { en: "Voice is off right now — type instead.", ar: "الصوت مقفول دلوقتي — اكتبلي بدالها." },
  capped_global: { en: "Voice is resting today — type instead.", ar: "الصوت مرتاح النهاردة — اكتبلي بدالها." },
  capped_visitor: { en: "That's your voice time for today — type instead.", ar: "خلص وقت الصوت بتاعك النهاردة — اكتبلي بدالها." },
  voice_unavailable: { en: "Voice is coming soon — type instead.", ar: "الصوت لسه جاي — اكتبلي بدالها." },
  network: { en: "Network hiccup. Try again.", ar: "النت فصل لحظة. جرّب تاني." },
  unknown: { en: "That didn't work. Try again.", ar: "مامشيتش. جرّب تاني." },
};

export function reasonCopy(reason: ApiReason, locale: Locale): string {
  return REASON_COPY[reason][locale];
}

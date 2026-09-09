/**
 * About: the summary, logistics from the corpus, and one small photo.
 * public/photo.jpg is optional — when it is absent a neutral placeholder SVG is drawn instead.
 */
import fs from "node:fs";
import path from "node:path";
import Image from "next/image";
import corpus from "@/lib/corpus/corpus.generated";
import { getTranslations } from "next-intl/server";

function photoExists(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), "public", "photo.jpg"));
  } catch {
    return false;
  }
}

export default async function About({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "about" });
  const { profile, logistics } = corpus;
  const isArabic = locale === "ar";
  const hasPhoto = photoExists();

  const engagement = logistics.engagement.employment && logistics.engagement.contract
    ? t("engagementBoth")
    : logistics.engagement.employment
      ? t("engagementEmployment")
      : t("engagementContract");

  const facts: Array<{ term: string; value: string }> = [
    { term: t("availability"), value: isArabic ? logistics.status_phrase_ar : logistics.status_phrase_en },
    { term: t("basedIn"), value: logistics.based_in },
    { term: t("timezone"), value: logistics.timezone },
    { term: t("engagement"), value: engagement },
    { term: t("noticePeriod"), value: logistics.notice_period },
    { term: t("languages"), value: profile.languages.join(" · ") },
  ];

  return (
    <section id="about" className="mx-auto max-w-5xl px-5 py-16">
      <h2 className="text-2xl font-semibold tracking-tight">{t("title")}</h2>

      <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-start">
        <div className="shrink-0">
          {hasPhoto ? (
            <Image
              src="/photo.jpg"
              alt={t("photoAlt")}
              width={128}
              height={128}
              className="h-32 w-32 rounded-xl object-cover"
            />
          ) : (
            <svg
              role="img"
              aria-label={t("photoPlaceholderAlt")}
              viewBox="0 0 128 128"
              className="h-32 w-32 rounded-xl border border-border bg-bg-raised"
            >
              <circle cx="64" cy="50" r="20" fill="var(--border)" />
              <path d="M24 116a40 34 0 0 1 80 0Z" fill="var(--border)" />
            </svg>
          )}
        </div>

        <div className="min-w-0">
          <p className="max-w-[var(--measure)] text-fg">
            <bdi dir="ltr">{profile.summary}</bdi>
          </p>

          <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {facts.map((f) => (
              <div key={f.term}>
                <dt className="text-xs uppercase tracking-wide text-muted">{f.term}</dt>
                <dd className="mt-0.5 text-sm text-fg">{f.value}</dd>
              </div>
            ))}
          </dl>

          <ul className="mt-6 space-y-2 text-sm">
            {Object.entries(logistics.markets).map(([key, market]) => (
              <li key={key} className="flex flex-wrap gap-x-2 text-muted">
                <span className="font-medium text-fg">
                  <bdi dir="ltr">{market.answer}</bdi>
                </span>
                <span>{isArabic ? market.note_ar : market.note_en}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

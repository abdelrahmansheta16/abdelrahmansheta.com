/** /privacy — controller, processors, retention, erasure and the EU AI Act Article 50 disclosure. */
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import corpus from "@/lib/corpus/corpus.generated";
import { pageMetadata } from "@/i18n/metadata";
import SiteHeader from "@/components/layout/SiteHeader";

const PROCESSORS = ["elevenlabs", "llm", "supabase", "resend", "vercel", "cloudflare"] as const;

const RETENTION = ["transcripts", "leads", "probe", "audio"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    locale,
    path: "/privacy",
    title: t("privacyTitle"),
    description: t("privacyDescription"),
    siteName: t("siteName"),
  });
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "privacy" });

  return (
    <>
      <SiteHeader locale={locale} path="/privacy" />
      <main id="content" className="flex-1">
        <article className="mx-auto max-w-3xl px-5 py-14">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>

          <section className="mt-8">
            <h2 className="text-lg font-medium">{t("updated")}</h2>
            <p className="mt-2 text-muted">{t("controller")}</p>
            <p className="mt-2 text-muted">
              <a className="text-accent hover:underline" href={`mailto:${corpus.links.legal_email}`}>
                <bdi className="latin">{corpus.links.legal_email}</bdi>
              </a>
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-medium">{t("aiDisclosureTitle")}</h2>
            <p className="mt-2 text-muted">{t("aiDisclosure")}</p>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-medium">{t("processorsTitle")}</h2>
            <p className="mt-2 text-muted">{t("processorsLede")}</p>
            <ul className="mt-4 space-y-4">
              {PROCESSORS.map((key) => (
                <li key={key} className="rounded-lg border border-border bg-bg-raised p-4">
                  <p className="font-medium">
                    <bdi dir="ltr" className="latin">
                      {t(`processors.${key}.name`)}
                    </bdi>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    <span className="me-1 font-medium text-fg">{t("processorLocation")}:</span>
                    {t(`processors.${key}.location`)}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    <span className="me-1 font-medium text-fg">{t("processorPurpose")}:</span>
                    {t(`processors.${key}.purpose`)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-medium">{t("retentionTitle")}</h2>
            <ul className="mt-2 space-y-1 text-muted">
              {RETENTION.map((key) => (
                <li key={key} className="flex gap-2">
                  <span aria-hidden="true" className="text-accent">
                    ·
                  </span>
                  <span>{t(`retention.${key}`)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-medium">{t("erasureTitle")}</h2>
            <p className="mt-2 text-muted">
              {t("erasureBefore")}{" "}
              <a className="text-accent hover:underline" href={`mailto:${corpus.links.legal_email}`}>
                <bdi className="latin">{corpus.links.legal_email}</bdi>
              </a>{" "}
              {t("erasureAfter")}
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-medium">{t("legalBasisTitle")}</h2>
            <p className="mt-2 text-muted">{t("legalBasis")}</p>
          </section>
        </article>
      </main>
    </>
  );
}

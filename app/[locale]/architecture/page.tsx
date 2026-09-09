/** /architecture — the machine explained for a hiring manager. Live numbers land in the placeholders. */
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/i18n/metadata";
import SiteHeader from "@/components/layout/SiteHeader";

const FLOW = ["s1", "s2", "s3", "s4", "s5"] as const;
const NOT_ALLOWED = ["n1", "n2", "n3", "n4", "n5"] as const;
const NUMBERS = ["dialect", "latency", "cost", "guard"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    locale,
    path: "/architecture",
    title: t("architectureTitle"),
    description: t("architectureDescription"),
    siteName: t("siteName"),
  });
}

export default async function ArchitecturePage({ params }: PageProps<"/[locale]/architecture">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "architecture" });

  const prose = [
    { key: "pitch", title: t("pitchTitle"), body: t("pitch") },
    { key: "prompt", title: t("promptTitle"), body: t("prompt") },
    { key: "arabic", title: t("arabicTitle"), body: t("arabic") },
    { key: "evals", title: t("evalsTitle"), body: t("evals") },
    { key: "privacy", title: t("privacyTitle"), body: t("privacy") },
    { key: "change", title: t("changeTitle"), body: t("change") },
  ];

  return (
    <>
      <SiteHeader locale={locale} path="/architecture" />
      <main id="content" className="flex-1">
        <article className="mx-auto max-w-3xl px-5 py-14">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-3 text-muted">{t("lede")}</p>

          <section className="mt-10">
            <h2 className="text-lg font-medium">{prose[0]?.title}</h2>
            <p className="mt-2 text-muted">{prose[0]?.body}</p>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-medium">{t("flowTitle")}</h2>
            <ol className="mt-4 space-y-3">
              {FLOW.map((key, i) => (
                <li key={key} className="flex gap-3 rounded-lg border border-border bg-bg-raised p-4">
                  <span className="num shrink-0 text-sm font-semibold text-accent">{i + 1}</span>
                  <span className="text-sm text-muted">{t(`flow.${key}`)}</span>
                </li>
              ))}
            </ol>
          </section>

          {prose.slice(1, 2).map((p) => (
            <section key={p.key} className="mt-10">
              <h2 className="text-lg font-medium">{p.title}</h2>
              <p className="mt-2 text-muted">{p.body}</p>
            </section>
          ))}

          <section className="mt-10">
            <h2 className="text-lg font-medium">{t("notAllowedTitle")}</h2>
            <ul className="mt-3 space-y-2">
              {NOT_ALLOWED.map((key) => (
                <li key={key} className="flex gap-2 text-muted">
                  <span aria-hidden="true" className="text-accent">
                    ·
                  </span>
                  <span>{t(`notAllowed.${key}`)}</span>
                </li>
              ))}
            </ul>
          </section>

          {prose.slice(2).map((p) => (
            <section key={p.key} className="mt-10">
              <h2 className="text-lg font-medium">{p.title}</h2>
              <p className="mt-2 text-muted">{p.body}</p>
            </section>
          ))}

          <section className="mt-10">
            <h2 className="text-lg font-medium">{t("numbersTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{t("numbersNote")}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {NUMBERS.map((key) => (
                <div key={key} className="rounded-lg border border-border bg-bg-raised p-4">
                  <dt className="text-xs uppercase tracking-wide text-muted">{t(`numbers.${key}`)}</dt>
                  {/* Placeholder until the metrics endpoint is wired. */}
                  <dd className="num mt-1 text-2xl font-semibold text-accent">{t("placeholder")}</dd>
                </div>
              ))}
            </dl>
          </section>
        </article>
      </main>
    </>
  );
}

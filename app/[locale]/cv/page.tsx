/** /cv — the full CV rendered from the compiled corpus, plus a link to the generated PDF. */
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import corpus from "@/lib/corpus/corpus.generated";
import { pageMetadata } from "@/i18n/metadata";
import SiteHeader from "@/components/layout/SiteHeader";
import { ProfilePageJsonLd } from "@/components/spine/JsonLd";
import { formatRange } from "@/components/spine/format";
import ProseMesh from "@/components/motion/ProseMesh";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    locale,
    path: "/cv",
    title: t("cvTitle"),
    description: t("cvDescription"),
    siteName: t("siteName"),
  });
}

export default async function CvPage({ params }: PageProps<"/[locale]/cv">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "cv" });
  const { profile, links } = corpus;

  return (
    <>
      <SiteHeader locale={locale} path="/cv" />
      <main id="content" className="flex-1">
        <article id="cv" className="relative isolate mx-auto max-w-3xl overflow-hidden px-5 py-14">
          <ProseMesh />
          <header className="border-b border-border pb-6">
            <h1 className="grad-text text-3xl font-semibold tracking-tight sm:text-4xl">{profile.name}</h1>
            <p className="mt-1 text-muted">{profile.headline}</p>
            <p className="mt-1 text-sm text-muted">
              {profile.location} ·{" "}
              <a className="text-accent hover:underline" href={`mailto:${links.contact_email}`}>
                <bdi className="latin">{links.contact_email}</bdi>
              </a>
            </p>
            <p className="mt-4">
              {/*
                Point at /api/cv, not at links.cv_public_path.
                That field is "/cv" — this very page — so "Download PDF" navigated the visitor back
                to where they already were. /api/cv is the route that actually serves the file: it
                rate-limits per ip_hash (5/day) and redirects to /cv.pdf, which `pnpm build` now
                generates, so the target exists in the deployment instead of 404ing.
              */}
              {/*
                eslint-disable-next-line @next/next/no-html-link-for-pages --
                /api/cv is a route handler that 302s to a PDF, not a page. <Link> would client-side
                navigate, which cannot deliver a file download.
              */}
              <a
                href="/api/cv"
                className="glow-hover inline-flex rounded-full btn-gradient px-4 py-2 text-sm font-semibold"
              >
                {t("download")}
              </a>
            </p>
            <p className="mt-2 text-xs text-muted">{t("downloadNote")}</p>
          </header>

          <section className="mt-8">
            <h2 className="text-lg font-medium">{t("summary")}</h2>
            <p className="mt-2 text-fg">
              <bdi dir="ltr">{profile.summary}</bdi>
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-medium">{t("experience")}</h2>
            <ol className="mt-3 space-y-6">
              {profile.roles.map((role) => (
                <li key={`${role.company}-${role.start}`}>
                  <h3 className="font-medium">
                    <bdi dir="ltr">
                      {role.title} · {role.company}
                    </bdi>
                  </h3>
                  <p className="num text-xs text-muted">
                    {formatRange(role.start, role.end, locale, t("present"))}
                    {role.location ? ` · ${role.location}` : ""}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {role.achievements.map((a) => (
                      <li key={a} className="flex gap-2">
                        <span aria-hidden="true" className="text-accent">
                          ·
                        </span>
                        <bdi dir="ltr">{a}</bdi>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-medium">{t("skills")}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {Object.entries(profile.skills).map(([group, items]) => (
                <div key={group} className="flex flex-wrap gap-x-2">
                  <dt className="font-medium">
                    <bdi dir="ltr">{group}</bdi>:
                  </dt>
                  <dd className="text-muted">
                    <bdi dir="ltr" className="latin">
                      {items.join(" · ")}
                    </bdi>
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {profile.notable.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-lg font-medium">{t("highlights")}</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {profile.notable.map((n) => (
                  <li key={n} className="flex gap-2">
                    <span aria-hidden="true" className="text-accent">
                      ·
                    </span>
                    <bdi dir="ltr">{n}</bdi>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-8">
            <h2 className="text-lg font-medium">{t("education")}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {profile.education.map((e) => (
                <li key={`${e.institution}-${e.start}`}>
                  <bdi dir="ltr">
                    {e.degree} — {e.institution}
                  </bdi>{" "}
                  <span className="num text-muted">
                    ({e.start}–{e.end})
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {profile.certificates.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-lg font-medium">{t("certificates")}</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {profile.certificates.map((c) => (
                  <li key={c}>
                    <bdi dir="ltr">{c}</bdi>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-8">
            <h2 className="text-lg font-medium">{t("languages")}</h2>
            <p className="mt-2 text-sm text-muted">{profile.languages.join(" · ")}</p>
          </section>
        </article>
        <ProfilePageJsonLd locale={locale} />
      </main>
    </>
  );
}

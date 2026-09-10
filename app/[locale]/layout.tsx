/**
 * Root layout. Lives inside [locale] so <html lang/dir> and the font stack can be locale-aware.
 * Everything here is a Server Component; the only client JS on the spine is ConsoleTrigger.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import { dirFor, routing } from "@/i18n/routing";
import { languageAlternates, SITE_URL } from "@/i18n/metadata";
import SkipLink from "@/components/layout/SkipLink";
import SiteFooter from "@/components/layout/SiteFooter";
import { PersonAndWebSiteJsonLd } from "@/components/spine/JsonLd";
import Console from "@/components/console/Console";
import ChatFab from "@/components/console/ChatFab";
import corpus from "@/lib/corpus/corpus.generated";
import { BotIdClient } from "botid/client";
import "../globals.css";

/**
 * Every endpoint that spends money or writes a row. `isHuman()` guards each of these server-side,
 * but `checkBotId()` can only reach a verdict for a path declared here — an undeclared path is
 * treated as human, which is why those gates were passing everyone through.
 */
const PROTECTED_ROUTES = [
  { path: "/api/chat", method: "POST" },
  { path: "/api/lead", method: "POST" },
  { path: "/api/message", method: "POST" },
  { path: "/api/summary", method: "POST" },
  { path: "/api/voice/session", method: "POST" },
  { path: "/api/voice/probe", method: "POST" },
  { path: "/api/cv", method: "GET" },
];

const latin = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-latin",
  display: "swap",
});

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-arabic",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("homeTitle"), template: `%s · ${t("siteName")}` },
    description: t("homeDescription"),
    applicationName: t("siteName"),
    authors: [{ name: "Abdelrahman Sheta", url: SITE_URL }],
    alternates: { canonical: SITE_URL, languages: languageAlternates("/") },
    robots: { index: true, follow: true },
  };
}

export const viewport = {
  themeColor: "#0b0b0c",
  colorScheme: "dark",
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "nav" });
  const fab = await getTranslations({ locale, namespace: "fab" });

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${latin.variable} ${arabic.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <BotIdClient protect={PROTECTED_ROUTES} />
        {/*
          Marks the document as scripted, before first paint so there is no flash.
          `.reveal` elements are only hidden under `.js` (app/globals.css), so with JavaScript off
          this class never lands, nothing is ever hidden, and the page reads in full — which this
          site claims and should keep being true. Inline and synchronous on purpose: a deferred
          script would run after paint and the hidden state would arrive as a visible flicker.
        */}
        <script
          dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }}
        />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-fg">
        <NextIntlClientProvider>
          <SkipLink label={t("skip")} />
          {children}
          <SiteFooter locale={locale} />
          <PersonAndWebSiteJsonLd locale={locale} />
          {/*
            The console lives here rather than in the hero so it exists on /cv, /privacy and
            /architecture too — otherwise the floating button on those pages would dispatch
            `console:open` into a page with nothing listening. Corpus data is passed as props, not
            imported inside the client bundle, so only the public fields cross the boundary.
          */}
          <Console
            locale={locale === "ar" ? "ar" : "en"}
            consent={corpus.consent}
            disclosure={corpus.disclosure}
            corpus={{
              links: corpus.links,
              logistics: corpus.logistics,
              proofPoints: corpus.proofPoints,
              projects: corpus.projects.map((project) => ({
                slug: project.slug,
                name: project.name,
                employer: project.employer,
                period: project.period,
                metrics: project.metrics,
              })),
            }}
          />
          <ChatFab label={fab("label")} hint={fab("hint")} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

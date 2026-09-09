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
import "../globals.css";

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

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${latin.variable} ${arabic.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-bg text-fg">
        <NextIntlClientProvider>
          <SkipLink label={t("skip")} />
          {children}
          <SiteFooter locale={locale} />
          <PersonAndWebSiteJsonLd locale={locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

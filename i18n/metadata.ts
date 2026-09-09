/** Shared metadata helpers: canonical URLs and hreflang alternates for every locale of a page. */
import type { Metadata } from "next";
import corpus from "@/lib/corpus/corpus.generated";
import { pathFor, routing } from "./routing";

export const SITE_URL = corpus.links.site;

/** Absolute URL for a locale-less path in a given locale. */
export function absoluteUrl(locale: string, path = "/"): string {
  return new URL(pathFor(locale, path), SITE_URL).toString();
}

export function languageAlternates(path = "/"): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) languages[locale] = absoluteUrl(locale, path);
  languages["x-default"] = absoluteUrl(routing.defaultLocale, path);
  return languages;
}

interface PageMetaInput {
  locale: string;
  path?: string;
  title: string;
  description: string;
  siteName: string;
}

export function pageMetadata({
  locale,
  path = "/",
  title,
  description,
  siteName,
}: PageMetaInput): Metadata {
  const url = absoluteUrl(locale, path);
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName,
      locale: locale === "ar" ? "ar_EG" : "en_US",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

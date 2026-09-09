/** next-intl routing config: en at `/`, Egyptian Arabic at `/ar`. Single source of truth for locales. */
import { defineRouting } from "next-intl/routing";
import { LOCALES } from "@/lib/tools/schema";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: "en",
  // `/` is English, `/ar` is Arabic. Detection from the cookie then Accept-Language.
  localePrefix: "as-needed",
  localeDetection: true,
  localeCookie: { name: "NEXT_LOCALE", sameSite: "lax", path: "/" },
  // We emit hreflang in <head> ourselves via generateMetadata, so skip the Link header.
  alternateLinks: false,
});

export type AppLocale = (typeof routing.locales)[number];

/** `dir` for a locale. Arabic is the only RTL locale we ship. */
export function dirFor(locale: string): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Path prefix for a locale under `as-needed` ("" for en, "/ar" for ar). */
export function pathFor(locale: string, path = ""): string {
  const clean = path === "/" ? "" : path;
  return locale === routing.defaultLocale ? clean || "/" : `/${locale}${clean}`;
}

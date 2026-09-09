/** Sitemap with an hreflang alternates block per URL. Admin and API are excluded by construction. */
import type { MetadataRoute } from "next";
import { absoluteUrl, languageAlternates } from "@/i18n/metadata";
import { routing } from "@/i18n/routing";

const PATHS = ["/", "/cv", "/architecture", "/privacy"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PATHS.map((path) => ({
    url: absoluteUrl(routing.defaultLocale, path),
    lastModified,
    changeFrequency: "monthly" as const,
    priority: path === "/" ? 1 : 0.6,
    alternates: { languages: languageAlternates(path) },
  }));
}

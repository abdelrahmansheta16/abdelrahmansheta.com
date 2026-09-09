/** robots.txt — everything indexable except the owner console and the API surface. */
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/i18n/metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

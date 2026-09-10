/**
 * robots.txt — indexable only from the canonical domain.
 *
 * Every deployment renders the same canonical URLs, because `SITE_URL` is compiled into the corpus
 * rather than read from the environment. So while the site lives on a throwaway `*.vercel.app`
 * address, an indexed copy would compete with the real domain for its own content. The rule below
 * disallows everything until the deployment's own production host *is* the canonical host, which
 * means attaching the domain and redeploying lifts the block with nothing to remember.
 */
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/i18n/metadata";

type Env = Record<string, string | undefined>;

/** True when this deployment is served from the canonical domain in `SITE_URL`. */
export function isCanonicalDeployment(env: Env, siteUrl: string = SITE_URL): boolean {
  // No Vercel environment at all means local or self-hosted: honour the configured domain.
  if (!env.VERCEL) return true;
  if (env.VERCEL_ENV !== "production") return false;
  const host = env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!host) return false;
  try {
    return host.toLowerCase() === new URL(siteUrl).host.toLowerCase();
  } catch {
    return false;
  }
}

export function robotsFor(env: Env, siteUrl: string = SITE_URL): MetadataRoute.Robots {
  if (!isCanonicalDeployment(env, siteUrl)) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}

export default function robots(): MetadataRoute.Robots {
  return robotsFor(process.env);
}

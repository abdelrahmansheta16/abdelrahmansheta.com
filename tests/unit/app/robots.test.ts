/**
 * robots.txt must not invite indexing of a throwaway deployment URL. The condition is derived from
 * the deployment's own production host, so attaching the real domain lifts the block by itself.
 */
import { describe, expect, it } from "vitest";
import { isCanonicalDeployment, robotsFor } from "@/app/robots";

const SITE = "https://abdelrahmansheta.com";

describe("robots — canonical deployment detection", () => {
  it("treats a non-Vercel environment as canonical", () => {
    expect(isCanonicalDeployment({}, SITE)).toBe(true);
  });

  it("rejects previews", () => {
    const env = {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_PROJECT_PRODUCTION_URL: "abdelrahmansheta.com",
    };
    expect(isCanonicalDeployment(env, SITE)).toBe(false);
  });

  it("rejects production on a vercel.app host", () => {
    const env = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "sheta-ai-abdelrahmansheta16s-projects.vercel.app",
    };
    expect(isCanonicalDeployment(env, SITE)).toBe(false);
  });

  it("accepts production on the canonical host, case-insensitively", () => {
    const env = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "AbdelrahmanSheta.com",
    };
    expect(isCanonicalDeployment(env, SITE)).toBe(true);
  });

  it("rejects a production deployment with no known host", () => {
    expect(isCanonicalDeployment({ VERCEL: "1", VERCEL_ENV: "production" }, SITE)).toBe(false);
  });

  it("rejects rather than throws on an unparseable site URL", () => {
    const env = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "abdelrahmansheta.com",
    };
    expect(isCanonicalDeployment(env, "not a url")).toBe(false);
  });
});

describe("robots — rendered rules", () => {
  it("disallows everything, and advertises nothing, off the canonical domain", () => {
    const env = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "sheta-ai-abdelrahmansheta16s-projects.vercel.app",
    };
    const out = robotsFor(env, SITE);
    expect(out.rules).toEqual([{ userAgent: "*", disallow: "/" }]);
    expect(out.sitemap).toBeUndefined();
    expect(out.host).toBeUndefined();
  });

  it("allows crawling, minus the console and the API, on the canonical domain", () => {
    const env = {
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "abdelrahmansheta.com",
    };
    const out = robotsFor(env, SITE);
    expect(out.rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }]);
    expect(out.sitemap).toBe(`${SITE}/sitemap.xml`);
    expect(out.host).toBe(SITE);
  });
});

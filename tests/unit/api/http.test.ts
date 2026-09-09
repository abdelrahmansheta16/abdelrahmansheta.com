/** The pseudonymisation, cookie and origin helpers every route depends on. These are the pieces that,
 *  if they silently degraded, would turn the caps into suggestions. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clientIp,
  fail,
  honeypotTripped,
  ipHash,
  isEmail,
  isSameOrigin,
  json,
  newVisitorCookie,
  requiredEnv,
  safeEqual,
  sha256Hex,
  signVisitorId,
  trimmedString,
  verifyVisitorCookie,
  visitorHash,
} from "@/app/api/_lib/http";

function request(headers: Record<string, string>, url = "https://abdelrahmansheta.com/api/x"): Request {
  return new Request(url, { headers });
}

describe("clientIp", () => {
  it("takes the first entry of x-forwarded-for", () => {
    expect(clientIp(request({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip and then to a placeholder", () => {
    expect(clientIp(request({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(request({}))).toBe("0.0.0.0");
  });
});

describe("ipHash", () => {
  const original = process.env.IP_HASH_SALT;
  beforeEach(() => { process.env.IP_HASH_SALT = "salty"; });
  afterEach(() => { process.env.IP_HASH_SALT = original; });

  it("is a hex digest that never contains the address itself", () => {
    const hash = ipHash(request({ "x-forwarded-for": "203.0.113.7" }));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203");
  });

  it("rotates daily, so it is not a stable visitor identifier", () => {
    const req = request({ "x-forwarded-for": "203.0.113.7" });
    const monday = ipHash(req, new Date("2026-09-07T12:00:00Z"));
    const tuesday = ipHash(req, new Date("2026-09-08T12:00:00Z"));
    expect(monday).not.toBe(tuesday);
    expect(ipHash(req, new Date("2026-09-07T23:59:00Z"))).toBe(monday);
  });
});

describe("visitor cookie", () => {
  const secret = "cookie-secret";

  it("round-trips a freshly minted cookie", () => {
    const { id, value } = newVisitorCookie(secret);
    expect(verifyVisitorCookie(value, secret)).toBe(id);
  });

  it("rejects a forged or re-signed cookie", () => {
    const { id } = newVisitorCookie(secret);
    expect(verifyVisitorCookie(`${id}.deadbeef`, secret)).toBeNull();
    expect(verifyVisitorCookie(`${id}.${signVisitorId(id, "other-secret")}`, secret)).toBeNull();
    expect(verifyVisitorCookie("no-dot", secret)).toBeNull();
    expect(verifyVisitorCookie(undefined, secret)).toBeNull();
    expect(verifyVisitorCookie("x.y", "")).toBeNull();
  });

  it("derives a stable visitor_hash that is not the cookie value", () => {
    expect(visitorHash(null)).toBeNull();
    const hash = visitorHash("abc");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(visitorHash("abc"));
    expect(hash).not.toBe(visitorHash("abd"));
  });
});

describe("safeEqual", () => {
  it("compares equal and unequal strings of any length without throwing", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secrey")).toBe(false);
    expect(safeEqual("", "longer")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("isSameOrigin", () => {
  it("accepts a matching Origin or Referer", () => {
    expect(isSameOrigin(request({ host: "abdelrahmansheta.com", origin: "https://abdelrahmansheta.com" }))).toBe(true);
    expect(
      isSameOrigin(request({ host: "abdelrahmansheta.com", referer: "https://abdelrahmansheta.com/ar" })),
    ).toBe(true);
  });

  it("rejects another origin, a missing one and a malformed one", () => {
    expect(isSameOrigin(request({ host: "abdelrahmansheta.com", origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(request({ host: "abdelrahmansheta.com" }))).toBe(false);
    expect(isSameOrigin(request({ host: "abdelrahmansheta.com", origin: "not a url" }))).toBe(false);
  });
});

describe("responses", () => {
  it("always answers JSON with no-store, never HTML", async () => {
    const res = fail("capped_global", 429);
    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: false, reason: "capped_global" });
    expect((await json({ ok: true }).json()) as unknown).toEqual({ ok: true });
  });
});

describe("input validation", () => {
  it("accepts plausible addresses and rejects the rest", () => {
    expect(isEmail("hello@abdelrahmansheta.com")).toBe(true);
    expect(isEmail("no-at-sign")).toBe(false);
    expect(isEmail("a@b")).toBe(false);
    expect(isEmail(42)).toBe(false);
    expect(isEmail(`${"a".repeat(250)}@b.com`)).toBe(false);
  });

  it("trims and bounds free text", () => {
    expect(trimmedString("  hi  ", 10)).toBe("hi");
    expect(trimmedString("   ", 10)).toBeNull();
    expect(trimmedString("toolong", 3)).toBeNull();
    expect(trimmedString(7, 10)).toBeNull();
  });

  it("treats a filled honeypot as a bot", () => {
    expect(honeypotTripped({ website: "" })).toBe(false);
    expect(honeypotTripped({})).toBe(false);
    expect(honeypotTripped({ website: "http://spam" })).toBe(true);
  });
});

describe("requiredEnv", () => {
  it("lists only the missing or empty names", () => {
    process.env.TEST_PRESENT = "x";
    process.env.TEST_EMPTY = "";
    expect(requiredEnv("TEST_PRESENT", "TEST_EMPTY", "TEST_ABSENT")).toEqual(["TEST_EMPTY", "TEST_ABSENT"]);
    delete process.env.TEST_PRESENT;
    delete process.env.TEST_EMPTY;
  });
});

describe("sha256Hex", () => {
  it("matches the known digest of the empty string", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

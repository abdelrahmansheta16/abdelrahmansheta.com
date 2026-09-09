/**
 * Shared plumbing for every route under app/api: JSON-only responses, pseudonymous hashing, the signed
 * visitor cookie, the same-origin check and the BotID wrapper.
 *
 * Two rules this file exists to keep: an API route NEVER returns HTML (an ElevenLabs adapter that gets
 * an HTML error page fails in an unreadable way), and nothing here ever logs a secret or a raw IP.
 */
import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const VISITOR_COOKIE = "pv";
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// responses
// ---------------------------------------------------------------------------

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/** Every failure on every route looks like this. `reason` is a stable machine token, never prose. */
export function fail(reason: string, status: number): NextResponse {
  return json({ ok: false, reason }, status);
}

// ---------------------------------------------------------------------------
// hashing
// ---------------------------------------------------------------------------

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Constant-time string comparison that does not leak length through early return. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** The first address in x-forwarded-for, else the platform header. Never logged, never stored raw. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.length > 0) {
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) return first;
  }
  return request.headers.get("x-real-ip") ?? "0.0.0.0";
}

/** ip_hash = sha256(ip || IP_HASH_SALT || current_date) — rotates daily, so it is not a stable id. */
export function ipHash(request: Request, now: Date = new Date()): string {
  const salt = process.env.IP_HASH_SALT ?? "";
  const day = now.toISOString().slice(0, 10);
  return sha256Hex(`${clientIp(request)}${salt}${day}`);
}

// ---------------------------------------------------------------------------
// visitor cookie: `<id>.<hmac>`, HttpOnly, so a visitor cannot forge a second daily allowance
// ---------------------------------------------------------------------------

export function signVisitorId(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id, "utf8").digest("hex");
}

export function verifyVisitorCookie(value: string | undefined, secret: string): string | null {
  if (value === undefined || secret === "") return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  return safeEqual(mac, signVisitorId(id, secret)) ? id : null;
}

export function newVisitorCookie(secret: string): { id: string; value: string } {
  const id = randomBytes(16).toString("hex");
  return { id, value: `${id}.${signVisitorId(id, secret)}` };
}

export function setVisitorCookie(response: NextResponse, value: string): NextResponse {
  response.cookies.set(VISITOR_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

/** visitor_hash = sha256(cookie_id || salt). Stable across days, unlike ip_hash. */
export function visitorHash(id: string | null): string | null {
  return id === null ? null : sha256Hex(`${id}${process.env.IP_HASH_SALT ?? ""}`);
}

// ---------------------------------------------------------------------------
// same-origin
// ---------------------------------------------------------------------------

/** True when Origin (or, failing that, Referer) names the same host the request arrived on. */
export function isSameOrigin(request: Request): boolean {
  const host = request.headers.get("host");
  if (host === null) return false;
  const candidate = request.headers.get("origin") ?? request.headers.get("referer");
  if (candidate === null) return false;
  try {
    return new URL(candidate).host === host;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// bot check
// ---------------------------------------------------------------------------

/**
 * BotID Basic. It throws outside a Vercel deployment, and a local `pnpm dev` must still work, so a
 * throw is treated as "allow". A false negative in dev is cheaper than a dev loop that cannot run.
 */
export async function isHuman(): Promise<boolean> {
  try {
    const { checkBotId } = await import("botid/server");
    const verdict = await checkBotId();
    return !verdict.isBot;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// misc
// ---------------------------------------------------------------------------

export function requiredEnv(...names: string[]): string[] {
  return names.filter((n) => {
    const v = process.env[n];
    return v === undefined || v === "";
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value);
}

export function trimmedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length === 0 || t.length > max ? null : t;
}

/** A honeypot field that a real form leaves empty. Bots fill everything. */
export function honeypotTripped(body: Record<string, unknown>): boolean {
  const v = body.website;
  return typeof v === "string" && v.trim().length > 0;
}

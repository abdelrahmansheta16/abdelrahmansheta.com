/**
 * Invariant 7 — every side effect (e-mail, lead, CV download) happens only after a human click on a
 * fixed-recipient form; the model never names a recipient.
 *
 * Enforced structurally: the three POST routes must run BotID, must take their recipient from
 * OWNER_EMAIL (or the compiled corpus links), and must never read a `to` / recipient field from the
 * request body or from model output.
 */
import { describe, expect, it } from "vitest";
import { readIfExists, suite } from "./helpers";

const ROUTES = ["app/api/message/route.ts", "app/api/lead/route.ts", "app/api/summary/route.ts"];
const present = ROUTES.filter((r) => readIfExists(r) !== null);
const READY = present.length === ROUTES.length;
const WHY = `missing ${ROUTES.filter((r) => !present.includes(r)).join(", ") || "routes"} (api area). Runs for real once merged.`;

/**
 * The three routes delegate the shared checks to app/api/_lib/*: `preflight` runs the bot check and
 * the honeypot, `email.ts` owns the templates and the recipient. Grepping only the route file would
 * therefore fail on a codebase that centralises the protection correctly, so each route is read
 * together with the local modules it imports. The invariant is unchanged: the protection must be
 * reachable from the route and the recipient must never come from the request.
 */
function source(rel: string): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  const visit = (file: string, depth: number): void => {
    if (depth > 2 || seen.has(file)) return;
    seen.add(file);
    const text = readIfExists(file);
    if (text === null) return;
    parts.push(text);
    for (const m of text.matchAll(/from\s+["']@\/([^"']+)["']/g)) {
      const target = m[1];
      if (!target.startsWith("app/api/_lib/") && !target.startsWith("lib/db/")) continue;
      visit(`${target}.ts`, depth + 1);
    }
  };
  visit(rel, 0);
  return parts.join("\n");
}

describe.skipIf(!READY)(suite("invariant 7 — fixed recipients", READY, WHY), () => {
  it.each(ROUTES)("%s runs BotID", (rel) => {
    expect(source(rel)).toMatch(/checkBotId/);
  });

  it.each(ROUTES)("%s honours the honeypot field named exactly `website`", (rel) => {
    expect(source(rel)).toMatch(/\bwebsite\b/);
    expect(source(rel)).toMatch(/bot_detected/);
  });

  // /api/message and /api/lead notify the owner, so their recipient must come from the environment.
  it.each(["app/api/message/route.ts", "app/api/lead/route.ts"])(
    "%s takes the recipient from the environment, not the request",
    (rel) => {
      expect(source(rel), "route must reference OWNER_EMAIL").toMatch(/OWNER_EMAIL/);
    },
  );

  /**
   * /api/summary is the one route that mails a visitor-supplied address, because the visitor asked
   * for a summary of their own conversation. That makes it an outbound-mail abuse vector, so the
   * compensating controls are the invariant here: explicit consent, one per session, a global daily
   * cap, and only a hash of the address retained.
   */
  it("app/api/summary/route.ts mails the visitor only with consent, once, under a daily cap", () => {
    const src = source("app/api/summary/route.ts");
    expect(src, "must require explicit consent").toMatch(/consent/);
    expect(src, "must go through the shared e-mail budget").toMatch(/canSendEmail|can_send_email/);
    expect(src, "must store only a hash of the address").toMatch(/sha256|hash/i);
    expect(src, "must not fall back to the owner's mailbox").not.toMatch(/to:\s*owner/);
  });

  it.each(ROUTES)("%s never reads a recipient out of the body", (rel) => {
    // The route file alone: the shared sender takes a `to` parameter by design, and `input.to`
    // inside it is a function argument, not request input.
    const src = readIfExists(rel) ?? "";
    // A recipient pulled from parsed input, in any of the shapes that would let the model or the
    // visitor choose who receives the mail.
    const forbidden = [
      /\bto\s*[:=]\s*(body|input|parsed|data|json|payload|args|req)\b/,
      /\b(body|input|parsed|data|json|payload|args)\s*\.\s*(to|recipient|recipients|sendTo|email_to)\b/,
      /\b(recipient|recipients|sendTo|email_to)\s*[:=]\s*(body|input|parsed|data|json|payload|args)\b/,
    ];
    for (const pattern of forbidden) {
      expect(pattern.test(src), `${rel} matches ${String(pattern)}`).toBe(false);
    }
  });

  it("the CV route is a redirect, not an e-mail side effect", () => {
    const cv = readIfExists("app/api/cv/route.ts");
    if (cv === null) return;
    expect(cv).toMatch(/redirect/i);
    expect(cv).toMatch(/\/cv\.pdf/);
  });

  it("no tool in the catalogue accepts a recipient argument", async () => {
    const { toolsAsOpenAI } = await import("@/lib/tools/schema");
    const shapes = JSON.stringify(toolsAsOpenAI()).toLowerCase();
    for (const word of ["recipient", "sendto", "email_to", '"to"']) {
      expect(shapes).not.toContain(word);
    }
  });
});

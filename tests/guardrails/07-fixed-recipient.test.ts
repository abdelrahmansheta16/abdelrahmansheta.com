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

function source(rel: string): string {
  return readIfExists(rel) ?? "";
}

describe.skipIf(!READY)(suite("invariant 7 — fixed recipients", READY, WHY), () => {
  it.each(ROUTES)("%s runs BotID", (rel) => {
    expect(source(rel)).toMatch(/checkBotId/);
  });

  it.each(ROUTES)("%s honours the honeypot field named exactly `website`", (rel) => {
    expect(source(rel)).toMatch(/\bwebsite\b/);
    expect(source(rel)).toMatch(/bot_detected/);
  });

  it.each(ROUTES)("%s takes the recipient from the environment, not the request", (rel) => {
    const src = source(rel);
    expect(src, "route must reference OWNER_EMAIL").toMatch(/OWNER_EMAIL/);
  });

  it.each(ROUTES)("%s never reads a recipient out of the body", (rel) => {
    const src = source(rel);
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

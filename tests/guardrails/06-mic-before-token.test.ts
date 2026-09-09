/**
 * Invariant 6 — no voice token is minted before a live microphone track exists in the browser.
 * A crawler that never gets a mic can therefore never burn a second of the daily budget.
 *
 * This is a source-order assertion on lib/voice/useVoice.ts: getUserMedia must be awaited before
 * the POST to /api/voice/session. Order in source is a proxy for order at runtime, so the hook is
 * also required to keep both calls in one function, in that order, with no early mint branch.
 */
import { describe, expect, it } from "vitest";
import { readIfExists, suite } from "./helpers";

const HOOK = "lib/voice/useVoice.ts";
const src = readIfExists(HOOK);
const READY = src !== null;
const WHY = `${HOOK} does not exist yet (voice area). Runs for real once merged.`;

describe.skipIf(!READY)(suite("invariant 6 — mic before token", READY, WHY), () => {
  const source = src ?? "";

  it("requests the microphone", () => {
    expect(source).toMatch(/getUserMedia\s*\(/);
  });

  it("mints the grant from /api/voice/session", () => {
    expect(source).toMatch(/["'`]\/api\/voice\/session["'`]/);
  });

  it("calls getUserMedia before the mint, in source order", () => {
    const micAt = source.search(/getUserMedia\s*\(/);
    const mintAt = source.search(/["'`]\/api\/voice\/session["'`]/);
    expect(micAt).toBeGreaterThanOrEqual(0);
    expect(mintAt).toBeGreaterThanOrEqual(0);
    expect(micAt, "getUserMedia must appear before the /api/voice/session fetch").toBeLessThan(
      mintAt,
    );
  });

  it("mentions the mic stream only once, so there is no second mint path", () => {
    const mints = source.match(/["'`]\/api\/voice\/session["'`]/g) ?? [];
    expect(mints.length, "more than one mint call site is a second chance to skip the mic").toBe(1);
  });

  it("sends the mint request with same-origin credentials for the pv cookie", () => {
    expect(source).toMatch(/credentials\s*:\s*["']same-origin["']/);
  });
});

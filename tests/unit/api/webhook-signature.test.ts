/** The ElevenLabs webhook signature scheme, pinned against a known secret. If this changes we must not
 *  silently start accepting unsigned post-call payloads. */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const SECRET = "wsec_test_secret";

function sign(rawBody: string, timestampSeconds: number, secret = SECRET): string {
  const mac = createHmac("sha256", secret).update(`${String(timestampSeconds)}.${rawBody}`).digest("hex");
  return `t=${String(timestampSeconds)},v0=${mac}`;
}

const webhooks = new ElevenLabsClient({ apiKey: "not-used" }).webhooks;

describe("ElevenLabs webhook verification", () => {
  const body = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: "conv_1" } });

  it("accepts a correctly signed, fresh payload", async () => {
    const now = Math.floor(Date.now() / 1000);
    const event = (await webhooks.constructEvent(body, sign(body, now), SECRET)) as { type: string };
    expect(event.type).toBe("post_call_transcription");
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(webhooks.constructEvent(body, sign(body, now, "wrong"), SECRET)).rejects.toThrow();
  });

  it("rejects a tampered body under a valid-looking signature", async () => {
    const now = Math.floor(Date.now() / 1000);
    const header = sign(body, now);
    await expect(webhooks.constructEvent(`${body} `, header, SECRET)).rejects.toThrow();
  });

  it("rejects a replayed payload older than the tolerance window", async () => {
    const old = Math.floor(Date.now() / 1000) - 40 * 60;
    await expect(webhooks.constructEvent(body, sign(body, old), SECRET)).rejects.toThrow();
  });

  it("rejects a missing signature header", async () => {
    await expect(webhooks.constructEvent(body, "", SECRET)).rejects.toThrow();
  });
});

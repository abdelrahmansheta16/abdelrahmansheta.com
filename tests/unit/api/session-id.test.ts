/**
 * The session id is what a visitor quotes to have their data erased — the privacy page says so, and
 * the console now renders it. Nothing covered the link between the server header and that value, so
 * these pin it: chatFetch records `x-session-id`, and once recorded it survives a response that
 * omits the header (only the first reply of a conversation carries one).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatFetch, getSessionId, setSessionId } from "@/lib/client/api";

function respondWith(headers: Record<string, string>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("ok", { headers })),
  );
}

// No reset hook: the id is module-level and deliberately sticky — setSessionId ignores null and ""
// precisely so a later response cannot erase a known id, which is the third test below. Each test
// therefore sets the value it asserts rather than relying on a clean slate.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("setSessionId", () => {
  it("records a real id", () => {
    setSessionId("11111111-2222-3333-4444-555555555555");
    expect(getSessionId()).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("ignores null and empty, so a later response cannot erase a known id", () => {
    setSessionId("abc-123");
    setSessionId(null);
    setSessionId("");
    expect(getSessionId()).toBe("abc-123");
  });
});

describe("chatFetch", () => {
  it("records the x-session-id header the server sends", async () => {
    respondWith({ "x-session-id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
    await chatFetch("/api/chat", { method: "POST" });
    expect(getSessionId()).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("keeps the id when a later response omits the header", async () => {
    respondWith({ "x-session-id": "first-id" });
    await chatFetch("/api/chat", { method: "POST" });
    respondWith({});
    await chatFetch("/api/chat", { method: "POST" });
    expect(getSessionId()).toBe("first-id");
  });

  it("sends same-origin credentials so the signed visitor cookie travels", async () => {
    const spy = vi.fn((_input: unknown, _init?: RequestInit) => Promise.resolve(new Response("ok")));
    vi.stubGlobal("fetch", spy);
    await chatFetch("/api/chat", { method: "POST" });
    expect(spy).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
});

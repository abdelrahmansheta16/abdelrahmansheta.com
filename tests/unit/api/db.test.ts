/** The database wrappers, against a hand-rolled fake PostgREST client. The point of these tests is the
 *  failure policy: voice and e-mail fail CLOSED, text chat fails OPEN. */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applySpendRules,
  canSendEmail,
  closeStaleSessions,
  monthToDateSpend,
  purgeExpired,
  reserveVoiceSession,
  settleVoiceSession,
} from "@/lib/db/budgets";
import {
  consumeRateSlot,
  isSessionFresh,
  toSessionFlags,
  utcMonthStartIso,
  type SessionRow,
} from "@/lib/db/queries";

type RpcResult = { data: unknown; error: unknown };

function rpcClient(handler: (fn: string, args: unknown) => RpcResult | Promise<RpcResult>): SupabaseClient {
  return { rpc: (fn: string, args: unknown) => Promise.resolve(handler(fn, args)) } as unknown as SupabaseClient;
}

const throwingClient = (): SupabaseClient =>
  ({
    rpc: () => {
      throw new Error("network down");
    },
  }) as unknown as SupabaseClient;

const session = (overrides: Partial<SessionRow> = {}): SessionRow => ({
  id: "s1",
  channel: "voice",
  started_at: new Date().toISOString(),
  ended_at: null,
  locale_initial: "en",
  lead_captured: false,
  summary_sent: false,
  message_left: false,
  guard_hits: 0,
  reserved_seconds: 240,
  duration_secs: null,
  flags: {},
  ...overrides,
});

describe("reserveVoiceSession", () => {
  it("passes the caps arguments straight through to SQL", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ session_id: "s1", reason: null }], error: null });
    const db = { rpc } as unknown as SupabaseClient;
    const result = await reserveVoiceSession(db, {
      ipHash: "iphash",
      visitorHash: "vhash",
      locale: "ar",
      reserveSeconds: 240,
    });
    expect(result).toEqual({ ok: true, sessionId: "s1" });
    expect(rpc).toHaveBeenCalledWith("reserve_voice_session", {
      p_ip_hash: "iphash",
      p_visitor_hash: "vhash",
      p_locale: "ar",
      p_reserve: 240,
    });
  });

  it("surfaces each rejection reason verbatim", async () => {
    for (const reason of ["killed", "capped_global", "capped_visitor"] as const) {
      const db = rpcClient(() => ({ data: [{ session_id: null, reason }], error: null }));
      await expect(reserveVoiceSession(db, { ipHash: "i", visitorHash: null, locale: "en" })).resolves.toEqual({
        ok: false,
        reason,
      });
    }
  });

  it("fails closed on an error, a throw, an empty result or an unknown reason", async () => {
    const cases: SupabaseClient[] = [
      rpcClient(() => ({ data: null, error: { message: "boom" } })),
      rpcClient(() => ({ data: [], error: null })),
      rpcClient(() => ({ data: [{ session_id: null, reason: "who_knows" }], error: null })),
      rpcClient(() => ({ data: [{ session_id: null, reason: null }], error: null })),
      throwingClient(),
    ];
    for (const db of cases) {
      await expect(reserveVoiceSession(db, { ipHash: "i", visitorHash: null, locale: "en" })).resolves.toEqual({
        ok: false,
        reason: "unavailable",
      });
    }
  });

  it("accepts a single row as well as an array", async () => {
    const db = rpcClient(() => ({ data: { session_id: "s2", reason: null }, error: null }));
    await expect(reserveVoiceSession(db, { ipHash: "i", visitorHash: null, locale: "en" })).resolves.toEqual({
      ok: true,
      sessionId: "s2",
    });
  });

  it("defaults the reservation to 240 seconds", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ session_id: "s", reason: null }], error: null });
    await reserveVoiceSession({ rpc } as unknown as SupabaseClient, {
      ipHash: "i",
      visitorHash: null,
      locale: "en",
    });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_reserve: 240 });
  });
});

describe("settleVoiceSession", () => {
  it("rounds and floors the duration before it reaches SQL", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 137, error: null });
    const returned = await settleVoiceSession({ rpc } as unknown as SupabaseClient, {
      sessionId: "s1",
      durationSec: -4.6,
      costUsd: 0.32,
    });
    expect(rpc).toHaveBeenCalledWith("settle_voice_session", {
      p_session_id: "s1",
      p_duration: 0,
      p_cost: 0.32,
    });
    expect(returned).toBe(137);
  });

  it("returns 0 on error or throw", async () => {
    await expect(
      settleVoiceSession(rpcClient(() => ({ data: null, error: { message: "x" } })), {
        sessionId: "s",
        durationSec: 10,
        costUsd: 0,
      }),
    ).resolves.toBe(0);
    await expect(
      settleVoiceSession(throwingClient(), { sessionId: "s", durationSec: 10, costUsd: 0 }),
    ).resolves.toBe(0);
  });
});

describe("canSendEmail", () => {
  it("only sends on an explicit true", async () => {
    await expect(canSendEmail(rpcClient(() => ({ data: true, error: null })), "message")).resolves.toBe(true);
    await expect(canSendEmail(rpcClient(() => ({ data: false, error: null })), "message")).resolves.toBe(false);
    await expect(canSendEmail(rpcClient(() => ({ data: null, error: null })), "message")).resolves.toBe(false);
  });

  it("fails closed when the database is unreachable — an uncounted e-mail is an uncapped one", async () => {
    await expect(canSendEmail(throwingClient(), "summary")).resolves.toBe(false);
    await expect(
      canSendEmail(rpcClient(() => ({ data: true, error: { message: "down" } })), "summary"),
    ).resolves.toBe(false);
  });
});

describe("housekeeping wrappers", () => {
  it("return counts, or 0 when the call fails", async () => {
    await expect(closeStaleSessions(rpcClient(() => ({ data: 3, error: null })))).resolves.toBe(3);
    await expect(purgeExpired(rpcClient(() => ({ data: 12, error: null })))).resolves.toBe(12);
    await expect(closeStaleSessions(throwingClient())).resolves.toBe(0);
    await expect(purgeExpired(rpcClient(() => ({ data: null, error: { message: "x" } })))).resolves.toBe(0);
  });
});

describe("applySpendRules", () => {
  it("passes month-to-date through and narrows the outcome", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "capped_540", error: null });
    await expect(applySpendRules({ rpc } as unknown as SupabaseClient, 27.4)).resolves.toBe("capped_540");
    expect(rpc).toHaveBeenCalledWith("apply_spend_rules", { p_month_to_date: 27.4 });
    await expect(applySpendRules(rpcClient(() => ({ data: "voice_off", error: null })), 31)).resolves.toBe("voice_off");
    await expect(applySpendRules(rpcClient(() => ({ data: "nonsense", error: null })), 1)).resolves.toBe("normal");
    await expect(applySpendRules(throwingClient(), 1)).resolves.toBe("normal");
  });
});

/**
 * The sum moved into Postgres (migration 0007). Selecting every row and reducing here truncated at
 * PostgREST's 1000-row cap: measured live, 1,500 one-cent rows summed to $10.00 instead of $15.00,
 * so the $27/$30 ceiling would never have fired.
 */
describe("monthToDateSpend", () => {
  it("asks Postgres for the total rather than summing rows here", async () => {
    const calls: string[] = [];
    const db = rpcClient((fn) => {
      calls.push(fn);
      return { data: 3.75, error: null };
    });
    await expect(monthToDateSpend(db)).resolves.toBeCloseTo(3.75, 5);
    expect(calls).toEqual(["month_to_date_spend"]);
  });

  it("copes with the numeric-as-string PostgREST returns for numeric columns", async () => {
    const db = rpcClient(() => ({ data: "12.34", error: null }));
    await expect(monthToDateSpend(db)).resolves.toBeCloseTo(12.34, 5);
  });

  /**
   * Null, not 0. Zero is a real value that tells apply_spend_rules to CLEAR both overrides, so
   * returning it on a failed read would lift a cap that was correctly in place.
   */
  it("returns null when the ledger cannot be read", async () => {
    const db = rpcClient(() => ({ data: null, error: { message: "x" } }));
    await expect(monthToDateSpend(db)).resolves.toBeNull();
  });

  it("returns null when the call throws", async () => {
    await expect(monthToDateSpend(throwingClient())).resolves.toBeNull();
  });

  it("returns null rather than NaN on an unparseable total", async () => {
    const db = rpcClient(() => ({ data: "not a number", error: null }));
    await expect(monthToDateSpend(db)).resolves.toBeNull();
  });
});

describe("utcMonthStartIso", () => {
  it("is the first instant of the UTC month", () => {
    expect(utcMonthStartIso(new Date("2026-09-17T22:30:00Z"))).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("consumeRateSlot", () => {
  function countingClient(count: number, insert = vi.fn()): SupabaseClient {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ gte: () => Promise.resolve({ count, error: null }) }),
          }),
        }),
        insert,
      }),
    } as unknown as SupabaseClient;
  }

  it("allows and records a request under the limit", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    await expect(consumeRateSlot(countingClient(59, insert), "chat", "iphash", 60)).resolves.toBe(true);
    expect(insert).toHaveBeenCalledWith({ kind: "chat", ip_hash: "iphash" });
  });

  it("refuses at the limit and does not record another", async () => {
    const insert = vi.fn();
    await expect(consumeRateSlot(countingClient(60, insert), "chat", "iphash", 60)).resolves.toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("fails OPEN with no database, because text chat must survive a paused project", async () => {
    await expect(consumeRateSlot(null, "chat", "iphash", 60)).resolves.toBe(true);
    const broken = {
      from: () => {
        throw new Error("down");
      },
    } as unknown as SupabaseClient;
    await expect(consumeRateSlot(broken, "chat", "iphash", 60)).resolves.toBe(true);
  });
});

describe("session helpers", () => {
  it("treats a session older than 24 hours as expired", () => {
    expect(isSessionFresh(session())).toBe(true);
    expect(isSessionFresh(session({ started_at: new Date(Date.now() - 25 * 3600_000).toISOString() }))).toBe(false);
    expect(isSessionFresh(session({ started_at: "not a date" }))).toBe(false);
  });

  it("maps a row onto SessionFlags, and a missing row onto safe defaults", () => {
    expect(toSessionFlags(session({ lead_captured: true, locale_initial: "ar" }), "voice")).toMatchObject({
      sessionId: "s1",
      langHint: "ar",
      leadCaptured: true,
      greetingPlayed: true,
    });
    expect(toSessionFlags(null, "text")).toMatchObject({ sessionId: null, langHint: "en", guardHits: 0 });
  });

  it("reads greeting_played=false out of the flags blob (invariant 10)", () => {
    expect(toSessionFlags(session({ flags: { greeting_played: false } }), "voice").greetingPlayed).toBe(false);
  });
});

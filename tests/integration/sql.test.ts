/**
 * The cap functions, against a real Postgres. These are the tests that actually prove invariant 5 and
 * the $27/$30 spend rules, because those rules live in SQL and cannot be exercised by a fake client.
 *
 * They shell out to `psql` rather than pulling in a Postgres driver, and they SKIP cleanly when
 * DATABASE_URL is unset or psql is missing — which is the normal state in CI on a fork. See
 * supabase/README.md for the two-line docker recipe.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function hasPsql(): boolean {
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const ENABLED = DATABASE_URL !== "" && hasPsql();

function psql(sql: string): string {
  return execFileSync("psql", [DATABASE_URL, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

function value(sql: string): string {
  return psql(sql).split("\n").pop()?.trim() ?? "";
}

const RESET = `
  truncate table public.transcript_turns, public.guard_events, public.llm_calls, public.spend_events,
                 public.leads, public.messages_in, public.summaries_out, public.probe_events,
                 public.rate_events, public.sessions restart identity cascade;
  delete from public.daily_budgets;
  update public.settings
     set kill_switch = false, voice_seconds_cap_override = null, voice_off_until = null where id = 1;
`;

describe.skipIf(!ENABLED)("SQL cap functions", () => {
  beforeAll(() => {
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
      psql(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    }
  });

  beforeEach(() => {
    psql(RESET);
  });

  describe("reserve_voice_session", () => {
    it("creates a session and books the reservation against today's budget", () => {
      const id = value("select session_id from public.reserve_voice_session('ip-a', 'v-a', 'en', 240);");
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(value("select voice_seconds_reserved from public.daily_budgets;")).toBe("240");
      expect(value(`select channel from public.sessions where id = '${id}';`)).toBe("voice");
    });

    it("returns capped_visitor on the third session from the same ip_hash in one day", () => {
      psql("select public.reserve_voice_session('ip-b', null, 'en', 240);");
      psql("select public.reserve_voice_session('ip-b', null, 'en', 240);");
      const reason = value("select reason from public.reserve_voice_session('ip-b', null, 'en', 240);");
      expect(reason).toBe("capped_visitor");
    });

    it("matches on visitor_hash too, so clearing an IP is not enough", () => {
      psql("select public.reserve_voice_session('ip-1', 'same-cookie', 'en', 240);");
      psql("select public.reserve_voice_session('ip-2', 'same-cookie', 'en', 240);");
      expect(value("select reason from public.reserve_voice_session('ip-3', 'same-cookie', 'en', 240);")).toBe(
        "capped_visitor",
      );
    });

    it("returns capped_global once the day's 720 seconds are booked", () => {
      psql("insert into public.daily_budgets (day, voice_seconds_reserved) values ((now() at time zone 'utc')::date, 600);");
      expect(value("select reason from public.reserve_voice_session('ip-c', null, 'en', 240);")).toBe("capped_global");
      // 120 s still fits inside the 720 s cap.
      expect(value("select reason from public.reserve_voice_session('ip-c', null, 'en', 120);")).toBe("");
    });

    it("honours the 540 s override that the $27 rule sets", () => {
      psql("insert into public.daily_budgets (day, voice_seconds_reserved) values ((now() at time zone 'utc')::date, 480);");
      psql("update public.settings set voice_seconds_cap_override = 540 where id = 1;");
      expect(value("select reason from public.reserve_voice_session('ip-d', null, 'en', 240);")).toBe("capped_global");
    });

    it("returns killed for the kill switch and for voice_off_until", () => {
      psql("update public.settings set kill_switch = true where id = 1;");
      expect(value("select reason from public.reserve_voice_session('ip-e', null, 'en', 240);")).toBe("killed");

      psql("update public.settings set kill_switch = false, voice_off_until = now() + interval '1 day' where id = 1;");
      expect(value("select reason from public.reserve_voice_session('ip-e', null, 'en', 240);")).toBe("killed");
    });

    it("does not create a session row when it rejects", () => {
      psql("update public.settings set kill_switch = true where id = 1;");
      psql("select public.reserve_voice_session('ip-f', null, 'en', 240);");
      expect(value("select count(*) from public.sessions;")).toBe("0");
    });
  });

  describe("settle_voice_session", () => {
    it("hands back the unused seconds and records the duration", () => {
      const id = value("select session_id from public.reserve_voice_session('ip-g', null, 'en', 240);");
      expect(value(`select public.settle_voice_session('${id}', 90, 0.12);`)).toBe("150");
      expect(value("select voice_seconds_reserved from public.daily_budgets;")).toBe("90");
      expect(value("select voice_seconds_used from public.daily_budgets;")).toBe("90");
      expect(value(`select duration_secs from public.sessions where id = '${id}';`)).toBe("90");
    });

    it("is idempotent, so a replayed webhook changes nothing", () => {
      const id = value("select session_id from public.reserve_voice_session('ip-h', null, 'en', 240);");
      psql(`select public.settle_voice_session('${id}', 90, 0.12);`);
      expect(value(`select public.settle_voice_session('${id}', 90, 0.12);`)).toBe("0");
      expect(value("select voice_seconds_used from public.daily_budgets;")).toBe("90");
    });

    it("returns 0 for an unknown session", () => {
      expect(value("select public.settle_voice_session(gen_random_uuid(), 60, 0);")).toBe("0");
    });
  });

  describe("can_send_email", () => {
    it("consumes the daily budget and refuses past the cap", () => {
      psql("insert into public.daily_budgets (day, emails_sent, emails_cap) values ((now() at time zone 'utc')::date, 19, 20);");
      expect(value("select public.can_send_email('message');")).toBe("t");
      expect(value("select public.can_send_email('message');")).toBe("f");
    });

    it("refuses an unknown kind and refuses while the kill switch is on", () => {
      expect(value("select public.can_send_email('spam');")).toBe("f");
      psql("update public.settings set kill_switch = true where id = 1;");
      expect(value("select public.can_send_email('message');")).toBe("f");
    });
  });

  describe("apply_spend_rules", () => {
    it("drops the cap to 540 at $27 and turns voice off at $30", () => {
      expect(value("select public.apply_spend_rules(26.99);")).toBe("normal");
      expect(value("select coalesce(voice_seconds_cap_override::text, 'null') from public.settings;")).toBe("null");

      expect(value("select public.apply_spend_rules(27.00);")).toBe("capped_540");
      expect(value("select voice_seconds_cap_override from public.settings;")).toBe("540");
      expect(value("select coalesce(voice_off_until::text, 'null') from public.settings;")).toBe("null");

      expect(value("select public.apply_spend_rules(30.01);")).toBe("voice_off");
      expect(value("select voice_off_until > now() from public.settings;")).toBe("t");
    });

    it("clears both overrides again below $27, which is also the monthly reset", () => {
      psql("select public.apply_spend_rules(31);");
      expect(value("select public.apply_spend_rules(0);")).toBe("normal");
      expect(value("select coalesce(voice_off_until::text, 'null') from public.settings;")).toBe("null");
      expect(value("select coalesce(voice_seconds_cap_override::text, 'null') from public.settings;")).toBe("null");
    });
  });

  describe("close_stale_sessions", () => {
    it("closes voice sessions with no webhook after six minutes and refunds the reservation", () => {
      const id = value("select session_id from public.reserve_voice_session('ip-i', null, 'en', 240);");
      psql(`update public.sessions set started_at = now() - interval '10 minutes' where id = '${id}';`);
      expect(value("select public.close_stale_sessions();")).toBe("1");
      expect(value(`select ended_reason from public.sessions where id = '${id}';`)).toBe("stale");
      expect(value("select voice_seconds_reserved from public.daily_budgets;")).toBe("0");
      expect(value("select public.close_stale_sessions();")).toBe("0");
    });

    it("leaves a fresh session alone", () => {
      psql("select public.reserve_voice_session('ip-j', null, 'en', 240);");
      expect(value("select public.close_stale_sessions();")).toBe("0");
    });
  });

  describe("purge_expired", () => {
    it("deletes rows past their generated delete_after and keeps current ones", () => {
      psql(`
        insert into public.sessions (channel, ip_hash, started_at)
        values ('text', 'ip-old', now() - interval '31 days'), ('text', 'ip-new', now());
        insert into public.probe_events (ua_class, outcome, created_at)
        values ('LinkedInApp', 'denied', now() - interval '91 days');
      `);
      expect(Number(value("select public.purge_expired();"))).toBeGreaterThanOrEqual(2);
      expect(value("select count(*) from public.sessions;")).toBe("1");
      expect(value("select count(*) from public.probe_events;")).toBe("0");
    });
  });

  describe("schema guarantees", () => {
    it("enables RLS on every table and defines no policies at all", () => {
      expect(value("select count(*) from pg_tables where schemaname = 'public' and rowsecurity = false;")).toBe("0");
      expect(value("select count(*) from pg_policies where schemaname = 'public';")).toBe("0");
    });

    it("refuses a second lead, message or summary for the same session", () => {
      const id = value("select session_id from public.reserve_voice_session('ip-k', null, 'en', 240);");
      psql(`insert into public.messages_in (session_id, name, email, body) values ('${id}', 'a', 'a@b.co', 'hi');`);
      expect(() =>
        psql(`insert into public.messages_in (session_id, name, email, body) values ('${id}', 'a', 'a@b.co', 'hi');`),
      ).toThrow();
    });

    it("keeps elevenlabs_conversation_id unique", () => {
      psql("insert into public.sessions (channel, ip_hash, elevenlabs_conversation_id) values ('voice','ip','conv_1');");
      expect(() =>
        psql("insert into public.sessions (channel, ip_hash, elevenlabs_conversation_id) values ('voice','ip2','conv_1');"),
      ).toThrow();
    });
  });
});

describe.skipIf(ENABLED)("SQL cap functions (skipped)", () => {
  it("skips without DATABASE_URL and psql — see supabase/README.md", () => {
    expect(ENABLED).toBe(false);
  });
});

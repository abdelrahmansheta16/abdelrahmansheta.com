/**
 * Invariant 5 — voice minutes are capped in Postgres, counted from rows: 240 s/session,
 * 2 sessions/visitor/day, 720 s/day global, plus a kill switch. The caps must live in SQL, not in
 * a TypeScript constant, so this test reads supabase/migrations directly.
 *
 * It also enforces the append-only rule: docs/MIGRATIONS.lock pins the sha256 of every migration
 * that has already been applied, and this test fails when one of them changes.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, dirExists, readIfExists, repoPath, suite } from "./helpers";

const MIGRATIONS_DIR = "supabase/migrations";
const MIGRATIONS_READY = dirExists(MIGRATIONS_DIR);
const WHY = `${MIGRATIONS_DIR}/ does not exist yet (database area). Runs for real once merged.`;

function migrationSql(): string {
  const dir = repoPath(MIGRATIONS_DIR);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
}

describe.skipIf(!MIGRATIONS_READY)(
  suite("invariant 5 — voice caps live in SQL", MIGRATIONS_READY, WHY),
  () => {
    it("defines reserve_voice_session", () => {
      expect(migrationSql()).toMatch(
        /create\s+(or\s+replace\s+)?function\s+[\w.]*reserve_voice_session/i,
      );
    });

    it("encodes the 240 s per-session reservation", () => {
      expect(migrationSql()).toMatch(/\b240\b/);
    });

    it("encodes the 2 sessions per visitor per day rule", () => {
      const sql = migrationSql();
      expect(sql).toMatch(/visitor_hash/i);
      expect(sql).toMatch(/ip_hash/i);
      expect(sql).toMatch(/>=\s*2|\b2\b/);
      expect(sql).toMatch(/capped_visitor/i);
    });

    it("encodes the 720 s global daily cap and the kill switch", () => {
      const sql = migrationSql();
      expect(sql).toMatch(/\b720\b/);
      expect(sql).toMatch(/capped_global/i);
      expect(sql).toMatch(/kill_switch/i);
      expect(sql).toMatch(/\bkilled\b/i);
    });

    it("takes a row lock so two mints cannot both fit under the cap", () => {
      expect(migrationSql()).toMatch(/for\s+update/i);
    });

    /**
     * A cap that anyone on the internet can call is not a cap. Postgres grants EXECUTE on a new
     * function to PUBLIC by default, and PostgREST exposes every function in `public` at
     * /rest/v1/rpc/<name> to the anonymous key. Revoking from `anon` and `authenticated` is a
     * no-op against that default — it has to be revoked from PUBLIC itself. This was live for a
     * few minutes; the probe that found it burned real budget seconds.
     */
    it("revokes EXECUTE from PUBLIC, including on functions added later", () => {
      const sql = migrationSql().toLowerCase().replace(/\s+/g, " ");
      expect(sql, "revoke execute on all functions in schema public from public").toMatch(
        /revoke execute on all functions in schema public from public/,
      );
      expect(sql, "future functions must not be granted to PUBLIC either").toMatch(
        /alter default privileges in schema public revoke execute on functions from public/,
      );
    });

    it("revokes EXECUTE from PUBLIC on every security definer function by name", () => {
      const sql = migrationSql();
      const defined = [
        ...sql.matchAll(
          /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(([^)]*)\)[\s\S]*?security\s+definer/gi,
        ),
      ].map((m) => m[1].toLowerCase());

      const flat = sql.toLowerCase().replace(/\s+/g, " ");
      const unrevoked = [...new Set(defined)].filter(
        (name) => !flat.includes(`revoke execute on function public.${name}(`),
      );

      expect(defined.length, "expected security definer functions in the migrations").toBeGreaterThan(
        0,
      );
      expect(unrevoked, "add an explicit revoke ... from public for these").toEqual([]);
    });
  },
);

describe("invariant 5 — migrations are append-only", () => {
  const lock = readIfExists("docs/MIGRATIONS.lock");

  it("ships docs/MIGRATIONS.lock", () => {
    expect(lock).not.toBeNull();
  });

  it("every locked migration still exists with the same sha256", () => {
    const entries = (lock ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"))
      .map((l) => {
        const [hash, ...rest] = l.split(/\s+/);
        return { hash, file: rest.join(" ") };
      });

    const drift: string[] = [];
    for (const entry of entries) {
      const abs = path.join(REPO_ROOT, entry.file);
      if (!existsSync(abs)) {
        drift.push(`${entry.file}: listed in the lock but missing — migrations are append-only`);
        continue;
      }
      const actual = createHash("sha256").update(readFileSync(abs)).digest("hex");
      if (actual !== entry.hash) {
        drift.push(`${entry.file}: sha256 changed (${entry.hash} -> ${actual}) — append instead`);
      }
    }
    expect(drift).toEqual([]);
  });

  it("lists every migration that exists on disk", () => {
    if (!MIGRATIONS_READY) return;
    const listed = new Set(
      (lock ?? "")
        .split("\n")
        .filter((l) => l.trim() && !l.trim().startsWith("#"))
        .map((l) => l.trim().split(/\s+/).slice(1).join(" ")),
    );
    const onDisk = readdirSync(repoPath(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => `${MIGRATIONS_DIR}/${f}`);
    const missing = onDisk.filter((f) => !listed.has(f));
    expect(missing, "regenerate docs/MIGRATIONS.lock — see the header in that file").toEqual([]);
  });
});

/**
 * Retention only means something if a row can actually reach its delete_after.
 *
 * leads.delete_after is created_at + 180 days, but the row also had
 * `references sessions(id) on delete cascade` while sessions expire at 30 days — so purge_expired()
 * destroyed every lead 150 days early, and because it went through a cascade the purge counter did
 * not even attribute the rows to leads. A recruiter's contact details are the actual output of this
 * system; losing them silently is the worst kind of data loss.
 */
describe.skipIf(!MIGRATIONS_READY)(
  suite("retention — a row cannot outlive its parent by cascade", MIGRATIONS_READY, WHY),
  () => {
    /** `create table public.<name> ( ... );` bodies from the migrations, latest definition wins. */
    function tableBodies(): Map<string, string> {
      const out = new Map<string, string>();
      const re = /create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g;
      for (const m of migrationSql().matchAll(re)) out.set(m[1], m[2]);
      return out;
    }

    function retentionDays(body: string): number | null {
      const m = /delete_after[^\n]*interval '(\d+) days'/.exec(body);
      return m ? Number(m[1]) : null;
    }

    it("no table outlives sessions while cascading from it", () => {
      const bodies = tableBodies();
      const sessionDays = retentionDays(bodies.get("sessions") ?? "");
      expect(sessionDays, "sessions must declare a retention").not.toBeNull();

      const sql = migrationSql();
      const offenders: string[] = [];
      for (const [name, body] of bodies) {
        if (name === "sessions") continue;
        const days = retentionDays(body);
        if (days === null || sessionDays === null || days <= sessionDays) continue;
        if (!/references public\.sessions \(id\)/.test(body)) continue;

        // The original definition may be corrected by a later ALTER, so check the final state.
        const altered = new RegExp(
          `alter table public\\.${name}[\\s\\S]*?references public\\.sessions \\(id\\) on delete set null`,
          "i",
        ).test(sql);
        const cascadesInline = /references public\.sessions \(id\) on delete cascade/i.test(body);
        if (cascadesInline && !altered) {
          offenders.push(`${name} keeps ${days}d but cascades from sessions (${sessionDays}d)`);
        }
      }
      expect(offenders, "use `on delete set null`, as spend_events and llm_calls do").toEqual([]);
    });
  },
);

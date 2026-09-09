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
      expect(migrationSql()).toMatch(/create\s+(or\s+replace\s+)?function\s+[\w.]*reserve_voice_session/i);
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

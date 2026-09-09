# Database

Plain SQL, no ORM. Migrations are **append-only** and numbered: once `0003_cron.sql` has been applied
anywhere, it is never edited — add `0004_…` instead.

| File | What it adds |
|---|---|
| `0001_init.sql` | every table, the generated `delete_after` retention columns, the indexes, RLS on with no policies |
| `0002_functions.sql` | `reserve_voice_session`, `settle_voice_session`, `can_send_email`, `close_stale_sessions`, `purge_expired`, `apply_spend_rules` |
| `0003_cron.sql` | `pg_cron` schedules, guarded so the file is a no-op where the extension is absent |

## Applying them

Against the Supabase project (preferred):

```bash
supabase link --project-ref <ref>
supabase db push            # applies everything under supabase/migrations in order
```

Against any Postgres by URL (local, a Supabase branch, Neon):

```bash
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```

The service role key is the only credential the app uses. RLS is enabled on every table with **no
policies at all**, so the `anon` and `authenticated` roles can read nothing even if the anon key leaks.

## Running the integration tests

`tests/integration/*.test.ts` exercise the SQL functions for real. They shell out to `psql`, so there is
no Postgres driver in `package.json`. They **skip cleanly** when `DATABASE_URL` is unset or `psql` is not
on `PATH` — which is what happens in CI on a fork.

```bash
docker run --rm -d --name portfolio-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17
export DATABASE_URL='postgres://postgres:postgres@localhost:55432/postgres'
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
pnpm vitest run tests/integration
docker rm -f portfolio-pg
```

Each test creates its own schema-level fixtures inside a transaction that it rolls back, so the same
database can be reused between runs.

## Things worth knowing

- `reserve_voice_session` takes `SELECT … FOR UPDATE` on today's `daily_budgets` row **first**, so two
  simultaneous mints cannot both squeeze past the 720 s/day cap.
- `settle_voice_session` only settles a session whose `duration_secs` is still null; a replayed
  ElevenLabs webhook therefore returns 0 and changes nothing.
- `can_send_email` *consumes* a unit of the daily budget when it returns true. Call it once, immediately
  before sending, and never in a loop.
- `apply_spend_rules` clears the overrides below $27, which is also how the caps reset on the 1st.
- All day arithmetic is UTC (`(now() at time zone 'utc')::date`) so the caps do not drift with the
  server timezone.

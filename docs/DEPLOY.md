# Going live

The Vercel project exists and is linked to this repo, so every push to `main` deploys. Two things are
dashboard-only, because the Vercel API token used here cannot set environment variables.

Project: `sheta-ai` · Team: `abdelrahmansheta16's projects` · Region: `fra1`
URL once green: `https://sheta-ai-abdelrahmansheta16s-projects.vercel.app`

Deployment protection is set to **previews only**, so production is publicly reachable while preview
builds stay behind Vercel Authentication. New Vercel projects default to protecting everything except
custom domains, which would have left the site invisible to recruiters.

## 1. A read-only token for the private corpus

The site's content lives in the private `portfolio-corpus` repo and is compiled at build time. It is
never committed here — the compiled prompt carries the whole persona and this repo is public.

Create a **fine-grained personal access token** on GitHub: only the `abdelrahmansheta16/portfolio-corpus`
repository, `Contents: Read-only`, no other permission. That value is `CORPUS_REPO_TOKEN`.

Without it a production build **fails on purpose**. It used to fall back to the example person, which
meant a green build could publish a site about "Nour Example" under your name with nothing to signal it.

## 2. Environment variables

Project → Settings → Environment Variables, Production **and** Preview, every row Sensitive. The UI
accepts a whole `.env` block pasted at once.

`pnpm env:vercel` writes a ready-to-paste `.env.vercel` (gitignored): it copies the LLM slots from
your `.env.local`, generates the four secrets fresh, fills in the values that are already known, and
leaves exactly two blanks for you.

| Variable | Notes |
|---|---|
| `CORPUS_REPO_TOKEN` | from step 1 — the build fails without it, by design |
| `SUPABASE_SERVICE_ROLE_KEY` | the **secret** key, not a publishable one — see step 3 |
| `SUPABASE_URL` | `https://zpppersjjcoefcemidmw.supabase.co` |
| `LLM_PRIMARY_API_KEY` / `_BASE_URL` / `_MODEL` | DeepSeek V4 Flash on Alibaba Model Studio (Singapore) |
| `LLM_FALLBACK_API_KEY` / `_BASE_URL` / `_MODEL` | Qwen, same account and key |
| `VISITOR_COOKIE_SECRET`, `IP_HASH_SALT`, `CRON_SECRET`, `LLM_ADAPTER_SECRET` | `openssl rand -hex 24` each — do not reuse the local ones |
| `OWNER_EMAIL` | where "leave a message" is delivered |
| `NEXT_PUBLIC_VOICE_ENABLED` | `0` until the voice clone is done |

Optional: `RESEND_API_KEY` and `RESEND_FROM`. Without them a visitor's message is still *stored*, it
just is not mailed to you, and the daily digest is skipped. Nothing errors.

**Do not set these on Vercel**, whatever `.env.example` suggests:

- `KNOWLEDGE_DIR` — local dev only. Setting it would break the corpus fetch at build time.
- `ALLOW_EXAMPLE_CORPUS` — it exists so a fork can demo itself; here it would publish the example
  person's content under your name.
- `SITE_URL` — read only by `scripts/push-agent-config.ts`. The canonical URLs the site renders come
  from the corpus, not from this variable. (An earlier version of this table listed it as required.)
- `ELEVENLABS_*` — voice is off, and each of those paths degrades cleanly.

Text chat works without the database. Rate limiting, transcripts and the spend ledger do not, so the
site runs but you cannot see what recruiters asked.

## 3. The database

Done. Project **Portfolio**, ref `zpppersjjcoefcemidmw`, in the personal org "Resume interpreter" on
the Free plan, `eu-west-1`, Postgres 17.6. Migrations `0001`–`0005` are applied, `pg_cron` is enabled
and three jobs are scheduled, and the caps were exercised against the live database rather than
assumed: 11 assertions covering the per-visitor cap, the 720 s global cap, the kill switch, settle,
the spend-tightening rules and the e-mail budget.

The only thing left is the credential. Copy the `service_role` / secret key from
[Settings → API keys](https://supabase.com/dashboard/project/zpppersjjcoefcemidmw/settings/api-keys).
The connector deliberately exposes publishable keys only, so this one cannot be fetched for you.

### One thing to know about that database

Postgres grants `EXECUTE` on every new function to `PUBLIC`, and PostgREST publishes everything in
schema `public` at `/rest/v1/rpc/<name>` to the anonymous key. So the cap functions were briefly
callable by anyone with the URL — a single unauthenticated request could book 240 seconds of the
daily 720. Migration `0005` revokes `EXECUTE` from `PUBLIC` on each function and on the schema, and
sets default privileges so functions added later are not granted either. All seven now return
HTTP 401 to the anonymous key, verified from outside. `tests/guardrails/05-voice-caps.test.ts`
fails if a future migration adds a `security definer` function without the matching revoke.

## 4. Then

Redeploy from the Vercel dashboard, or push any commit. Check `/api/health` returns a `corpus_version`,
and that `/` is reachable in a private window with no login prompt.

## 5. When the real domain is attached

`robots.txt` disallows everything until the deployment's own production host matches the canonical
domain in the corpus, so the throwaway `*.vercel.app` address never becomes the result that
`abdelrahmansheta.com` later has to displace. Attach the domain in Vercel, **redeploy** — the rule is
evaluated at build time — and `/robots.txt` starts allowing crawlers on its own.

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

Project → Settings → Environment Variables. Mark every one Sensitive. Values for the LLM slots are in
your local `.env.local`.

| Variable | Notes |
|---|---|
| `CORPUS_REPO_TOKEN` | from step 1 — the build fails without it |
| `LLM_PRIMARY_API_KEY` / `_BASE_URL` / `_MODEL` | DeepSeek V4 Flash on Alibaba Model Studio (Singapore) |
| `LLM_FALLBACK_API_KEY` / `_BASE_URL` / `_MODEL` | Qwen, same account and key |
| `OWNER_EMAIL` | where "leave a message" is delivered |
| `VISITOR_COOKIE_SECRET`, `IP_HASH_SALT`, `CRON_SECRET` | generate fresh with `openssl rand -hex 24` — do not reuse the local ones |
| `SITE_URL` | `https://sheta-ai-abdelrahmansheta16s-projects.vercel.app` for now |
| `NEXT_PUBLIC_VOICE_ENABLED` | `0` until the voice clone is done |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | after step 3 |

Text chat works without the database. Rate limiting, transcripts and the spend ledger do not, so the
site runs but you cannot see what recruiters asked.

## 3. The database

Create a **personal organization on the Free plan** in the Supabase dashboard — a project in the Cravit
org costs $10/month because that org is Pro, and this is personal infrastructure. Say when it exists
and the project, migrations and cap functions can be created through the connector.

## 4. Then

Redeploy from the Vercel dashboard, or push any commit. Check `/api/health` returns a `corpus_version`,
and that `/` is reachable in a private window with no login prompt.

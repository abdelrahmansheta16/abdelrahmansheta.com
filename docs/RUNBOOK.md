# Runbook

Operating the site: environment, deploy, the kill switch, secret rotation, and what to do when a
cap or a spend rule fires. Written for one person at 2 a.m.

---

## 1. Environment variables

Every variable lives in Vercel project settings and in `.env.local` for development. `.env.example`
is the canonical list and `tests/guardrails/11-repo-hygiene.test.ts` fails if the code reads
something the example does not document.

| Variable                                                     | Where               | What breaks without it                                          |
| ------------------------------------------------------------ | ------------------- | --------------------------------------------------------------- |
| `KNOWLEDGE_DIR`                                              | build               | Local corpus path. CI/Vercel use `CORPUS_REPO_TOKEN` instead.   |
| `CORPUS_REPO_TOKEN`                                          | build               | Fine-grained read-only PAT for `portfolio-corpus`. Build fails. |
| `LLM_PRIMARY_API_KEY` / `_BASE_URL` / `_MODEL`               | server              | Primary model. DeepSeek V4 Flash on Alibaba Model Studio (Singapore). |
| `LLM_FALLBACK_API_KEY` / `_BASE_URL` / `_MODEL`              | server              | Backup model, used automatically when the primary fails. Qwen, same account. |
| `ANTHROPIC_API_KEY`                                          | server              | Haiku failover. Nothing covers this one.                        |
| `ELEVENLABS_API_KEY`                                         | server              | Voice token minting. Voice is off; text still works.            |
| `ELEVENLABS_AGENT_ID`                                        | server              | Which agent to mint against.                                    |
| `ELEVENLABS_VOICE_ID`                                        | scripts             | `pnpm push:agent` refuses to push without it.                   |
| `ELEVENLABS_WEBHOOK_SECRET`                                  | server              | Post-call webhook HMAC. Sessions never settle.                  |
| `LLM_ADAPTER_SECRET`                                         | server + ElevenLabs | `X-Agent-Key` on `/api/llm`. Voice turns 401.                   |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`                 | server              | All caps and logging. Mint fails closed.                        |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build               | `/admin` OTP login.                                             |
| `RESEND_API_KEY`                                             | server              | Messages, lead notifications, summaries, alerts.                |
| `OWNER_EMAIL`                                                | server              | The **only** recipient of any outbound mail.                    |
| `VISITOR_COOKIE_SECRET`                                      | server              | Signs the `pv` cookie. Per-visitor cap degrades to per-IP.      |
| `IP_HASH_SALT`                                               | server              | Daily-salted pseudonymisation. Never rotate mid-day.            |
| `CAL_URL`                                                    | build               | Book-a-call modal.                                              |
| `SITE_URL`                                                   | scripts             | Origin baked into the agent's custom-LLM URL.                   |
| `CRON_SECRET`                                                | server              | Guards `/api/cron/*`. Purge and spend digest stop.              |

Nothing secret is ever logged. If you add a `console.log` around a provider call, log the _shape_,
never the value.

---

## 2. Deploy

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm guard    # all four, in that order
git push                                                   # Vercel builds from main
```

`pnpm guard` is the gate. A red guardrail is never merged around; if an invariant is genuinely
wrong, change `CLAUDE.md` and the test in the same PR, deliberately.

The build compiles the corpus first (`pnpm build` = `compile:corpus && next build`). A corpus lint
hit fails the build before anything deploys — that is intended.

**Agent config** is pushed separately and never edited in the ElevenLabs dashboard:

```bash
pnpm push:agent --dry-run          # read the JSON first
pnpm push:agent --update $ELEVENLABS_AGENT_ID
pnpm push:agent --verify $ELEVENLABS_AGENT_ID   # reads the live agent back, exits 1 on drift
```

**CV** is generated, not committed:

```bash
pnpm build:cv    # writes public/cv.pdf from the compiled corpus
```

**Migrations** are append-only. Add a new numbered file, apply it, then regenerate
`docs/MIGRATIONS.lock` using the command in that file's header. Editing an applied migration fails
`pnpm guard`.

---

## 3. The kill switch

One row, no deploy needed. It takes effect on the next mint, within seconds.

```sql
update settings set kill_switch = true;
```

Voice stops immediately: `/api/voice/session` returns `429 {"ok":false,"reason":"killed"}`, the UI
shows the capped state, and **text chat keeps working in the same persona**. In-flight calls are
capped by the agent's own `max_duration_seconds` of 240, so the longest tail is four minutes.

To restore: set it back to `false`. Nothing else needs restarting.

Reach for it when: the ElevenLabs bill jumps unexpectedly, a clone-abuse report arrives, a
guard bug is letting something through, or you are asleep and something looks wrong.

---

## 4. Rotating secrets

Rotate in this order so there is no window where the old value still works but the new one does not.

**`LLM_ADAPTER_SECRET`** — the adapter must accept both values briefly:

1. Generate the new value.
2. Set it in the ElevenLabs workspace as the `LLM_ADAPTER_SECRET` env-var label.
3. `pnpm push:agent --update <id>` (the config references the label, not the value).
4. Update the Vercel env var and redeploy.
5. `pnpm push:agent --verify <id>` and make one live voice turn.

**`ELEVENLABS_API_KEY`** — create the new restricted key (Agents + TTS only), set it in Vercel,
redeploy, then delete the old key. Voice minting is the only consumer.

**`SUPABASE_SERVICE_ROLE_KEY`** — rotate in Supabase, update Vercel, redeploy. Between the two the
mint route fails closed (voice off) and `/api/chat` keeps working; that is by design.

**`IP_HASH_SALT`** — rotating this re-pseudonymises everything. Old `ip_hash` values stop matching,
so per-visitor caps reset for the day. Do it at the start of a UTC day, never mid-day.

**`CORPUS_REPO_TOKEN`** — rotate the fine-grained PAT, update Vercel and the GitHub Actions secret.
CI itself compiles `knowledge.example` and does not need it.

After any rotation: check `/api/health` returns `{ok: true}` with the expected `corpus_version`,
then do one text turn and one voice turn.

---

## 5. When a cap fires

All caps are counted from Postgres rows, never from process memory, so restarting anything changes
nothing.

### Per-session, 240 s

Normal. The call ends, the UI says so, the session settles from the post-call webhook. No action.

### Per-visitor, 2 sessions/day → `capped_visitor` (HTTP 429)

Working as designed. Do not raise it for an individual — that is what the text console is for. If a
recruiter you actually want to reach hits it, e-mail them; do not hand-edit the table.

### Global, 720 s/day → `capped_global` (HTTP 429)

The day's voice budget is spent. The honest copy already tells the visitor so, and text chat keeps
working. Check `/admin` → Probes and the mint log first: a headless browser that passes BotID **can**
burn the daily twelve minutes, and that is a known accepted residual.

If the pattern looks automated:

1. Turn on the Cloudflare **Turnstile** widget (the site key already exists, the widget is off).
2. Confirm the free WAF rate-limit rule on `POST /api/voice/session` (6 per 10 min per IP) is
   active.
3. Only then consider raising `voice_seconds_cap` — and only if the spend rules below allow it.

### LLM daily cap, $1/day

Checked before every call. When it trips, both channels return the scripted unavailable line. Look
at `llm_calls` for a retry storm or an unusually long conversation before raising it.

### E-mail cap, 20/day

One per session per kind, fixed recipients. If it trips, someone is cycling sessions — check
`leads` and `messages_in` for repeats before touching the cap.

---

## 6. When a spend rule fires

The daily cron sums `spend_events` (written **before** each external call, so a crashed run still
shows its cost) and applies month-to-date rules. Budget ceiling is **$30/month**.

### $27 month-to-date → `voice_seconds_cap_override = 540`

The daily voice budget drops from 12 minutes to 9. Automatic; you get a Resend alert. Nothing to do
unless it fires early in the month — then look at `sessions` for unusually long calls and at
`llm_calls` for failover storms (Haiku costs more than DeepSeek per turn).

### $30 month-to-date → `voice_off_until` = end of month

Voice is off until the month rolls over. Text chat continues in the same persona; the capped copy
explains it without apologising.

**Do not override this by hand.** If the month genuinely needs more, raise the budget consciously:
change the thresholds in the cron job, in a PR, with the new ceiling written down. The rule exists
because a cloned voice on a public URL is an open cost tap.

To see where the money went: `/admin` → Spend, or

```sql
select day, sum(usd), kind from spend_events
where day >= date_trunc('month', now()) group by day, kind order by day desc;
```

---

## 7. Other alerts (Resend)

| Alert                       | First thing to check                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------ |
| LLM failover                | DeepSeek status; if it persists, promote Haiku to primary in `lib/llm/provider.ts`.  |
| Guard hit ×3 in one session | `guard_events.rule` — three hits also ends the call politely.                        |
| Injection ×3                | `/admin` → Sessions. A determined prober is not an emergency; a _successful_ one is. |
| Kill switch flipped         | Was it you?                                                                          |
| Keep-alive failure          | Supabase Free pauses idle projects. The daily cron touch should prevent it.          |

Vercel Hobby keeps logs for one hour, so Postgres is the source of truth: `llm_calls`,
`guard_events`, `probe_events`, mint decisions and webhook outcomes. Look there, not in the log
viewer.

---

## 8. Data subject requests

Transcripts are pseudonymised and deleted after 30 days by the daily purge. Erasure requests arrive
at `legal@abdelrahmansheta.com` with a session code; the SLA is 30 days. Delete the `sessions` row
and let the cascade take the turns. Audio is never stored by us, and ElevenLabs is configured with
audio saving off and 30-day retention — `pnpm push:agent --verify <id>` proves it.

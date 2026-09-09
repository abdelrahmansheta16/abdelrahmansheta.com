# abdelrahmansheta.com — project constitution

Read this first, every session. The design and its rationale are in `docs/ARCHITECTURE.md`.

## What this is
A public portfolio site with a bilingual (English + Egyptian Arabic) voice agent in the owner's cloned
voice. ElevenLabs Agents handles WebRTC, STT (Scribe v2 Realtime) and TTS (Professional Voice Clone on
Flash v2.5); this repo is the brain (`/api/llm`), the text console (`/api/chat`), the static spine, the
guardrails, the caps and the evals. One Next.js deploy on Vercel Hobby (fra1). LLM: DeepSeek V4 Flash
direct (non-thinking), Claude Haiku 4.5 failover. The knowledge corpus lives in the PRIVATE repo
`portfolio-corpus` and is compiled at build time into `lib/corpus/corpus.generated.ts` (gitignored).

## Non-negotiable invariants (each has a test in `tests/guardrails/`)
1. The agent never states a phone number or any e-mail other than `hello@abdelrahmansheta.com`.
2. The agent never states any salary figure, range, floor or rate.
3. Nothing about employers or clients beyond the compiled corpus; `policy/denylist.txt` strings never appear in output.
4. The agent never says the owner is actively job-seeking; the phrase is "open to conversations".
5. Voice minutes are capped in Postgres, counted from rows: 240 s/session, 2 sessions/visitor/day, 720 s/day global, kill switch.
6. No voice token is minted before a live microphone track exists in the browser.
7. Every side effect (email, lead, CV download) happens only after a human click on a fixed-recipient form; the model never names a recipient.
8. The system prompt is byte-identical between voice and text and contains no date, visitor data or env strings; dynamic context goes in a trailing message; never send `user_id` to DeepSeek.
9. Audio is never stored by us; ElevenLabs Audio Saving is off and retention is 30 days; transcripts are pseudonymised and deleted after 30 days.
10. The AI disclosure is spoken at session start, shown before the mic opens, and repeated in the first assistant turn if the greeting did not play.

## Conventions
- TypeScript strict; `pnpm lint`, `pnpm typecheck`, `pnpm test` must pass; `tests/guardrails` must pass before any deploy.
- One tool catalogue in `lib/tools/schema.ts` (zod) generates both the AI SDK tools and the ElevenLabs agent JSON.
- Migrations in `supabase/migrations` are append-only and numbered.
- Secrets only from env; `.env.example` lists every variable.
- Prefer boring: Postgres functions over services, Vercel Cron over daemons, CSS over WebGL.
- Record divergences from the plan in `docs/PROGRESS.md` with a date.

## Commands
```bash
pnpm dev              # next dev (needs KNOWLEDGE_DIR or CORPUS_REPO_TOKEN for the corpus)
pnpm compile:corpus   # validate + lint + compile the private corpus
pnpm test             # vitest
pnpm guard            # tests/guardrails only
pnpm eval:smoke       # promptfoo 10-case smoke against the deployed adapter
```

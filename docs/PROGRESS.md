# Progress log (append-only, dated)

- 2026-09-05 — Plan approved (docs/ARCHITECTURE.md). Repo scaffolded with create-next-app (Next 16.3.4, React 19.2, Tailwind 4, pnpm 10). Private corpus seeded from the CV and the 12 proof points. Phase 0/1 in progress.


- 2026-09-09 — **Day-1 check done: DeepSeek account is out of credit.** `GET /user/balance` returns
  `is_available:false`, total balance −$0.02; a real completion returns **HTTP 402 "Insufficient Balance"**.
  Model IDs confirmed live: `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-v4-flash-vision-exp` (the plan's
  `deepseek-v4-flash` is correct). Two consequences:
  1. **Owner action:** top up the DeepSeek account before the voice/text brain can use the primary provider.
  2. **Design fix (apply at merge):** `withFailover` must treat **402** (and 401/403) as failover triggers.
     The spec given to the api area listed only 429/5xx/network/timeout/content_filter, so a billing lapse
     would break the site instead of falling back to Claude Haiku 4.5. Failover must also raise an alert,
     because silent fallback hides a billing problem.
- 2026-09-09 — Wave 1 merged (guard/normaliser, corpus compiler, API+DB). Verified on main:
  typecheck clean, 416 unit tests pass, and the 20 SQL cap tests pass against a real Postgres 16
  (240 s/session, 2 sessions/visitor/day, 720 s/day, the $27→540 s and $30→voice-off rules, RLS on
  with no policies, one-lead/message/summary-per-session). The real private corpus compiles at
  **7,479 tokens**, version 116994855f50, well under the 45k ceiling.
  Two integration fixes were needed and one real bug was found:
  * The generated corpus module now exports `CORPUS` and `GUARD_CONFIG` (the API imported both; the
    compiler emitted neither), and `CompiledCorpus` carries a guard config built from the same
    sources as the prompt so build-time and runtime cannot disagree about which CV figures are public.
  * The build lint now checks only leak rules, line by line, with a narrower phone check. The full
    runtime rule set failed the build for correct content: redlines.yaml must quote the phrases it
    forbids, and the loose-digit phone heuristic (right for one spoken sentence) trips on a dense CV
    bullet and on the prompt's own 16-hex canary. Injecting a phone number in Latin or Arabic-Indic
    digits still fails the build, so the check was narrowed, not weakened.
  * **Bug the guard caught:** `lib/tools/schema.ts` hard-coded a real contact address in the
    `show_contact` tool description, which is shared code rendered into every prompt, so any fork
    would ship it. Addresses now come from the corpus only.
  Correction to the 2026-09-09 note above: `withFailover` already falls back on *any* pre-token error,
  so the DeepSeek 402 does route to Claude Haiku. It surfaces as `failover=true` in `llm_calls` and in
  the daily digest rather than as an outage.
## 2026-09-09 — area `ci`

Shipped: `.github/` (ci.yml, dependabot, CODEOWNERS, PR template), `tests/guardrails/` (one file per
invariant, 11 files), `scripts/push-agent-config.ts`, `scripts/build-cv.mts`, `scripts/eval/`,
`docs/{RUNBOOK,RECORDING,INTAKE}.md`, `docs/MIGRATIONS.lock`, prettier/editorconfig.

Divergences from the plan, each forced by reality rather than preference:

- **CI step order.** `pnpm compile:corpus` runs *before* lint/typecheck/test, not after.
  `lib/corpus/corpus.generated.ts` is gitignored and imported by several modules, so `tsc` and
  `vitest` cannot run without it.
- **ElevenLabs agent config is camelCase.** `@elevenlabs/elevenlabs-js` 2.66.0 models the create
  body as `conversationConfig` / `maxDurationSeconds` / `onlyAtConversationStart`; the wire format
  stays snake_case. Guardrail 9 asserts the SDK spelling.
- **`turn_eagerness` is not overridable per language preset.** `TurnConfigOverride` exposes only
  `softTimeoutConfig`, so the plan's "patient for Arabic" is applied agent-wide. The Arabic preset
  still carries the Masri `first_message` and the Masri soft-timeout filler.
- **`text_normalisation_type` has no `off`.** The SDK offers `system_prompt` or `elevenlabs`; we use
  `system_prompt` so the corpus keeps ownership of Egyptian number-to-words.
- **`customLlm.apiKey` takes a locator, not a literal.** The config references the env-var label
  `LLM_ADAPTER_SECRET`, so no secret is ever written into the agent JSON.
- **`scripts/build-cv` is `.mts`.** `@react-pdf/renderer`'s transitive `@react-pdf/hyphenate` has an
  import-only exports map, so the script must load as ESM.
- **One-time prettier normalisation** of the whole tree now that `.prettierrc` exists.
  `CLAUDE.md`, `docs/ARCHITECTURE.md` and this file are prettier-ignored — their hand-made tables are
  load-bearing.

Deferred: `knowledge.example/` and `supabase/migrations/` do not exist yet, so guardrails 1-5, 8 and
10 currently report as SKIPPED with the reason in the suite title. They run for real, unchanged, the
moment those areas merge. `docs/MIGRATIONS.lock` lists no migrations yet.
- 2026-09-09 — **Phase 1 complete and running.** All six areas merged; the console is mounted in the
  hero, so every trigger on the page (both buttons, the four chips, the contact link) opens one
  conversation. Verified against a real `next start`: `/` 200, `/ar` 200 with RTL and Masri chips,
  `/cv` 200, `/api/health` 200. 585 tests and 117 guardrails pass; typecheck, lint and the production
  build are clean; the 20 SQL cap tests pass against Postgres 16.
  End-to-end text chat degrades correctly rather than crashing: DeepSeek returns 402, failover fires,
  and the stream ends with "The answer stopped early. Try asking again." over valid SSE. Proving the
  fallback actually *switches* rather than merely failing needs `ANTHROPIC_API_KEY`, which is an
  owner action, as is topping up DeepSeek.

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
- 2026-09-09 — **Published.** Code at `abdelrahmansheta16/abdelrahmansheta.com` (public), corpus at
  `abdelrahmansheta16/portfolio-corpus` (private). The name `portfolio` was already taken by a 2023
  site, which was left untouched.
  Three things were fixed before publishing, because a public repository is not reversible:
  * A real mobile number was in use as denylist test data. The denylist exists to keep exactly that
    number out of the prompt, so publishing it would have defeated the thing under test.
  * The internal planning documents recorded a job search and carried a personal address. They moved
    to the private repository and `docs/ARCHITECTURE.md` replaced them, keeping the section numbers
    the source comments cite.
  * Both were purged from every commit, not just from the tip, and verified absent by scanning every
    blob in the rewritten history.
  Secret scanning and push protection are on for the public repository. CI workflows are staged in
  `.github/workflows-pending/` because the token that created the repository lacked GitHub's
  `workflow` scope; that README has the two commands that enable them.
- 2026-09-09 — **First run against a funded model, and it found a cost bug.** With DeepSeek topped up,
  one question produced **sixteen** POSTs to `/api/chat`. The client resubmits whenever an assistant
  turn ends in tool calls, and a model that keeps reaching for a tool never terminates, so each round
  was another full-prompt call. Nothing in the stack bounded it.
  Fixed at the layer where money is spent: `/api/chat` counts the tool rounds since the visitor last
  spoke and offers no tools past the third, so the model has to answer in words. The client mirrors the
  ceiling to avoid pointless round trips, but the server is the enforcement point, because a browser is
  not a trustworthy place to bound spending. The same question now finishes in **two** calls with an
  884-character answer, at a cost below the balance API's resolution.
  Also verified against the live model, in both languages: all six red-line probes held — phone, e-mail
  and salary each returned the scripted refusal, and the job-seeking probe answered "I'm not job
  hunting. I'm open to conversations when the fit is real." Only the allowlisted contact address was
  ever offered. Egyptian Arabic quality is good: natural Masri with correct code-switching
  ("عملت re-platform كامل من NestJS monolith لـ event-driven FastAPI monorepo"), not fusha.
  Confirmed too: `thinking:{type:'disabled'}` is honoured (no `reasoning_content`), DeepSeek returns
  `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` for the adapter to read, and time-to-first-byte
  from Cairo is ~0.78 s, in line with the latency budget.
- 2026-09-09 — **Qwen added as the backup, and the primary moved off China.** Probing the supplied key
  showed it is not DashScope China (that endpoint rejects it) but Alibaba Cloud Model Studio,
  international — and that the same endpoint serves `deepseek-v4-flash`. So the largest legal exposure,
  visitor speech reaching the PRC with no data-processing agreement, was fixable with a base-URL change.
  Measured from Cairo against the real 7,794-token corpus: DeepSeek direct 0.92 s time-to-first-token
  and 98.6% turn-two cache hit; the same model via Singapore 1.48 s and 98.6%; Qwen3.8-flash 1.39 s and
  90.6%. Singapore costs about half a second and no cache quality.
  Three things that would have bitten:
  * **Reasoning is on by default on Qwen too.** Left on it streams 461 reasoning chunks at 27.6 s to
    first token, and under a 220-token budget it consumes the whole allowance so the visitor gets an
    empty answer. It takes the same `thinking:{type:"disabled"}` DeepSeek does, so the existing body
    injection was reused rather than duplicated (`prepareCompatibleBody`).
  * **Cache hits were about to become invisible.** Alibaba reports them only as
    `prompt_tokens_details.cached_tokens` and omits DeepSeek's flat fields, which `extractUsage` did not
    read — a 98%-cached turn would have been priced as a full miss, silently, and that number drives the
    $27/$30 spend rules. Fixed, with tests built from the captured payloads.
  * **`DEEPSEEK_API_KEY` holding an Alibaba key** would have been a lasting footgun, so the two slots are
    now named by role (`LLM_PRIMARY_*`, `LLM_FALLBACK_*`). Adapter names stay model-specific because they
    drive cost attribution.
  The consent line and the privacy processor table said "DeepSeek (Hangzhou, China; data stored in
  China)" in both languages. That is now untrue, so both say Alibaba Cloud Model Studio (Singapore), and
  the Anthropic entry was removed since no key is set — a privacy page should list processors that
  actually process. Anthropic stays wired as an optional third choice.
  **Verified live, including the failover path, which had never once run:** with the primary key
  deliberately invalidated, Qwen answered correctly from the corpus, and all six red-line probes held on
  it in both languages — phone, e-mail and salary returned the scripted refusals and the job-seeking
  probe answered "I'm not job hunting." Primary restored and re-checked afterwards.
  Still open: `estimateUsd` carries DeepSeek's list prices for both rows, marked with a TODO. Neither is
  authoritative for Alibaba; the real per-token rates need reading off their pricing page.

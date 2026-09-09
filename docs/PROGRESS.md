# Progress log (append-only, dated)

- 2026-09-05 — Plan approved (docs/PLAN.md). Repo scaffolded with create-next-app (Next 16.3.4, React 19.2, Tailwind 4, pnpm 10). Private corpus seeded from the CV and the 12 proof points. Phase 0/1 in progress.

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

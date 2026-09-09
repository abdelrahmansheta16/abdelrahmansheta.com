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

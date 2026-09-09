# Progress log (append-only, dated)

- 2026-09-05 — Plan approved (docs/PLAN.md). Repo scaffolded with create-next-app (Next 16.3.4, React 19.2, Tailwind 4, pnpm 10). Private corpus seeded from the CV and the 12 proof points. Phase 0/1 in progress.

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
  `CLAUDE.md`, `docs/PLAN.md` and this file are prettier-ignored — their hand-made tables are
  load-bearing.

Deferred: `knowledge.example/` and `supabase/migrations/` do not exist yet, so guardrails 1-5, 8 and
10 currently report as SKIPPED with the reason in the suite title. They run for real, unchanged, the
moment those areas merge. `docs/MIGRATIONS.lock` lists no migrations yet.

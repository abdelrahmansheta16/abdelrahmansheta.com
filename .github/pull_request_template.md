## What changed

<!-- One paragraph. Link the plan section or the milestone if there is one. -->

## Privacy checklist — this repo is PUBLIC

- [ ] **No conversation transcripts** pasted anywhere: not in the description, not in a comment,
      not in a test fixture, not in a screenshot.
- [ ] **No corpus content** from the private `portfolio-corpus` repo. Fixtures use
      `knowledge.example/` (fake person) only.
- [ ] No phone number, no personal e-mail address, no salary figure — in code, tests, docs or
      commit messages. The only contact address that may appear is `hello@abdelrahmansheta.com`.
- [ ] No secrets, tokens, API keys or `.env` values; `.env.example` updated if a new
      `process.env.*` was introduced.
- [ ] `lib/corpus/corpus.generated.ts` is still untracked.

## Guardrails

- [ ] `pnpm guard` passes locally.
- [ ] If an invariant in `CLAUDE.md` was touched, the matching test in `tests/guardrails/` was
      updated **and** the change was justified in the description (weakening one needs a
      conscious decision, not a green checkbox).
- [ ] `supabase/migrations/` untouched, or a new numbered file appended and
      `docs/MIGRATIONS.lock` regenerated.

## Verification

<!-- What you actually ran. "CI is green" is not a verification. -->

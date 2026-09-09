# Enable CI

These workflows are staged here rather than in `.github/workflows/` for one reason: the token used to
create this repository did not carry GitHub's `workflow` OAuth scope, and GitHub refuses any push that
adds a workflow file without it. Nothing is wrong with the workflows themselves.

To turn CI on, once, from a terminal you control:

```bash
gh auth refresh -s workflow
git mv .github/workflows-pending/ci.yml .github/workflows/ci.yml
git mv .github/workflows-pending/dependabot.yml .github/dependabot.yml 2>/dev/null || true
git commit -am "ci: enable workflows" && git push
```

`ci.yml` runs lint, formatting, Next typegen, typecheck, the unit suite, the guardrail suite, a corpus
compile against `knowledge.example`, a production build, gitleaks and actionlint.

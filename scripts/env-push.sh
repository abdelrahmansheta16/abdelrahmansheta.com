#!/usr/bin/env bash
# Push .env.vercel to the linked Vercel project, for all three environments.
#
#   pnpm env:push            # dry run: prints what it would do, changes nothing
#   pnpm env:push --apply    # actually writes
#
# Why a script and not `vercel env add` by hand: there are fourteen variables, each needs three
# environments, and the failure mode we already hit is silent — a variable scoped to Preview only
# looks set in the dashboard and is invisible to the Production build. This always writes all three.
#
# It refuses to push an empty value. An empty CORPUS_REPO_TOKEN is indistinguishable from an unset
# one at build time, so pushing blanks would recreate the exact failure this exists to end.
set -euo pipefail

cd "$(dirname "$0")/.."
FILE=".env.vercel"
APPLY="${1:-}"

[ -f "$FILE" ] || { echo "no $FILE — run: pnpm env:vercel"; exit 1; }
[ -d ".vercel" ] || { echo "project not linked — run: vercel link"; exit 1; }

blanks=()
names=()
while IFS= read -r line; do
  case "$line" in ''|\#*) continue ;; esac
  case "$line" in *=*) ;; *) continue ;; esac
  key="${line%%=*}"
  val="${line#*=}"
  val="${val%"${val##*[![:space:]]}"}"          # rstrip
  val="${val#"${val%%[![:space:]]*}"}"          # lstrip
  if [ -z "$val" ]; then blanks+=("$key"); continue; fi
  names+=("$key")
  if [ "$APPLY" = "--apply" ]; then
    for env in production preview development; do
      vercel env rm "$key" "$env" --yes >/dev/null 2>&1 || true
      printf '%s' "$val" | vercel env add "$key" "$env" >/dev/null
    done
    echo "  set $key (production, preview, development)"
  else
    echo "  would set $key (${#val} chars) -> production, preview, development"
  fi
done < "$FILE"

echo
echo "${#names[@]} variable(s) ready."
if [ ${#blanks[@]} -gt 0 ]; then
  echo "SKIPPED, still blank in $FILE: ${blanks[*]}"
  echo "Fill them in and re-run. CORPUS_REPO_TOKEN is required — the build fails without it."
fi
if [ "$APPLY" != "--apply" ]; then
  echo
  echo "Dry run. Nothing was changed. Re-run with:  pnpm env:push --apply"
else
  echo "Done. Vercel does NOT rebuild on a variable change — trigger a deploy to pick these up."
fi

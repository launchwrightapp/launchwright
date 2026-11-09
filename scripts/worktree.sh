#!/usr/bin/env bash
# One git worktree per branch, always cut from the latest main.
#
#   npm run wt:new  -- feat/short-name   # fetch main, create .claude/worktrees/feat-short-name, npm install
#   npm run wt:done -- feat/short-name   # after the PR is merged: remove the worktree and branch, pull main
#   npm run wt:list                      # show worktrees
#
# The main checkout stays on main and is only ever fast-forwarded.
set -euo pipefail

root="$(git rev-parse --path-format=absolute --git-common-dir)"
root="${root%/.git}"
cmd="${1:-}"
branch="${2:-}"
dir="$root/.claude/worktrees/${branch//\//-}"

pull_main() {
  git -C "$root" fetch --prune origin
  if [ "$(git -C "$root" branch --show-current)" = "main" ]; then
    git -C "$root" merge --ff-only origin/main
  else
    git -C "$root" branch -f main origin/main
  fi
}

case "$cmd" in
  new)
    [[ "$branch" =~ ^(feat|fix|chore|docs)/[a-z0-9._-]+$ ]] || { echo "usage: wt:new -- feat|fix|chore|docs/short-name" >&2; exit 1; }
    pull_main
    git -C "$root" worktree add -b "$branch" "$dir" origin/main
    (cd "$dir" && npm install --no-audit --no-fund)
    echo "Ready: cd $dir"
    ;;
  done)
    [ -n "$branch" ] || { echo "usage: wt:done -- <branch>" >&2; exit 1; }
    state="$(gh pr view "$branch" --json state -q .state 2>/dev/null || echo NONE)"
    if [ "$state" != "MERGED" ] && [ "${FORCE:-}" != "1" ]; then
      echo "PR for $branch is $state, not merged. Set FORCE=1 to remove anyway." >&2
      exit 1
    fi
    [ -d "$dir" ] && git -C "$root" worktree remove "$dir"
    git -C "$root" branch -D "$branch" 2>/dev/null || true
    git -C "$root" push origin --delete "$branch" 2>/dev/null || true
    git -C "$root" worktree prune
    pull_main
    echo "Removed $branch. main is at $(git -C "$root" rev-parse --short main)."
    ;;
  list) git -C "$root" worktree list ;;
  *) echo "usage: worktree.sh new|done|list [branch]" >&2; exit 1 ;;
esac

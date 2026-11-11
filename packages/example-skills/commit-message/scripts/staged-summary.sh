#!/bin/sh
# What is staged, in a form a commit message can be written from: the files and how much of each changed, then the
# totals. Read-only: it never stages, commits or writes.

set -eu

if git diff --cached --quiet; then
  echo "nothing is staged" >&2
  exit 1
fi

git diff --cached --stat --stat-width=100
echo
git diff --cached --shortstat

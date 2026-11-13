#!/bin/sh
# A herdr space for a project with isorite: your agent in the left pane, `isorite serve` on its notes in the right.
# Run it where the herdr window is open (it drives the window with `herdr-app do`):
#   sh isorite-space.sh [<notes folder>] [claude|codex|<any agent command>]
# The notes folder defaults to ./notes if there is one, else the current folder; the agent to claude. The agent finds
# isorite's MCP in the project's config, as `isorite setup` wrote it. isorite reports its own agent's turns to herdr
# (OSC 7501), so its pane shows working, blocked and done beside your agent's.
set -eu

fail() { printf 'isorite-space: %s\n' "$*" >&2; exit 1; }
command -v herdr-app >/dev/null 2>&1 || fail "needs herdr-app on PATH (https://herdr.dev)"
command -v isorite >/dev/null 2>&1 || fail "needs isorite on PATH"

notes=${1:-}
if [ -z "$notes" ]; then if [ -d notes ]; then notes=notes; else notes=.; fi; fi
[ -d "$notes" ] || fail "no folder at $notes"
notes=$(cd "$notes" && pwd)
project=$(pwd)

# Codex runs its commands in its own daemon unless told not to, outside herdr's terminal.
case ${2:-claude} in
  codex) agent='["codex","--no-daemon"]' ;;
  claude) agent='["claude"]' ;;
  *) agent="[\"$2\"]" ;;
esac

# A path as a JSON string: backslashes and double quotes escaped.
json() { printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"; }

herdr-app do space.new "{\"name\":\"isorite\",\"folder\":$(json "$project"),\"argv\":$agent}" >/dev/null
herdr-app do pane.split "{\"direction\":\"right\",\"argv\":[\"isorite\",\"serve\",$(json "$notes")]}" >/dev/null
printf 'isorite-space: %s beside %s\n' "isorite serve $notes" "${2:-claude}"

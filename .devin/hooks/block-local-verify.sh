#!/bin/bash
# Repo policy: verification gates run on GitHub CI, not locally; no
# foreground sleep-polling loops.
#   - `tsc`/`tsgo`/`type-check`: crash on local dev machines in this harness
#     (Node Abort trap: 6 / tsgo OOM-kill).
#   - vitest / `bun run check` / test / e2e / cucumber: user policy — CI only.
#   - `sleep N` foreground waits: check once, report, move on.
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]|&;])(bunx?[[:space:]]+|npx[[:space:]]+|pnpm([[:space:]]+exec)?[[:space:]]+|yarn[[:space:]]+)?(tsgo|tsc|vitest|cucumber-js)([[:space:]]|$)|(^|[[:space:]|&;])(bun|pnpm|yarn|npm)[[:space:]]+(run[[:space:]]+)?(type-?check|check|test|e2e)\b'; then
  printf '%s\n' '{"decision":"block","reason":"BLOCKED: repo policy — no local verification runs. tsc/tsgo crash on this machine and all tests/checks run on GitHub CI. Push and watch `gh pr checks` instead."}'
elif printf '%s' "$cmd" | grep -qE '(^|[[:space:]|&;])sleep[[:space:]]+[0-9]+'; then
  printf '%s\n' '{"decision":"block","reason":"BLOCKED: no foreground sleep-polling. Check status once with `gh pr checks` / `gh run list`, report it, and move on — do not sit in a sleep loop."}'
fi
exit 0

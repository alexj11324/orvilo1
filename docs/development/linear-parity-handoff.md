# Linear ↔ Orvilo Parity Audit — Handoff

Point-in-time handoff of the in-progress Linear-parity audit so it can be
continued on a local machine. Written 2026-09-23 from the cloud Devin VM.

## Mission

Align Orvilo UI surfaces with Linear, verified by actually clicking through both
apps (CDP + DOM + visual + Computer Use), on three axes plus semantics:

1. Shape / layout identical
2. Icons identical
3. Post-click behavior identical
4. Semantics identical (e.g. health = manual status on-track/at-risk/off-track,
   progress = estimates roll-up — not just similar-looking icons)

The audit was orchestrated by a local Devin CLI session (`--model swe-2-max`,
`--permission-mode dangerous`) that fanned out to 9 sub-agents — one per
surface — each working in an isolated git worktree.

## Local environment reproduction

```bash
# 1. Services (brew, no docker): postgres@17 + pgvector on :5432, redis on :6379

# 2. Env file
source .records/env/e2e-dev.env # APP_URL=http://localhost:3010, PORT=3010,
# DATABASE_URL=postgresql://devin@localhost:5432/orvilo

# 3. Parity database (guarded seed target)
createdb orvilo_linear_parity_20260922
pg_dump --schema-only -d orvilo | psql orvilo_linear_parity_20260922
# copy drizzle.__drizzle_migrations rows too — brew postgres lacks pg_search,
# so running real migrations fails; marker rows mark them applied.
ORVILO_PARITY_SEED_TARGET=local bun run workflow:seed-linear-parity

# 4. Run the prod build on the parity DB (port MUST be 3010 — APP_URL is read
#    at runtime; `bun run start` hardcodes 3210 and auth redirects to 3010)
DATABASE_URL=postgresql://devin@localhost:5432/orvilo_linear_parity_20260922 \
  ./node_modules/.bin/next start -p 3010
```

Test login: `agent-testing@orvilo.aspectlylabs.com` / `TestPassword123!`,
workspace slug `agent-testing`, API key `sk-ov-agenttesting0001`.

### CDP Chrome (drives both apps for the audit)

```bash
open -na "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir=/Users/devin/.chrome-cdp-profile
```

- Playwright probe scripts MUST live under `e2e/` (module resolution) and use
  `chromium.connectOverCDP('http://localhost:9222')`. Passing a URL to `open`
  does not navigate an existing window — drive it via Playwright.
- Linear side: workspace **BDI\_Verifier** — <https://linear.app/bdiverifier> —
  sign in with `alexjiang20232024@gmail.com` via **email code** (not Google
  OAuth). Team: `orvilo`.

### Devin CLI notes

- `devin` v3000.11.3 at `~/.local/bin/devin`; `devin -c` continues the last
  session, `-r` resumes; logs in `~/.local/share/devin/cli/logs/`.
- `devin auth login` must run in a real TTY (Terminal.app), not a managed
  terminal; it prints a browser URL for the devin.ai email-code login.
- In the TUI, typed input queues while busy — press Enter again to flush.

## Worktree / branch map

All parity work is based on `origin/devin/v6-linear-polish` (PR #209 line),
**not** `canary` — the Linear-parity surfaces are not merged yet.

| Surface        | Worktree                   | Branch                             | State at handoff                                                                                                                                                  |
| -------------- | -------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cycles         | `wt-parity-cycles`         | `fix/linear-parity-cycles`         | Done — audit-only, findings = "intentional omission" → PR #218                                                                                                    |
| Inbox          | `wt-parity-inbox`          | `fix/linear-parity-inbox`          | WIP committed: WorkInbox parity fixes + locales + evidence pack under `.agents/runtime-acceptance/parity-2026-09-23/inbox/` (FINDINGS.md, screenshots, DOM dumps) |
| Issue detail   | `wt-parity-issue-detail`   | `fix/linear-parity-issue-detail`   | No commits — DOM-diff audit produced (`issue-detail.diff.md` in session artifacts), no code changes yet                                                           |
| My issues      | `wt-parity-my-issues`      | `fix/linear-parity-my-issues`      | WIP committed: TaskPriorityTag/TaskStatusTag parity, context-menu items, new `assigneeMenuItems.tsx`, locales, MyWork routes/bulk bar                             |
| Project detail | `wt-parity-project-detail` | `fix/linear-parity-project-detail` | No commits yet                                                                                                                                                    |
| Projects list  | `wt-parity-projects-list`  | `fix/linear-parity-projects-list`  | No commits yet                                                                                                                                                    |
| Semantics      | `wt-parity-semantics`      | `fix/linear-parity-semantics`      | WIP committed: `workAttention` semantics (health/progress meaning), `workflowMove`, MyWork filters/display, team sections + tests                                 |
| Triage         | `wt-parity-triage`         | `fix/linear-parity-triage`         | No commits yet                                                                                                                                                    |
| Views          | `wt-parity-views`          | `fix/linear-parity-views`          | WIP committed: probe scripts only                                                                                                                                 |

Each WIP snapshot commit is `🚧 chore(parity-<x>): snapshot in-progress changes
for handoff`. They are **unverified** — `bun run check` was not run on them;
pre-commit lint-staged auto-fixed formatting/lint on commit.

## What's in this handoff PR

- This document.
- \~200 scratch Playwright/CDP probes consolidated under
  `e2e/parity-audit-scratch/` (`parity-*.mjs`, `linear-*.mjs`, `devin-*.mjs`,
  `rawcdp*.mjs`, …) — the audit tooling the sub-agents wrote. Disposable;
  committed for provenance so local can rerun the exact same probes. The dir
  is excluded from eslint (`eslint.config.mjs` ignores).
- `apps/share/public/sounds` — untracked asset dir found in the checkout.

## Still owed (orchestrator's contract)

- Surfaces with no commits yet: issue-detail (has findings only),
  project-detail, projects-list, triage — restart their sub-agents or continue
  by hand.
- After all surfaces land: **main-process re-verification pass** — click every
  control on every page again end-to-end (this was the orchestrator's final
  step and had not run at handoff).
- Intentional deviations must be listed as decision items (like cycles).

## Caveats

- Snapshots are point-in-time: the cloud orchestrator session was still alive
  when these were committed and may push additional commits to the same
  branches.
- WIP snapshot commits did not go through `bun run check` / product
  verification — do that before opening real PRs from them.
- The scratch probes are committed for provenance; strip or relocate them
  (e.g. under `e2e/parity-probes/`) before anything merges to `canary`.
- brew Postgres lacks `pg_search` — always use the schema-dump +
  marker-row path above, never real migrations, for the parity DB.

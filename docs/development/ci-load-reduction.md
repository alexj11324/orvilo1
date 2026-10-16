# CI load reduction

The 2026-10-14 UTC snapshot contained 676 workflow runs and 4,898 runner minutes
(sum of job durations, including rerun attempts, without billing multipliers).
The changes below target that load; savings must be measured after rollout rather
than adding overlapping estimates from the snapshot.

## Ownership and required checks

`Test CI` still runs on pushes, and independently on fork PRs. For same-repository
PRs, GitHub branch protection uses `Required Quality Gate` from the head commit's
push run. The PR run no longer polls or publishes that check name on the merge
commit. Its skipped gate has the distinct informational name `Push owns quality
checks`, so it cannot mask the head's failed or missing gate.

`UI alignment` similarly runs browser geometry on pushes and fork PRs; the
same-repository PR's skipped job has a different name. Pushes use a cheap
cumulative branch-diff planner, so a documentation-only follow-up still tests
earlier UI changes. No successful mirror is
published. The required check names remain unchanged. Keep branches up to date
with the target branch when merge compatibility is required.

The read-only effective rules API for both `canary` and `main` reported
`Documentation Required` and `Required Quality Gate`, with strict up-to-date
checks enabled, on 2026-10-15. Neither reported a required coverage-provider
check. Confirm head-check resolution on a live PR during rollout. Historical mirror checks on an existing PR's merge SHA can remain
until its next synchronize event; push a new revision if migrating such a PR.

## Affected tests and coverage

`run-ci-plan.mjs` calls the existing affected planner to drive the leaf jobs.
Feature pushes compare their entire branch against the default branch's merge
base, while fork PRs use their base SHA. Missing or empty diffs and unknown paths
run all suites. This deliberately avoids last-push-only selection, which could
forget an earlier broken change when a contributor subsequently edits docs.

The package job selects reverse-dependent suites from
`.github/scripts/ci-package-suites.json`, the pre-existing CI suite inventory.
The database remains a separate PostgreSQL job using `vitest.config.server.mts`.
CLI dependency installation and its build-contract test only run when selected.
E2E and bundle-size gates retain their existing execution policy.

Pushes to `canary` and `main` run full verification and collect coverage. Feature
pushes and fork PRs run selected tests without coverage instrumentation, blob
artifacts, or coverage-merge jobs. The quality gate accepts those intentional
merge skips but fails on missing plans, unexpected skips, failures and
cancellations. `[ci full]` runs every scope and disables leaf fail-fast without
turning PR coverage back on.

The shared environment action caches pnpm's store using the OS and the root,
CLI and desktop lockfiles. Install/link steps still run. Callers can set
`package-manager-cache: 'false'` to opt out. We do not filter the root install:
full TypeScript checks and shared test configs still need the workspace graph.

## Event-driven Vercel deployment

The two gated Vercel workflows reevaluate once on workflow completion, external
check completion, and commit-status updates. Preview also evaluates on PR open,
reopen and synchronize. Pending or failed gates release the runner without
creating a deployment; a later completion event reevaluates them.

The target SHA comes from the source event, never the workflow's default-branch
checkout SHA. The resolver only targets currently open same-repository PRs or
the current `canary` / `main` ref. Previews retain owner-only authorization by
checking the latest owning Test CI push's actor and triggering actor, rather
than the bot delivering the completion webhook. The preview quota switch remains
required. Privileged helper code comes from the protected default branch.

The existing gate still requires successful Test CI and E2E runs on that exact
push SHA, GitGuardian, and all other visible non-ignored checks/statuses. A
cancelled or failed owning run cannot pass via successful partial jobs. The
create step rechecks the live PR/ref before deploying. Per-target concurrency
serializes deployment attempts, and a Vercel lookup reuses an existing queued,
building or ready deployment with the same project, SHA, branch, PR and target.
Failed deployments can be retried.

New commit-check workflows must be added to both `workflow_run.workflows`
lists so their completion can wake the gate. If event delivery or an API lookup
fails, rerun the corresponding Vercel workflow after checks finish. These event
handlers only become active after the workflow files reach the default branch.

## Verification

Local verification passed: 29 native CI contract tests, 17 Vercel gate/workflow
tests, and `actionlint` for all four modified workflows. Scoped `bun run check --lint` passed with one pre-existing `node:path` import-style warning. A real
workspace-graph check confirmed all 27 existing package CI suites are retained
among 103 discovered packages. None requires a deployment or a
product UI verification run: this change affects CI scheduling only. After
rollout compare job-minute totals, pnpm cache hit/install times, required-check
resolution on same-repository and fork PRs, and the number of Vercel deployments
per target SHA against a comparable full day of traffic.

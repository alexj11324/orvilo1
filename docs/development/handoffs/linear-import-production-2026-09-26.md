# Linear import production handoff for Devin

Snapshot: 2026-09-27 03:03 UTC (2026-09-26 in New York). This document is part of [PR #296](https://github.com/alexj11324/orvilo1/pull/296). Recheck the PR head, CI, review threads, `canary`, and production before acting; every status below is a point-in-time observation.

## User goal and decision still needed

The user requested a Plane-style Linear importer on Orvilo `canary`, with OAuth, deployment, and an actual public-site test. They explicitly authorized importing the Linear `orvilo (ORV)` team into the production Orvilo project `Orvilo Linear Parity (OLP)`. The first real import found that all 148 source issues already had live-sync links to existing Orvilo tasks. Only 46 linked tasks are in OLP; the other 102 are elsewhere. The user has **not yet answered the follow-up choice** between making 102 additional one-time copies in OLP and preserving the current task locations. The implementation in PR #296 takes the copy path. Confirm that specific choice with the user before merging or running the replay in production.

Acceptance for the copy path: OLP gains the 102 missing issues without moving or changing the 148 pre-existing live-sync tasks or their links. The completed import job reports 102 imported, 46 skipped, 0 failed after replay; its 148 receipts identify 102 new destination task IDs and 46 same-project skips. Reload the UI and inspect the target project. A successful build or a `completed` job with 0 imports is insufficient evidence.

## Delivered baseline

- The previous importer stack [#281](https://github.com/alexj11324/orvilo1/pull/281), [#289](https://github.com/alexj11324/orvilo1/pull/289), [#291](https://github.com/alexj11324/orvilo1/pull/291), and [#292](https://github.com/alexj11324/orvilo1/pull/292) merged into `canary` at `57186514936904593dbe03e446d445c815c8b608`. Its Test CI, Web E2E, image build, and [production deployment](https://github.com/alexj11324/orvilo1/actions/runs/36285996300) succeeded. Deployment quality gate, digest resolution, Deploy, and Verify steps all passed.
- In the authenticated public UI, the old `Cannot query field "organization" on type "Project"` error disappeared. The OLP destination picker loaded, Linear OAuth completed through the production callback, and the team catalog returned `Daymark (DAY123)` and `orvilo (ORV)`. ORV preview showed `50+` issues and 8 workflow states. The `Duplicate` state was explicitly mapped to canceled; the other suggested mappings were retained.
- Local Electron acceptance for a **fresh isolated database** had previously imported 148 issues over 3 pages. Its source tag, screenshots, receipt checks, and limits are in [the acceptance record](../../research/linear/import-e2e-20260926/README.md). That local result did not prove the production existing-link case found below.

## Production finding, reproduced and read-only verified

At `5718651`, the user-authorized ORV → OLP confirmation created job `680a7196-0814-414a-8af7-e0d6d3f70c28` at 2026-09-27 02:26:49 UTC. It completed 3 pages at 02:26:51 UTC with `issues_imported=0`, `issues_skipped=148`, `issues_failed=0`. The same result persisted after browser reload. The OLP project overview and issue list showed 46 tasks, not 148.

A read-only production database query established that all 148 job receipts were `skipped_sync` with no destination `task_id`. Their pre-existing live-linked tasks were distributed as follows:

| Current linked-task location | Count |
| ---------------------------- | ----: |
| OLP, the chosen destination  |    46 |
| Other projects               |    97 |
| No project                   |     5 |
| Total                        |   148 |

The read-only query used `BEGIN READ ONLY` against the application database. To recheck without exposing issue content or credentials, join `linear_import_jobs` to `projects` on `project_id`, then group `linear_import_receipts` for the job by `result`; join skipped receipts to `linear_issue_links` on `(workspace_id, linear_issue_id)` and to `tasks` on the link's `task_id`, grouping by whether `tasks.project_id` equals OLP's project ID, another project ID, or null. The receipt `project_id` records the attempted destination; it does **not** prove a task was created there.

Root cause: [`LinearImportModel.recordIssue`](../../../packages/database/src/models/linearImport.ts) used any workspace-wide `linear_issue_links` row as a reason to skip, regardless of the linked task's project, and stored a skipped receipt. [`LinearImportModel.start`](../../../packages/database/src/models/linearImport.ts) returned an existing completed same-scope job, so the UI's “New import” flow could not replay it after a correction. This was a new production job, not a stale UI result.

## PR #296 implementation and verification

- Branch: `fix/linear-import-synced-copy`, based on `canary` commit `57186514936904593dbe03e446d445c815c8b608`.
- Code commit: `1c7054bc48a6c379323fb308bef7c5148ff751d1` (`🐛 fix(linear): copy synced issues into selected import project`). It changes only the import model and its existing test file. No schema migration or dependency was added.
- The model now skips a live-linked issue only when the linked task is already in the chosen destination. Otherwise it creates a separate one-time imported task and receipt, while leaving the original task and live-sync link in place. Replaying the completed same-scope job resets its cursor and page count. Historical `skipped_sync` receipts from that job can convert atomically to imported receipts; the job moves one count from skipped to imported per converted issue. Repeated page work remains idempotent.
- Two regression cases failed before the code change and passed after it: a cross-project live link must produce a destination copy, and a completed historical skip job must replay and convert its receipt. The focused database suite passed 12/12; `bun run check` reported clean lint and the same 12 tests. An independent light review found no concrete current-path blocker. Local root `tsgo` was not run, per `AGENTS.md`.
- As of this snapshot, the exact-head push [Test CI run](https://github.com/alexj11324/orvilo1/actions/runs/36289479449) for `1c7054b` succeeded, and the exact-head [Web E2E run](https://github.com/alexj11324/orvilo1/actions/runs/36289479452) succeeded. PR #296 is still **Draft**. Its `Documentation Required` check failed because that earlier head had no `docs/` change; this handoff document supplies the required docs change. Recheck every check on the new PR head after this document is pushed. Do not treat the old green runs as checks for the new commit.
- At handoff there were no unresolved inline review threads on #296. Check again after CI and automated review finish.

## Devin continuation

1. Open [PR #296](https://github.com/alexj11324/orvilo1/pull/296), verify its current head and `canary` base, inspect the two-file code diff plus this handoff, and check review threads. The code branch was pushed; there is no uncommitted implementation patch to recover. The original primary checkout has three unrelated untracked items; do not clean, stage, or overwrite them.
2. Resolve any concrete current-path review findings with a focused commit and regression check. Do not run local root `tsgo`; rely on the remote Typecheck job. Confirm the **new exact head's** Test CI, E2E, Documentation Required, Skeleton Required, and other required gates. The docs gate is file-based: a PR description alone does not satisfy it.
3. Ask the user to confirm the specific creation of 102 one-time OLP copies while keeping the existing 148 live-linked tasks in place. The earlier ORV → OLP import authorization did not explicitly answer this duplicate-copy choice. If the user instead chooses to preserve the existing locations, do not merge this PR as written; report that the production no-op was intentional deduplication and agree on a fresh-source write-path test separately.
4. Once the user confirms the copy path and the PR gates/review pass, mark the PR ready and merge into protected `canary`. Verify the resulting canary SHA. Wait for that SHA's Test CI, E2E, immutable image build, and promote gate. Deploy via `deploy-orvilo1.yml` with `canary`, `deploy=true`, `build=false`, and empty `retag_main_from`; verify the workflow's SHA, image digest, migration/health checks, and public API. In Devin sessions, the documented GitHub App token has Actions read access only; ask the user to trigger a required dispatch or rerun in GitHub rather than hunting for another credential.
5. In the authenticated public [Linear import wizard](https://orvilo.aspectlylabs.com/ws-useruvj9ouq0/settings/imports/linear), choose “New import,” OLP, the existing active Linear connection, and ORV. Reapply the **same frozen eight mappings** as the original job, especially `Duplicate → canceled`; a different mapping set is correctly rejected. Review the summary and confirm the replay. The backend should reuse job `680a7196-0814-414a-8af7-e0d6d3f70c28` in queued state, process 3 pages, and convert 102 historical skips into imported tasks.
6. Capture the result after reload. Verify the OLP task count (baseline 46; expected 148 if no concurrent changes), receipt counts and `task_id` values, and unchanged original live-link task IDs/project placement using read-only queries. Attach evidence and the deployed commit SHA to #296. If counts differ, inspect the job `last_error`, workflow dispatches, and per-page state before claiming success. Do not manually reset production receipts or bulk-delete existing tasks.

The new OLP copies are historical import tasks; the original tasks remain the live-sync targets. Reverting code after the import would not remove copied production data, so treat any rollback of those tasks as a separate, reviewable data operation.

## Copy-paste prompt for Devin

> Continue [Orvilo PR #296](https://github.com/alexj11324/orvilo1/pull/296) using its committed handoff at `docs/development/handoffs/linear-import-production-2026-09-26.md`. Verify the current PR head, checks, review threads, canary tip, and production state first. The user authorized an ORV → OLP import but has not answered whether the 102 already live-linked issues should also be copied into OLP; obtain that specific decision before merging. If confirmed, complete CI/review, merge, deploy the exact canary SHA, then replay and verify the production job and destination tasks. Preserve unrelated checkout changes and report evidence with exact commit IDs.

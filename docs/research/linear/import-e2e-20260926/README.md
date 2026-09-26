# Linear importer Electron acceptance

Verified source revision: `de2d7098eecc0aa2c493274c89bbbf2c93654179` on 26 September 2026. This revision combines the catalog query split with the page-continuation fix, on top of the OAuth refresh fix.

## Environment and flow

The candidate ran in Electron with an isolated profile against a dedicated local PostgreSQL database, `orvilo_linear_parity_20260922`. A temporary embedded Hatchet `v0.107.0` tenant and worker dispatched the production Linear import workflow. The worker and backend used loopback endpoints; no shared cloud Hatchet token was used.

Fresh Linear OAuth consent completed through the registered local callback. In Electron, the catalog loaded two teams, the selected `orvilo (ORV)` team supplied eight workflow states, and the summary showed `50+` issues. The destination was the local `Parity Test Project (PTP)`. The final Confirm button was clicked once.

## Result

| Check                       | Observed result                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Import job                  | Completed; no last error; lease and lock cleared                                        |
| Pages                       | 3                                                                                       |
| Imported / skipped / failed | 148 / 0 / 0                                                                             |
| Destination task count      | 16 before, 164 after                                                                    |
| Import receipts             | 148 unique source IDs and 148 unique task IDs                                           |
| Destination consistency     | No missing/deleted task, wrong project, or mismatched receipt                           |
| Linear issue links          | All 148 present and consistent with their tasks                                         |
| Workflow dispatches         | Initial page, `page:2`, and `page:3` all completed with provider receipts and no errors |

The job completed in 3.450 seconds. The runtime log independently recorded three sequential workflow dispatch starts and completions. Linear was only read during the import; imported data was written to the dedicated local database.

Completion persisted after a reload, and the destination project rendered the imported tasks. Electron, the backend, the worker, and the embedded Hatchet service were then stopped; ports 5196, 9246, 3413, and 28243 were verified free.

## Evidence

- [Eight state mappings](./03-status-mapping.png)
- [Preview before confirmation](./04-summary-preview.png)
- [Completed state after reload](./07-import-completed-after-reload.png)
- [Destination project after import](./08-project-after-import-redacted.png) (issue titles redacted)
- [Aggregate result](./post-import-result.json)
- [Sanitized dispatch log](./import-runtime-sanitized.txt)

## Regression coverage

- The catalog test first reproduced HTTP 400 `Query too complex` for the nested team query. The split preserves paginated states and cycles and filters foreign-organization teams before child queries.
- The 51-issue regression first reproduced a missing continuation after page one. Page-specific workflow IDs now enqueue the next page while preserving the job concurrency lane.
- The combined focused suites passed 21 tests; lint passed for all five changed TypeScript files. Independent reviews found no remaining correctness blocker.

## Limits

This is local functional acceptance. It does not prove a cloud deployment, the separate project/Team Home parity branch, or GitHub Connector consent. Full repository Typecheck remains a remote CI gate; no local root `tsgo` was run. Large organizations may incur additional catalog requests because states and cycles are fetched per team.

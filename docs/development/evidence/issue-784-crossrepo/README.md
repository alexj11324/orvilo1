# Issue 784: actual two-repository delivery

**Passed on local Electron and backend H, cec4c8397ec8aa1ed0aee43a36382f3f06039b25.** Renderer and backend used H; renderer product bytes were unchanged from E240. This receipt does not establish a cloud deployment.

Only two private QA repositories and their own qa-target branches were authorized. Both PRs were merged by the product controller, and parent T-10 plus children T-11/T-12 reached Done.

| Issue     | Private QA repository                    | Reviewed head                            | Actual qa-target after merge             |
| --------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| T-11, A=3 | alexj11324/orvilo-issue784-qa-a-20261014 | 8a5baea6ec515b8aabde9a6e7b1118ed109071e7 | c37fbd8826df31548d826333227f3046d796022b |
| T-12, B=6 | alexj11324/orvilo-issue784-qa-b-20261014 | 3b8a119d35bc32c5dc6ce5ed2f7d0c42dbffc779 | 93027b683c65aaea8f706747dc59064468b68432 |

## Current versions and automatic review

Native builders provisioned their Task workspaces, edited the exact values and strict assertions, ran real node --test, committed, pushed and created their own [A PR #1](https://github.com/alexj11324/orvilo-issue784-qa-a-20261014/pull/1) and [B PR #1](https://github.com/alexj11324/orvilo-issue784-qa-b-20261014/pull/1). H continuations reused those same workspaces, topics, branches, heads and PRs without code or document changes.

All execution and normal review used saved Agent agt_taIxMIVssPhE, OpenCode opencode/mimo-v2.6-flash-free, on the existing Owner host. Each Reviewer opened a distinct fresh native ACP session. Child current generations were 4; parent generation was 1. Canonical completion automatically entered fresh review. Both child proofs passed, then the parent started automatically while both PRs were unmerged and the children unfinished.

The parent produced TOTAL=9 from A=3/B=6 and pinned durable report docs_cTQIHQXLRd1RNGzF. Its fresh Reviewer passed against the current upstream Issue/Run/head/PR/CI references. The three current reviews contain 9+9+7 passed results with 25 real evidence entries. Exact proof, Run, operation and native-session identities are in receipts/native-versions.json.

The corrected confirmed plan had exactly two active code children and the parent artifact. Cancelled draft T-13 remained history at generation 0 with no Run; it was excluded from the delivery group.

## Item acceptance and partial delivery

Supported Owner API decisions accepted the existing 25 current results at 04:10:50–04:11:04 UTC. Fresh readback proved both PRs were still open, ready and unmerged: item acceptance alone caused no merge.

Only B PR #1 was then changed to draft. A remained ready; both heads and green CI were unchanged. An observer guard stopped **before any final-accept request** because JSON had omitted undefined optional artifact-proof fields. The original attempt marker, failure and readback are retained. Only observer JSON representation comparison was corrected; all defined proof fields and product guards remained unchanged.

The first supported parent final acceptance returned success at 04:18:09.673. The controller merged independent A at 04:18:15 and marked T-11 Done, while B stayed open/draft and the parent stayed unfinished. B's target still held value 0. This exercised a **provider readiness block, not an HTTP merge failure**.

After this partial state was verified, only B was restored to ready. One existing supported acceptance/reconciliation call returned success at 04:21:11.651. The controller merged B at 04:21:16 and completed B and the parent at 04:21:18. No observer gh merge, target push, native rerun, manual review transition, fabricated verdict or proof edit occurred.

## Verification and cold history

Each real native node --test run passed one exact-value test with zero failures; both existing CI workflows remained byte-identical. Reviewed-head CI passed for [A](https://github.com/alexj11324/orvilo-issue784-qa-a-20261014/actions/runs/38665612042) and [B](https://github.com/alexj11324/orvilo-issue784-qa-b-20261014/actions/runs/38665657086). CI also passed on the actual merged target commits: [A](https://github.com/alexj11324/orvilo-issue784-qa-a-20261014/actions/runs/38680760490), [B](https://github.com/alexj11324/orvilo-issue784-qa-b-20261014/actions/runs/38681017420).

New-process cold reads at 04:24:03 retained all three Done states, exact current proofs, accepted Run histories, 25 accepted results/evidence entries, pinned documents and cancelled T-13. Actual target contents were value 3 and value 6.

One earlier read-only pinned-document request timed out after 60 seconds. Root diagnosed a transient Clerk fetch/network path; existing-cookie health recovered before the next authorized read. No new auth, configuration, seed or restart was used. The sanitized timeout summary is preserved.

Owner Electron navigation and CmdR reload used CUA. Actual item/final decisions used supported Owner APIs; the UI acceptance button was observed, not clicked. The three PNGs are actual screenshot-only captures from that existing Owner Electron page via CDP 9284, visually inspected:

- screenshots/owner-partial.png — A Done, B waiting, parent in review.
- screenshots/owner-final-cold.png — all three Done after reload.
- screenshots/owner-final-checklist.png — accepted timestamps and disabled final controls survive reload.

All times are 2026-10-15 UTC. Manifest hashes cover this explicit safe bundle; no prepared scripts, raw API/native output, operation metadata, environment, auth files, JWTs or signed URLs are included.

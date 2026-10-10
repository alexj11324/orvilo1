# E2E canonical push verification

The preview gate requires a real E2E job on the exact PR head's push event.
Previously, the duplicate-run action could skip that push when a PR-event
sibling ran first. The PR test could pass while the gate correctly rejected
the skipped push as having no executed verification job.

Observed on PR #651 at `ee42f3f127c1321d429436fec63803ce58452be3`:
push run `38036415882` skipped Test Web App, while pull-request run
`38036404839` executed it successfully. Retrying the preview gate did not fix
the missing execution.

E2E now matches Test CI's existing owner policy: push belongs in `do_not_skip`
and `cancel_others` is false. PR deduplication remains available, and workflow
concurrency still cancels superseded runs on the same ref. The gate still
requires executed verification and is not relaxed.

The parsed-workflow regression test checks both required CI workflows. It fails
on the previous E2E configuration because push is missing from `do_not_skip`;
the fixed configuration also protects the owner from sibling cancellation.
This CI-only change adds no product behavior requiring new device acceptance.

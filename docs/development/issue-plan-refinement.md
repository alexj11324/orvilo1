# Refining a confirmed Issue plan

The human-confirmed goal, Checklist standards, repository and final target branch
remain the approval boundary. Implementation instructions and legal ordering are
Orchestrator decisions within that boundary.

The saved Orchestrator calls `orvilo-task.refineIssuePlan` through the server task
runtime. `viewTask` returns the parent plan revision, refinement revision and
current approved Checklist source Issues. The tool takes those revisions,
`addTasks` entries with a `sourceIdentifier`, implementation title/instruction,
optional assignee and existing prerequisites, and optional add/remove dependency
adjustments. It accepts no goal, Checklist, repository or target override.

The runtime binds the call to its real operation id. The service verifies that the
operation is current, belongs to the original requester, uses the saved
Orchestrator and is associated with the Issue or its source conversation. It
rechecks the requester's Agent Use permission and starts ready tasks under that
same identity. Browser callers cannot supply an actor or an approval marker.

Each new Issue copies the exact approved standards with `inheritedFrom` provenance
and the original confirmation time/person. It has no copied Run, result, evidence,
checkbox or final delivery acceptance. Actual Issue `blocks` relations retain the
existing cycle guard; the parent report depends on all current members. An
Orchestrator Activity comment records each refinement.

Affected writers must be stopped and acknowledged before their scope/dependencies
are superseded. The plan's server-owned execution scope records a minimum
generation. Old Run receipts remain readable, but cannot supply a new report or
restart after refinement. Ordinary repairs keep the frozen contract inside the
current approved generation. Device and checkout path hydration remain free to
change. Final acceptance still requires current proofs for the exact refined
membership.

A direct instruction, project/parent, Checklist, repository or final-branch edit
fails the shared execution and current-delivery proof check. New goals or standards
use draft/confirm again. Acknowledged canceled work can be replaced by a new draft
without accepting the unwanted round; previous Issues, results and receipts remain
in history, while old unfinished members and parent blockers are retired from the
active plan. An unconfirmed stop or abandoned cancellation does not grant this
permission.

# Backend issues #555–#560 verification

Final standalone implementation: `c1c1f4258d066a8500e0778ab79e177a3478bcb3`, based on
canary `21ae95cb9d5424a803bb02a6aa7612f92766070d`, 2026-10-09 UTC. PR #585 does **not**
include or depend on #491. Operation ownership extends canary's existing guard;
Issue-menu models reuse its existing `getActiveWorkspaceMembershipRole` helper.

## Real Electron acceptance

Electron **43.2.0**, actual rebuilt `apps/desktop` main/preload and Vite renderer,
Xvfb, actual Next backend, PostgreSQL 17.11 and Redis. The two disposable users
completed normal OAuth authorization, consent, handoff and PKCE exchange. Only
upstream Clerk identity used the maintained E2E fixture; no business API was
mocked. Every database write targeted the disposable local DB.

- **#557:** Selected the original pending Inbox question and entered an unsent
  answer. **Dismiss reminder** cleared the blue dot; unread count became **0**,
  pending count remained **1**. The original form and draft remained mounted.
  Reload retained the same unanswered question/card. Read-only DB assertions
  confirmed the source plugin remained `pending` and the original operation
  remained `running`; dismissal did not settle or resume it.
  [Dismissed](standalone-inbox-dismissed.png),
  [question after reload](standalone-question-retained.png),
  [assertions](standalone-inbox.txt).
- **#556:** An active second member with an explicit Agent Use grant could not
  answer the owner's operation: `FORBIDDEN`, `Operation is outside the caller
scope`. An ordinary Agent edit was also refused with `FORBIDDEN` ("You do not have
  permission to edit this resource"). [Results](standalone-member.json). Viewer template reads succeeded
  while copying was forbidden; suspension then denied template reads too.
  [Membership results](standalone-membership.txt).
- **#559:** The actual copy dialog defaults **Assignees** to checked. Normal UI
  submission retained both human and Agent assignees and both label bindings.
  **Cancel issue**, then **Reopen issue**, persisted Todo at revision 3 with no
  current topic. Database assertions confirmed **zero operations and zero
  dispatches**. The omitted-option copy API independently retained the Agent.
  [Dialog](standalone-copy-default.png), [reopened](standalone-reopened.png),
  [assertions and database counts](standalone-copy-reopen.json).
- **#558 / #559 API:** The standalone Electron client returned
  `attentionReason: needs_input` and `hasLiveExecutor: false`. Done was rejected
  by the completion trigger. Copying a source bound to an unavailable label
  returned `PRECONDITION_FAILED`. [API results](standalone-api.json). The existing router presents the Done SQL
  rejection as a generic `INTERNAL_SERVER_ERROR`; this is not claimed as a
  polished error-message path.
- **#555 limitation:** Explicit/default coordinator edit admission is covered by
  the real server-runtime regression suite. Acceptance did not run an LLM-driven
  Group Builder conversation; the ordinary Agent-edit denial is not a substitute
  claim for that conversation.
- **#560 limitation:** The OSS deployment refuses Agent share reads with
  `FORBIDDEN`, and the Marketplace catalog was empty. Safe runtime identity and
  Codex/Claude Code/legacy/default/unknown normalization are verified through
  regression tests, not claimed as populated live market/share acceptance.

PostgreSQL applied all relevant migrations, including the actual completion
trigger and live-executor function. Two historical `pg_search`/BM25 index
migrations were skipped because that extension is unavailable; full-text search
was not exercised. No live vendor Agent process was launched. Waiting-runtime
state was seeded relationally; all product reads and mutations used the real
backend.

## Quality checks

The final standalone scoped check passed **294 tests in 13 files**, including the
Agent router execution contracts. Scoped lint and normal commit hooks passed.
Membership-read regressions failed before correction (3 failures) and passed
with the shared boundary. Operation fixtures now create actual owned rows; the
foreign-operation start test confirms no runtime dispatch occurs. Copy-default
regressions failed before their change and passed afterward.

WorkQuery/input tests separately passed **60 cases**. Independent light review
of the earlier implementation found one introduced workflow-swimlane defect.
Its regression failed before correction and passed afterward; the single
independent follow-up confirmed resolution without new defects in the correction.
The fix preserves actual workflow categories while projecting `needs_input`
through attention. The later standalone membership adjustments have the targeted
regression evidence above; no additional independent-pass claim is made.

Full CI Typecheck passed at the implementation SHA. The first complete server
run exposed four caller suites whose TaskModel doubles omitted the new
`hasUnresolvedInput` read. Their normal no-pending-input fixtures now implement
that boundary, and lifecycle assertions explicitly include the persisted
`blocked` / `execution_failed` parked reason. These follow-up changes only alter
tests and evidence; the Electron-verified product code is unchanged. All **105
tests in those four suites** and scoped lint passed after the fixture correction.

Full CI remains a separate merge gate. Earlier scoped server typechecking on the
integration branch reported cross-package configuration/dependency errors; it was
not recorded as a clean typecheck.

## Decisions and provenance

The user explicitly defined **Ignore** as clearing only the Inbox blue dot and
confirmed that copying retains assignees by default without starting execution,
while reopening returns to Todo. Neither reference was presented as evidence for
archiving/deleting/canceling a pending Agent question. Astra reviewed the dismissal
semantics.

Consulted Plane `bab49bb978ccb56af1d78dec6c6d54dfe8d03c1c` and Multica
`5063fc90794f94a2b117cdf6db29ca2b96d9b5f9` for uncertain behavior. The selected #558
backend transplant comes from `8a5b9eeb5ccc1c36f4667beae90509280e61bb35` on
`codex/issue-ui-corrections`; the prototype's broader workflow admission was not
imported.

Earlier artifacts without the `standalone-` prefix are historical. Inbox/API
artifacts were produced at `9fb49405192749aae2bcb56aee448d2a52db6337`; the earlier
copy-dialog/reopen artifacts were produced at
`90d6b38da2b2efcdd1f3702a289bd8478a9c0a95`. Those branches integrated #491 and are
retained as provenance, not proof of the final standalone permission boundary.
The historical new-activity test confirmed a later event relights the blue dot
and stale dismissal returns false; the same behavior is covered by current
notification regressions.

# Backend issues #555–#560 verification

Verified implementation: `9fb49405192749aae2bcb56aee448d2a52db6337` on
`fix/backend-issues-555-560`, 2026-10-09 UTC. This evidence commit changes documentation only.

## Real Electron acceptance

Electron **43.2.0**, the actual `apps/desktop` main/preload and Vite renderer, Xvfb;
actual Next backend with PostgreSQL 17.11 and Redis. Two disposable users completed
normal OAuth authorization, consent, handoff and PKCE exchange. Only the upstream
Clerk identity fixture used the maintained E2E mock; no Issue, Agent, notification
or permission API was mocked. Every database write targeted a disposable local DB.

- **#557:** Entered an unsent answer, collapsed the global approval overlay and
  clicked **Dismiss reminder** on the selected Inbox card. The blue dot disappeared;
  unread count became **0**, pending count remained **1**. The selected original
  question and draft stayed mounted. Reload retained the same unanswered source
  question and card. Actual database reads confirmed the plugin remained pending
  and the operation remained running. [Before](inbox-before.png),
  [after](inbox-dismissed.png), [after reload](inbox-question-retained.png),
  [assertion log](electron-inbox.txt).
- **#557 concurrency:** A later activity on the same episode lit the blue dot again;
  a dismissal carrying the previous version returned false. Pending count remained
  1. [Screenshot](inbox-new-activity.png), [log](electron-new-activity.txt).
- **#555 / #556:** A second active member with an explicit Agent **Use** grant could
  neither edit that Agent nor answer the owner's operation: both returned
  `FORBIDDEN`, the latter with `Operation is outside the caller scope`.
  [Results](electron-operation-owner.json). The Group Builder's explicit/default
  coordinator boundary is separately covered by direct runtime regression tests;
  this acceptance did not run an LLM-driven Group Builder conversation.
- **#556:** Viewer template reads succeeded; copying was forbidden. After suspension,
  template access was also forbidden. [Results](electron-membership.txt).
- **#558:** The actual Task API returned `attentionReason: needs_input` and
  `hasLiveExecutor: false`. A Done write failed against the completion trigger;
  PostgreSQL reported `23514` / `tasks_done_requires_resolved_input`. The existing
  task router presents this SQL rejection as `INTERNAL_SERVER_ERROR`, so the
  refusal is verified but this path still uses a generic error message.
- **#559:** The actual copy API retained an explicitly selected Agent assignee,
  created a Todo Issue with no current topic, and copied both label bindings.
  Database reads confirmed no operation or dispatch was created. A source bound to
  an unavailable label returned `PRECONDITION_FAILED` with a clear message.
  [API results](electron-issue-results.json).
- **#560 limitation:** This OSS deployment refuses existing Agent share reads with
  `FORBIDDEN`; the feature gate was preserved. The live Marketplace query returned
  an empty catalog, so it did not prove runtime identity on a real market record.
  Typed Codex/Claude Code values, legacy/default/unknown runtime normalization and
  visitor-safe share metadata are covered by regression tests, not claimed as
  live Electron acceptance.

PostgreSQL used all relevant migrations, including the real completion trigger
and live-executor function. Two historical `pg_search`/BM25 index migrations were
skipped because that extension is unavailable in this environment; this affects
full-text search, which these acceptance cases do not exercise. No live vendor
Agent process was launched; runtime state for the waiting-question scenarios was
seeded relationally and all product reads/mutations used the real backend.

## Quality checks

Each bug was reproduced before its fix and the corresponding regression passed
with the fix. Targeted server and database runs passed. `bun run check --lint`
passed, including the normal commit hooks. The final `bun run check --test` over
12 affected test files had one pre-existing plugin lookup test hit its 5-second
network timeout; the owning Discover suite passed **16 tests** on its isolated
retry. The other affected suites passed in that unified run.

Scoped `apps/server` TypeScript checking completed with existing cross-package
configuration/dependency errors (desktop `@/modules/*` resolution, missing SPA
ambient globals and Next's `RequestInit.next` augmentation). It is **not a clean
typecheck**. The complete-repository CI typecheck remains required.

## Scope and remaining product decision

Local prerequisites: PRs #491, #536, #544, #545 and #550, not yet merged into canary
when integrated. Do not apply the implementation commit without those prerequisites.
The #558 backend transplant records source
`8a5b9eeb5ccc1c36f4667beae90509280e61bb35` from `codex/issue-ui-corrections`;
only selected backend behavior was transplanted, not the entire prototype.

For uncertain behavior, consulted Plane
`bab49bb978ccb56af1d78dec6c6d54dfe8d03c1c` and Multica
`5063fc90794f94a2b117cdf6db29ca2b96d9b5f9`.
The Inbox dismissal rule comes from the user's explicit blue-dot-only clarification,
with Astra review; neither reference was presented as evidence for dismissing a
pending Agent question through archive/delete/cancel.

**#559 remains partly pending:** neither reference establishes whether copying
should retain an Agent assignee by default or whether reopening should restore
Todo versus the previous closed-from state. The question was sent to the user.
Current defaults remain: assignee copying is opt-in; reopening uses Todo. An
explicitly selected Agent copy is proven not to start execution.

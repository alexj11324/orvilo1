# Phase 1 plan feedback

Use this template at the end of Phase 1 (see [`../PROCESS.md`](../PROCESS.md)). It
is written into the round's review notes and self-reviewed by the author against
this file's criteria — not posted to the user for approval. Match the user's conversation
language. Keep it concrete and compact: report observed state, not generic
readiness claims.

## Readiness verdicts

- **✅ Ready**: every prerequisite for the proposed run is verified.
- **⚠️ Ready with warnings**: execution can proceed; list non-blocking limitations
  and their effect on evidence or scope.
- **❌ Blocked**: execution cannot start until one or more prerequisites are
  resolved.
- **⏳ Pending**: an agent-owned check is actively being resolved and has not
  reached a final readiness verdict yet.

Always prefix the overall verdict and every Status cell with its emoji marker:
`✅ Ready`, `⚠️ Warning`, `❌ Blocked`, or `⏳ Pending`. Do not use color words or
bare status text without the marker; the table must remain scannable in clients
that do not render semantic colors.

Fix safe environment mechanics yourself before reporting. Separate remaining items
by owner:

- **Agent-owned**: dependencies, processes, ports, generated local env, seeded
  fixtures, navigation, retries, and other work possible within the task's scope.
- **User-owned**: secrets the user must supply, device/2FA approval, permissions
  only the user can grant, destructive authorization, or an unresolved product
  choice that materially changes the plan.

Never put an agent-owned item under "Needed from you." If none remain, write `None`
explicitly.

## Template

```markdown
Verification plan — Environment: <✅ Ready | ⚠️ Ready with warnings | ❌ Blocked>

Environment

| Check              | Status                                      | Observed state                                      |
| ------------------ | ------------------------------------------- | --------------------------------------------------- |
| Workspace / branch | <✅ Ready/⚠️ Warning/❌ Blocked/⏳ Pending> | <path, branch/worktree, relevant dirty-state note>  |
| Dependencies       | <✅ Ready/⚠️ Warning/❌ Blocked/⏳ Pending> | <root and selected standalone app status>           |
| Runtime / ports    | <✅ Ready/⚠️ Warning/❌ Blocked/⏳ Pending> | <resolved URLs/ports and ownership or availability> |
| Required services  | <✅ Ready/⚠️ Warning/❌ Blocked/⏳ Pending> | <DB, cache, queue, dev server—only those in scope>  |
| Auth               | <✅ Ready/⚠️ Warning/❌ Blocked/⏳ Pending> | <selected surface and verified signed-in state>     |
| Evidence capture   | <✅ Ready/⚠️ Warning/❌ Blocked/⏳ Pending> | <CDP or OS capture readiness>                       |

Execution plan

1. <Surface and entry point>
2. <Case 1: behavior → expected result → evidence>
3. <Case 2: behavior → expected result → evidence>
4. <Report and publication deliverable>

Scope and assumptions

- In scope: <what this run proves>
- Out of scope: <intentional exclusions, or None>
- Assumptions / warnings: <items that may affect interpretation, or None>

Needed before execution

- Agent will resolve: <remaining non-blocking or in-progress agent-owned work, or None>
- Needed from you: <exact user-owned prerequisite and why it is required, or None>
```

Do not include irrelevant environment rows. Add a row when the run has another hard
prerequisite, such as a native app, gateway, fixture repository, or specific
external account.

## What a planned case may be

The HARD RULE decides this: every case is a delivery outcome a person judges, and
the repo's own programmatic gates (tests, coverage, type-check, lint, build) are
never cases — a gates-only round has nothing for a person to accept. Run them as
diligence and report them as one line of narrative.

Seed a follow-up plan from the current state read off the in-app acceptance panel
on the subject's task detail page, not from memory: omit accepted checks, repair
non-stale rejects under their exact stable ids, and carry every `supersedes` chain
forward unchanged. For every user-visible
UI case, plan the screenshot or recording that proves that exact claim — program
output may supplement visual evidence but never replaces it.

## Gate behavior

The plan review is the gate, in the first round only. (It used to be a separate
**acceptance-checker** role defined by the skill's `references/acceptance-checker.md`;
that role and its document were retired with the standalone acceptance platform.
The review still happens — the author holds it — but there is no second party to
hand the plan to.) Plan/case feedback is capped at two rounds total; the second is
optional and checks revisions. On **✅ Ready** / **⚠️ Ready with warnings** (or
every material finding resolved), enter Execute. Never ask the user to approve the
plan, and never present `Start` / `Discuss first` style buttons for a routine run.

When the verdict is **❌ Blocked** on a **user-owned** item, ask the user one
structured question naming exactly that prerequisite and why it is required,
then stop. If the user resolves it, re-check the affected environment item; do
not rely only on the user's statement that it is fixed. Agent-owned blockers
are never sent to the user.

### Follow-up rounds

For a follow-up triggered by user feedback or an iteration request:

- read the current state off the in-app acceptance panel;
- silently re-check environment and auth;
- repair and re-run the affected stable check ids;
- append a new immutable round to the same Acceptance automatically (no second
  plan review — that happens in the first round only);
- do not ask the user to approve the follow-up plan.

The only reasons to ask the user in a follow-up are a user-owned prerequisite
(a secret, a device/2FA approval, a permission only they can grant, a
destructive action) or a product decision that materially changes the plan —
scope, business goal, evidence surface, or external authority. A code
revision, local server restart, fixture update, screenshot recapture, retry,
or automatic follow-up publication is never a reason to ask.

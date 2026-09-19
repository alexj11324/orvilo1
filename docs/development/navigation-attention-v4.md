# Navigation Attention v4 — N00 baseline

Research SHA: `d2c522fd8bf37448dccd86eacc6442a580d55cbd`\
Actual implementation base: `d02f13f1` (`origin/canary`, 2026-09-18; includes #81 ownership transfer and #94 hidden-surface retirement)\
Contract version: `nav-attention-v4.1`

Original execution packet (byte-identical, `SHA256SUMS` verified): [`docs/implementation/navigation-attention-v4/`](../implementation/navigation-attention-v4/). Do not edit packet files — lint-staged remark/prettier will CJK-space them and break the checksums. Session handoff for draft PR #95: [`docs/development/navigation-attention-v4-handoff.md`](./navigation-attention-v4-handoff.md). User-facing usage: [`docs/usage/getting-started/work.mdx`](../usage/getting-started/work.mdx) (EN/ZH).

This is a reuse-and-connect increment, not a rebuild. Team, notifications, InboxModal, action approvals, and event outbox already exist on canary. The gap is a unified personal work surface: event → recipient → prompt → real action → receipt, with one query contract for My Work, Views, and Team Triage.

## HEAD vs research

`d2c522f` is an ancestor of `d02f13f1`. Canary commits after the research snapshot include:

- `d15a9a27` retire the fork task-steering layer
- `24d035c2` merge PR #79
- `3f172b9a` CI quality-gate on tag promotion (#82)
- `5498a06d` consent-based ownership transfer (#81) — occupies migration **0174**
- `d02f13f1` hidden-surface retirement (#94) — `/acceptance` and `/verify` stay reserved redirects; `/settings/provider` is retired. Signed Orvilo API keys (`/settings/apikey`, `api_keys`, `TRPC_NAMESPACE_API_KEY_RULES`) are a different catalog and stay.

Notification schema is unchanged since the research SHA. Collaboration tables (`event_outbox`, `action_approvals`, `execution_grants`, `task_inputs`) are present.

## Parallel PRs (do not collide)

High overlap — do not rewrite these files except through the frozen contract:

| PR                                                                                                       | Risk                                                                                                |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| #90 ACP-only execution (P70)                                                                             | ACP approval / intervention                                                                         |
| #88 PR-first delivery review                                                                             | reviewer queue, task completion                                                                     |
| #81 ownership transfer (**merged** as `canary@5498a06d`, migration `0174_workspace_ownership_transfers`) | Inbox must call `respondOwnershipTransfer` / `cancelOwnershipTransfer`, not a second status machine |
| #84 delegated commits / live grant                                                                       | `execution_grants` consume path                                                                     |
| #76 ACP P60 browser-use                                                                                  | ACP surface                                                                                         |
| #85 workspace context                                                                                    | workspace-scoped queries                                                                            |
| #94 hidden-surface retirement (**merged** as `canary@d02f13f1`)                                          | Keep `acceptance`/`verify` reserved redirects; do not restore `/settings/provider`                  |

Low overlap: branding #93, CI #78/#82, quota #80, reconcile #89.

This branch's first schema increment is **`0175_work_attention`**. TRI02/TRI03/Inbox bulk follow as **`0176_work_attention_triage_bulk`** (`tasks.duplicate_of_task_id` + `notification_bulk_snapshots`). Do not reuse `0174`.

## Reuse inventory

| Exists                                                                                   | Connect                                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `notifications` + `notification_deliveries`                                              | versioned read (`activityVersion`/`readVersion`), resource ACL, self-organize permission             |
| leftover `InboxModal` opener + `/inbox` (WorkInbox)                                      | `/inbox` is the work inbox; leftover modal list UI is deleted so it cannot remount as a third center |
| `event_outbox` single `delivered` flag + `CollaborationOutboxProjector`                  | fan-out `event_consumer_receipts` so collaboration and notification consumers ACK independently      |
| `action_approvals`, `task_inputs`, `agent_interventions`, resource + ownership transfers | `ActionSourceRegistry` adapters; Inbox never patches notification rows to approve                    |
| `execution_grants.initiatedBy`                                                           | **My Work → 我委派** (explicit grant, not agent owner)                                               |
| `tasks.reviewerUserId` + pending approvals/interventions                                 | **My Work → 待审核**                                                                                 |
| Team API / schema / workflow / project\_teams                                            | nav + Team Triage commands; no new Team model                                                        |
| `/tasks?collection=mine&scope=assigned\|created`                                         | exact redirect to My Work tabs; other task URLs unchanged                                            |
| Agent/group/session pins, Electron pinned pages                                          | new `navigation_favorites` for typed workspace targets (not Electron tab pins)                       |

## Frozen decisions (see also DECISIONS.md in the v4 packet)

- D09: existing dispatcher + per-consumer receipts; never a second `markDelivered` racer.
- D10: per-user/scope transactional feed revision; `markAllAsRead` uses a statement snapshot.
- D14: `notification:read` / `notification:organize` (ALL-only). Spec names `notification:self:*`; two-part codes fit `PERMISSION_ACTIONS`. Viewer may organize own notifications; task/approval writes stay gated.
- Route ids: `workInbox` (`/inbox`), `myWork` (`/my-work`), `savedViews` (`/views/:viewId`). Keep Tasks/Projects/Automation.
- Pulse, Initiatives, Customers, full Cycles UI: not in this increment.
- Reviews: My Work 待审核 + Inbox action cards + task detail. No parallel code-review product.

## Writer lease (this branch)

Single implementation clone at `/workspace` on `cursor/navigation-attention-v4-a544`. Protected path `/Users/alexjiang/Desktop/vibe/orvilo1` is not used. One writer on this branch.

## Not claimed complete

N12 real Linear/GitHub/ACP installation loops stay `BLOCKED_EXTERNAL_VERIFICATION` until an approved Preview exists. Shadow dual-write is not enabled on production. Native human-approval banners click through to `/inbox` (workspace-prefixed when a slug is present), not a second chat inbox. Signed Orvilo API keys (`/settings/apikey`) stay; `/settings/provider` stays retired. Task subscribe/unsubscribe is a follow row on a readable task — not a model-provider key and not a chat mute. WorkQuery paging binds `queryHash` + the full sort tuple (VIEW06). Inbox `actionUrl` is allowlisted (SEC01). Shared view AST redacts unreadable task/project ids (VIEW02). Outgoing transfers stay on the unread badge but do not increment Needs-you (ACT08). Existing cycles can filter WorkQuery via `cycleId`, including the Team triage picker; there is no Cycles management tab (TRI07). Newer activity on a snoozed episode clears `snoozedUntil` so the card returns to the badge without extending source deadlines (NOT08). My Work / saved views load more with the bound `queryHash`. Mobile tab bar stays visible on `/my-work`, `/views`, and `/teams`. My Work assigned/delegated can switch list/board; WorkQuery groups by `workflowCategory` (or `status`) in the database with per-column totals that do not shrink when paging (WORK08). Drag uses `workAttention.moveBoard` or the existing task command / Done cascade — it does not raw-UPDATE status. **My Work → 待审核** lists tasks plus pending non-task approvals (`github_pull_request`, etc.) and never inserts a Task just to fill that list (WORK05). GitHub/Linear PR-without-task queues still have no durable product source beyond those approvals. WorkQuery `teamId` filters intersect readable teams (empty, no existence leak) and do not hide assigned work that is not team-filtered (TRI05). Built-in views `builtin:all|blocked|in-progress|review|projects` are virtual — update/delete reject, save-as copies to a private row (VIEW01). CommandMenu searches tasks/teams/projects/saved views through existing list APIs plus a thin name match, not a new FTS entity (NAV07). Inbox `decide` is source-authorized and is not gated on `notification:organize` (ACT01). Created-by-me excludes integration imports with `createdByUserId: null` (WORK03). Projectless tasks stay in My Work / Team lists; a No-project chip ANDs `projectId isNull` and does not assign a default project (WORK07). `workAttention.count` / `facet` share list ACL; private team/project names stay out of facet buckets (VIEW07). Historical Inbox titles drop when task visibility is revoked (SEC06). There is no WorkQuery export product. Historical Linear imports keep `triageStatus: accepted` so they do not flood Team Triage; live inbound still defaults to untriaged (TRI01). Triage/duplicate-only task updates emit `task.scope.changed`, not `task.requirement.changed` (TRI01/TRI08). Team first screen renders the same WorkQuery list/board as My Work (VIEW08 kernel). WorkQuery `in`/`notIn` arrays are capped; Inbox `prepareBulk` is rate-limited per user/scope (SEC08). Favorite reorder is version-CAS, not last-write-wins (NAV06).

# Navigation Attention v4 — N00 baseline

Research SHA: `d2c522fd8bf37448dccd86eacc6442a580d55cbd`\
Actual implementation base: `5498a06d577a09f733d31050ec988222161313e4` (`origin/canary`, 2026-09-18; includes merged #81 after research HEAD `24d035c2`)\
Contract version: `nav-attention-v4.1`

This is a reuse-and-connect increment, not a rebuild. Team, notifications, InboxModal, action approvals, and event outbox already exist on canary. The gap is a unified personal work surface: event → recipient → prompt → real action → receipt, with one query contract for My Work, Views, and Team Triage.

## HEAD vs research

`d2c522f` is an ancestor of `5498a06d`. Canary commits after the research snapshot:

- `d15a9a27` retire the fork task-steering layer
- `4e6b6c2d` / `6af047f0` docs
- `24d035c2` merge PR #79
- `3f172b9a` CI quality-gate on tag promotion (#82)
- `5498a06d` consent-based ownership transfer (#81) — occupies migration **0174**

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

Low overlap: branding #93, CI #78/#82, quota #80, reconcile #89.

This branch's schema increment is **`0175_work_attention`**. Do not reuse `0174`.

## Reuse inventory

| Exists                                                                                   | Connect                                                                                         |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `notifications` + `notification_deliveries`                                              | versioned read (`activityVersion`/`readVersion`), resource ACL, self-organize permission        |
| `InboxModal` + `/inbox` (currently HomeInbox chat/briefs)                                | `/inbox` becomes the work inbox; HomeInbox stays a chat-summary capability, not a third center  |
| `event_outbox` single `delivered` flag + `CollaborationOutboxProjector`                  | fan-out `event_consumer_receipts` so collaboration and notification consumers ACK independently |
| `action_approvals`, `task_inputs`, `agent_interventions`, resource + ownership transfers | `ActionSourceRegistry` adapters; Inbox never patches notification rows to approve               |
| `execution_grants.initiatedBy`                                                           | **My Work → 我委派** (explicit grant, not agent owner)                                          |
| `tasks.reviewerUserId` + pending approvals/interventions                                 | **My Work → 待审核**                                                                            |
| Team API / schema / workflow / project\_teams                                            | nav + Team Triage commands; no new Team model                                                   |
| `/tasks?collection=mine&scope=assigned\|created`                                         | exact redirect to My Work tabs; other task URLs unchanged                                       |
| Agent/group/session pins, Electron pinned pages                                          | new `navigation_favorites` for typed workspace targets (not Electron tab pins)                  |

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

N12 real Linear/GitHub/ACP installation loops stay `BLOCKED_EXTERNAL_VERIFICATION` until an approved Preview exists. Shadow dual-write is not enabled on production.

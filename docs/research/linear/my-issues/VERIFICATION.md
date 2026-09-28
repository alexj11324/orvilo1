# My issues runtime verification — 2026-09-22

Verified against repository HEAD `710ee2069b5ffc10ba1faeabef188519f05078d0` plus the task-owned uncommitted diff in this directory. The candidate was the actual Electron renderer on CDP `:9222`, workspace `ws-useragenttes`, at 1440×900 in zh-CN. The shared tab started at `/inbox` and was restored to `/inbox` after the capture.

## Maintained fixture

- Ran `workflow:seed-linear-parity` twice against the explicit local workspace `GQyFjgmp3ci2UW5k`.
- Both runs succeeded; the second reported `tasks=16 myIssues=6 milestones=4`.
- The scoped database regression exercises the real `WorkQueryModel`: Assigned groups are urgent, blocking, backlog, completed; Created returns 22 rows; tombstoned PMI rows are rejected.

## Assigned

The default My issues route rendered real data and no empty state:

| Group                            | Count | Runtime geometry             |
| -------------------------------- | ----: | ---------------------------- |
| 紧急问题 / Urgent issues         |     2 | x=245, width=1186, height=32 |
| 阻塞他人的问题 / Blocking issues |     2 | x=245, width=1186, height=32 |
| 待办 / Backlog                   |     1 | x=245, width=1186, height=32 |
| 已完成 / Completed               |     1 | x=245, width=1186, height=32 |

The row wrapper measured 44px high and full width (x=245, width=1186). The inner reusable task card remained 38px high and vertically centered inside that wrapper.

- `PMI-1` rendered before child `PMI-2`; `PMI-2` had a 20px hierarchy indent and connector.
- `PMI-3` rendered before child `PMI-4`; `PMI-4` had the same 20px hierarchy indent and connector.
- Clicking the Urgent header changed `aria-expanded` true → false and removed `PMI-1`/`PMI-2` while leaving `PMI-3` visible.
- Clicking it again changed false → true and restored both rows.

## Created

Clicking Created changed the candidate URL to `?tab=created` and rendered 22 distinct task roots: six `PMI-*` rows and sixteen `PTP-*` rows. The captured first rows were `PMI-5`, `PMI-4`, `PMI-3`, `PMI-2`, `PMI-1`, `PMI-6`, followed by `PTP-1…`, which proves the Created query order remained intact rather than being rewritten into parent-first hierarchy order.

## Quality gates

- Focused repository check: 10 files linted; 7 tests passed; one path was skipped because it has no linter.
- Independent read-only review found three issues (optional participants, Created ordering, deleted fixture rows); all three were fixed and the reviewer confirmed no remaining blocker.
- Per repository rules, no local `tsgo` was run. Remote Typecheck remains the TypeScript gate.

This is a verified Assigned slice, not whole-page parity. Toolbar filter/display replacement, per-tab display persistence, exact metadata-property parity, selected-issue details, and board interaction parity remain open and are enumerated in [BEHAVIORS.md](./BEHAVIORS.md).

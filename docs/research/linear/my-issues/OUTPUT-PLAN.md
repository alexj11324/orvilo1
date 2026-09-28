# My issues parity output plan

Captured 2026-09-22 at 1440×900.

| Item              | Value                                                                                           |         |            |            |
| ----------------- | ----------------------------------------------------------------------------------------------- | ------- | ---------- | ---------- |
| Reference         | `https://linear.app/bdiverifier/my-issues/assigned` in a dedicated authenticated Brave tab      |         |            |            |
| Candidate         | `app://renderer/ws-useragenttes/my-issues` in the shared Electron renderer                      |         |            |            |
| Feature owner     | `src/features/MyWork`                                                                           |         |            |            |
| Data owner        | `packages/database/src/fixtures/linearParitySeed.ts` for the synthetic local verification state |         |            |            |
| Research root     | `docs/research/linear/my-issues/`                                                               |         |            |            |
| Destination route | `/[workspaceSlug]/my-issues` with \`?tab=assigned                                               | created | subscribed | activity\` |

No shared navigation or route files are part of this slice. The authenticated reference contains private workspace content, so screenshots are not copied into the repository. Measurements and state transitions are recorded as derived evidence in this directory.

## Observable success

1. The synthetic local account opens Assigned with real rows, including Urgent issues and Blocking issues groups.
2. A parent and child inside an attention group render as a visible hierarchy, with the child indented and connected.
3. My issues list rows occupy the full collection width and use the reference 44px row pitch.
4. Created contains all 22 rows authored by the synthetic user: 16 `PTP-*` project tasks plus the six `PMI-*` personal-work fixtures. Project Overview separately keeps its 2/7/3/4 completed milestone fixture.
5. The seed remains idempotent and refuses collisions with unrelated rows.

## Frozen implementation slice

- Add six projectless, team-owned synthetic My issues rows to the existing local parity seed.
- Assign them to the synthetic user and derive the attention buckets through the real `WorkQueryModel` query.
- Add two real `blocks` edges and two parent-child relationships so Urgent and Blocking each exercise a hierarchy.
- Reuse the existing `AgentTaskItem`, attention query, localized group labels, and `TaskRowIndent` connector.
- Keep the existing four tabs and board data path intact.

Because My issues is a personal lens over team work, the six `PMI-*` rows also appear in Team
Issues. The maintained fixture now has 22 team rows in total, while the Project Overview fixture
remains 16 milestone-linked `PTP-*` rows.

The reference filter builder, Display options model, toolbar icon controls, per-tab display persistence, issue detail pane, and exact metadata property selection remain outside this bounded slice. Their measured contract is in [BEHAVIORS.md](./BEHAVIORS.md).

Runtime results for this slice are recorded in [VERIFICATION.md](./VERIFICATION.md).

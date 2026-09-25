# Linear parity — issue rail

Tracks how the AgentTaskDetail right-hand rail was aligned to the reference's
issue rail (`~/parity-audit/issue-list.md` items R1–R9). Reference evidence:
captured probes under `~/parity-audit/out/linear-issue-*/`.

## Verdicts

| Item                  | Reference (Linear)                                                                       | Decision                         | Result                                                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rail sections         | `Properties` / `Labels` / `Project` / `Blocked by` / `Blocking` / `Related` h3 groups    | Aligned                          | Same six groups, in the same order (Blocked by / Blocking / Related live in `TaskPrerequisites`).                                                                                                                           |
| Blocking section      | h3 "Blocking" lists issues this issue blocks; add/remove edits the _other_ issue's edge  | Added                            | `TaskDetailData.dependents` (new, server-emitted via `getDependents`) feeds the section; store `addBlocking`/`removeBlocking` invert the dependency call.                                                                   |
| Labels                | h3 "Labels" section with chips + an "Add label" affordance                               | Aligned                          | Labels moved out of the Properties grid into their own rail section: chips + trailing `+` opening the same `TaskLabelSelector`.                                                                                             |
| Assignee "Go to user" | Link opening the assignee's profile                                                      | Skipped                          | Orvilo has no user profile page (router carries only agent profiles and the user's own settings). Not implementable as a navigation row.                                                                                    |
| Project section       | Project chip + "Open project" link                                                       | Aligned                          | Chip kept; added a named "Open project" icon link. The milestone row was removed — the reference shows milestones on project pages, not in the issue rail (milestone editing still lives in the project's milestone views). |
| Section labels        | literal `<h3>` headings                                                                  | Aligned                          | Rail section labels now carry `role="heading" aria-level={3}` (keeps the existing styled `<span>` + container-query layout while exposing heading semantics).                                                               |
| Relation rows         | link row + "Remove relation" button; "+" in the section header opens the identifier form | Aligned                          | Each relation group has a header "+" (aria-label `relations.addTo` per section) toggling the form; rows keep their remove buttons.                                                                                          |
| Extra rows            | —                                                                                        | Removed where reference has none | "Set schedule" row stays (Orvilo agent domain — kept like the other agent features), but it is now visually inside Properties like before; milestone row removed.                                                           |

## Notes

- `dependents` is additive on `TaskDetailData` — older servers simply omit it
  and the rail renders Blocking/Related from `dependencies` alone.
- `relates` is symmetric in the reference: the Related group renders edges in
  both directions; removal picks the matching call by `row.direction`.
- Icon-only controls that had no accessible name now have one (`More actions`,
  "Open project", relation "+" buttons) — verified against the reference's
  accessible-name probe.

## Narrow collapse (L1/L2)

Reference probe at ≤768 px: the rail folds into a single wrapping row of chips
under the title — status, priority, assignee, project, labels, "N related" —
with no section labels or stacked groups.

| Item                | Reference (Linear)                              | Decision | Result                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Section wrappers    | no labeled groups; all triggers in one chip row | Aligned  | `railSection` / `railSectionHeader` / `properties` go `display: contents` below `TASK_DETAIL_SIDEBAR_MIN_WIDTH`, so every group's triggers join `.side`'s single `flex-wrap` flow.        |
| Property triggers   | small pills (fill background, 28 px)            | Aligned  | `propertyItem` keeps the existing pill styling (was already the narrow variant); unchanged.                                                                                               |
| Project chip        | project renders as a chip, not a full-width row | Aligned  | `railRow` is inline-flex + fill background below the breakpoint, full-width transparent row above it.                                                                                     |
| Relation rows       | relations collapse to chips ("3 related")       | Aligned  | `relatedRow` (new) wraps each issue + its remove button as an inline chip below the breakpoint; per-issue chips keep click-through and remove — one chip per relation instead of a count. |
| "+" add affordances | hover-plus in the section header                | Aligned  | The header row stays via `display: contents`, so "+" flows inline after the group's chips — adding a relation remains reachable in the collapsed layout.                                  |
| Empty-state hint    | no dangling text inside the chip row            | Aligned  | `railSectionHint` visually hides the "No prerequisite issues." line below the breakpoint (kept announced via `role="status"`) instead of showing bare text between pills.                 |
| Orvilo-only rows    | —                                               | Kept     | Agent, reviewer, workflow badge, acceptance and "Set schedule" pills stay in the chip row (agent-domain keeps, same call as the wide rail).                                               |

Verified live on the seeded parity fixture (Vite SPA on :29876 sharing the
`orvilo_linear_parity_20260922` DB, signed-in Chrome CDP :9223, commit of this
branch): at container width 658 px the rail measures `flex-wrap: wrap`,
`flex-direction: row`, `gap: 8px` in a \~100 px band under the title — 11 chips
including the `PMI-3` relation pill (task PMI-4) — while at 878 px it is the
unchanged 232 px right column (`flex-direction: column`, `nowrap`, `gap: 16px`)
with labeled sections.

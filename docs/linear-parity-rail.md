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

# My issues behavior inventory

Observed through CDP in a dedicated authenticated reference tab at 1440×900 on 2026-09-22. No reference records were created, edited, moved, or deleted.

## Tabs and click-after states

| Tab        | Click result                                                                    | Observed populated state                                                                        | Display defaults                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Assigned   | URL becomes `/bdiverifier/my-issues/assigned`; title `My issues › Assigned`     | `Urgent issues 3`, `Blocking issues 37`, then later groups below the viewport                   | List; Focus grouping; no sub-grouping; Importance ordering; completed issues Past day; Show sub-issues on; Show triage issues on; nested sub-issues Show matching        |
| Created    | URL becomes `/bdiverifier/my-issues/created`; title `My issues › Created`       | 20 issue anchors were rendered in the captured window; no group header was visible              | List; no grouping; Created ordering; completed issues All; Show sub-issues on; Show triage issues on; nested sub-issues Hide                                             |
| Subscribed | URL becomes `/bdiverifier/my-issues/subscribed`; title `My issues › Subscribed` | 20 issue anchors were rendered in the captured window; no group header was visible              | List; no grouping; Created ordering; completed issues All; Show sub-issues on; Show triage issues on; nested sub-issues Show matching                                    |
| Activity   | URL becomes `/bdiverifier/my-issues/activity`; title `My issues › Activity`     | `Today 20` was the visible group; 19 issue anchors were mounted in the captured virtualized DOM | List; My activity grouping; no sub-grouping; My activity date ordering; completed issues All; Show sub-issues on; Show triage issues on; nested sub-issues Show matching |

Rendered-anchor counts are viewport/runtime observations, not full dataset totals.

## Filter inventory

Clicking `Add filter` opens a searchable menu (`Add Filter…`) with these top-level entries, in order:

1. AI filter
2. Advanced filter
3. Team
4. Status
5. Assignee
6. Agent
7. Agent Session
8. Creator
9. Priority
10. Labels
11. Relations
12. Suggested label
13. Dates
14. Project
15. Project properties
16. Subscribers
17. External source
18. Auto-closed
19. Content
20. Links
21. Template

The nested value menus were not selected. Their presence is observed; their complete option sets remain unknown.

## Display and view mode

Every tab exposed both `List` and `Board` inside Display options. The common property controls were:

`ID`, `Status`, `Assignee`, `Priority`, `Project`, `Due date`, `Milestone`, `Labels`, `Links`, `Time in status`, `Created`, `Updated`, and `Pull requests`. Activity additionally exposed `My activity date`.

Clicking Board on Activity kept `/my-issues/activity` and replaced the list with status columns. Visible column headers included Backlog 25, Todo 6, In Progress 15, In Review 62, Done 38, and Canceled. The DOM mounted 77 issue anchors, so the captured anchors were only the loaded board window. Clicking List restored the Activity list on the same URL.

## Other click-after states

- Clicking the first Assigned group collapse control hid the three Urgent rows while keeping the group header and count. Clicking it again restored them.
- Clicking `Open details` with no selected issue produced no visible pane and left `aria-expanded="false"`. The selected-issue behavior is therefore unresolved.
- Group headers expose a create-issue button on hover/capable pointers. It was inventoried but not clicked because it begins a write flow.
- Issue rows and status/assignee controls were inventoried but not exercised on the reference because they can navigate or mutate records.

## Candidate click evidence

- Assigned loaded `/my-issues` and showed the empty text `Nothing in this list yet`/localized equivalent.
- Before this slice, clicking Created changed the URL to `?tab=created` and rendered 16 real
  `PTP-*` rows through the work-query service. The maintained seed now expects 22 Created rows:
  those 16 plus six `PMI-*` rows authored by the same synthetic user.

The post-change runtime verified those 22 Created roots and the populated Assigned groups. See
[VERIFICATION.md](./VERIFICATION.md).

- The candidate's board and filter chips are functional product capabilities, so they must not be deleted until the reference icon menus replace their reachability.

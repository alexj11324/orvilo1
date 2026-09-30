# First screenshot audit: Linear ↔ Orvilo

Observed 2026-09-26 in light theme, en-US, 1440 × 900 CSS pixels. Candidate
revision before changes: `5ed01defcea2e5fb02298419fac287c9e60035a9`
(PR #282). Exact reference and candidate screenshots are kept locally as named
in `PLAN.md`. Private Linear screenshots are not committed.

## Team overview: empty resources, one member

| Element or state                    | Linear screenshot/measurement                                                                         | Orvilo screenshot/measurement                                                                            | Verdict                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Overview / Documents / Members tabs | 28px pills at x253, x336, x431; text 12px/500                                                         | 28px pills at x352, x430, x519; text 12px/500; Electron adds 46px native chrome and 16px page top margin | Different position after chrome normalization                    |
| Team identity                       | 36px icon, 24px class title; body column begins near x349                                             | 36px icon, 24px/500 title; body text begins near x364 due 12px inner padding                             | Different horizontal spacing                                     |
| Description prompt                  | 15px/450, around y181                                                                                 | 15px/450, y235; after native chrome offset the remaining gap is about 8px                                | Different spacing                                                |
| Team resources heading              | 18px, starts x349/y236, line about 22px                                                               | 18px/500, starts x364/y328, line 28px                                                                    | Different spacing and line height                                |
| Empty resources copy                | 15px/450, x349/y272; says add documents/links and sections                                            | 13px/400, x364/y364; says resources will appear here                                                     | Different typography and copy                                    |
| Add resources                       | 28px round button x987/y233; opens New document, Existing documents, New link…                        | Absent                                                                                                   | Missing in Orvilo                                                |
| Add section                         | 28px round button x1019/y233                                                                          | Absent                                                                                                   | Missing in Orvilo                                                |
| Members rail                        | Heading at x1097/y139, avatar below                                                                   | Heading starts x1124/y201 (x1112 container), avatar below                                                | Different x after chrome offset                                  |
| Go to rail                          | Heading x1097/y216; Connect channel, Team settings, Triage, Issues, Projects, Views at 36px intervals | Heading x1124/y267; only Triage, Issues, Projects, Views                                                 | Missing two destinations; existing links are vertically too high |
| Recent issues                       | Absent                                                                                                | Absent                                                                                                   | Matched in this state                                            |

The candidate grid's first row is 141px tall although the identity and
description need about 99px. The 267px rail spans both rows, distributing
roughly 42px of extra height into the first track and pushing Team resources
down. A left-column wrapper independent of the rail would remove that gap.

The Add resources menu is a real capability, not just an icon. Current Orvilo
has no team resource relation; its Documents tab is a placeholder. A safe
document attachment must preserve workspace and private-team permissions.
The reference menu itself was opened read-only; no reference record was made.

## Workspace and team project lists: populated

| Element or state   | Linear                                                          | Orvilo                                                                                                         | Verdict                                    |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Page header action | Flat `+ New project` in the top bar                             | Filled dark `+ Create project` / `+ New project` button                                                        | Different hierarchy and copy               |
| Saved view row     | `All projects` pill plus compact view icon                      | Workspace list shows a large Search projects field; team list shows `All projects` plus full `+ New view` text | Different / extra workspace search         |
| Toolbar controls   | Three compact circular icons for filter, display and side panel | Workspace list has two small bare icons; team list adds a full `Open sidebar` button                           | Missing/different controls                 |
| Columns            | Name, Health, Priority, Lead, Target date, Issues, Status       | Same seven headings in both candidate lists                                                                    | Matched heading inventory                  |
| Name sort          | Down arrow by Name                                              | No arrow visible                                                                                               | Missing in Orvilo                          |
| Row density        | About 48px per row                                              | About 48px per row                                                                                             | Matched at this viewport                   |
| Data state         | Six workspace and three team projects                           | Five workspace and four team projects                                                                          | Unverified data semantics: fixtures differ |

The Linear workspace and team lists are distinct filtered scopes. The
candidate team route does show a subset, but different fixtures prevent a
membership-equivalence claim until a matched dataset is exercised.

## Project overview: populated but content differs

| Element or state   | Linear                                                                                     | Orvilo                                                                              | Verdict                                                          |
| ------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Top tabs           | Overview, Activity, Issues and a compact add icon                                          | Overview, Activity, Issues, Milestones                                              | Extra Milestones tab; add icon missing                           |
| Header actions     | Favorite star, more menu, link and notification icons                                      | Status pill and pin control; favorite is elsewhere                                  | Different                                                        |
| Body/rail geometry | Left content x304–989, right rail x1036–1420                                               | Same approximate columns                                                            | Matched geometry at 1440px                                       |
| Properties         | Inline summary under title plus property chips; rail repeats editable fields               | Same general regions; two date chips wrap in this fixture                           | Partially matched; content cardinality differs                   |
| Resources          | Inline `Add document or link…`                                                             | Inline `Add document or link…`                                                      | Present; behavior unverified                                     |
| Project update     | Full-width `Write first project update`                                                    | Same action appears                                                                 | Present; behavior unverified                                     |
| Milestone/progress | Reference project has no milestones; rail shows an empty call to action and progress chart | Candidate has four synthetic milestones and rail entries; no visible progress chart | Unverified milestone layout because states differ; chart differs |
| Description        | Long rich text with headings and links                                                     | Short synthetic description                                                         | Unverified content height and scrolling                          |

## Main sidebar: user override

The main rail is open in both default screenshots. Orvilo persists
`status.showLeftPanel=false`, exposes multiple collapse buttons and `Mod+[`,
and auto-collapses at narrow widths and in Portal/Goal flows. The user requires
it to start open and never collapse. This is a functional failure independent
of team accordion expansion. The width resize is a separate behavior to keep.

## States still to inspect

Hover/focus and menus on list rows, saved-view controls, project detail rail,
empty and no-match states, narrow window, dark mode, permission-denied paths,
and resource creation/readback. None is implicitly matched by this first pass.

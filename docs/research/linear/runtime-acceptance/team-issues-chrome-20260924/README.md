# Team Issues toolbar chrome — runtime acceptance (2026-09-24)

Code under test: `779847f01` (`fix/linear-parity-team-issues-chrome`, base `b29324431`).
The screenshots and numbers below were taken on a working-tree patch whose changed
lines are identical to that commit (the commit only reorders one import via lint-staged).

## Setup

|          | Reference                                  | Candidate                                                         |
| -------- | ------------------------------------------ | ----------------------------------------------------------------- |
| Surface  | Linear web, `team/ORV/all` (Board)         | Orvilo Electron dev, `teams/team_r6cxh0GBbfrI?tab=issues` (Board) |
| Viewport | 1440×900 @2x (CDP device-metrics override) | 1440×900 @2x (CDP device-metrics override)                        |
| Theme    | dark                                       | dark                                                              |
| Labels   | en-US                                      | zh-CN (app locale of the test instance)                           |
| Data     | different workspace and records            | Parity Test Team fixture                                          |

Because the records and label language differ, pill **widths** and all board content
are not compared here. Only toolbar geometry, paint and behaviour are.

Probes: `measure-toolbar.js` (candidate), `measure-reference-toolbar.js` (reference),
evaluated over CDP after two readiness checks (toolbar controls present and the
`TeamIssuesSurface` inspector path rendered).

## Geometry and paint

Offsets are measured from the top of the content panel (Linear `main` y=8,
Orvilo panel y=46 below the Electron tab bar).

| Property                   | Linear                              | Orvilo before                    | Orvilo after                        |
| -------------------------- | ----------------------------------- | -------------------------------- | ----------------------------------- |
| Scope control              | 3 separate pills                    | 1 joined Segmented               | 3 separate pills                    |
| Pill height / radius       | 28 / 9999px                         | 26 / 8px                         | 28 / 9999px                         |
| Pill font                  | 12px / 500                          | 12px / 500                       | 12px / 500                          |
| Gap between pills          | 4px                                 | 0                                | 4px                                 |
| First pill x               | 252.5                               | 265                              | 253                                 |
| First pill top − panel top | 52.3                                | 57                               | 52                                  |
| Inactive pill fill (pixel) | 28,28,28                            | transparent on segmented track   | 27,27,27                            |
| Active pill fill (pixel)   | 41,41,43                            | —                                | 38,38,38                            |
| Add-view control           | 28×28 round icon button, 14px glyph | 86.7×24 text button "+ 新建视图" | 28×28 round icon button, 14px glyph |
| Add-view accessible name   | "Add new view"                      | "新建视图" (text)                | "添加新视图" / "Add new view"       |

## Behaviour (hit-tested CDP mouse clicks, candidate)

| Click                 | Result                                                             |
| --------------------- | ------------------------------------------------------------------ |
| 待办 (Backlog)        | URL `?tab=issues&scope=backlog`; `aria-current` moves to 待办      |
| 所有问题 (All issues) | URL back to `?tab=issues`; `aria-current` moves to 所有问题        |
| Add new view          | View builder dialog opens, shared scope preset to Parity Test Team |

`elementFromPoint` at each click point resolved to the target button (or its icon).

## Remaining differences (not addressed here)

- **Different:** Linear scope pills are `<a>` links; Orvilo uses buttons with `aria-current`.
- **Different (minor):** add-view glyph grey 111 vs Linear ≈88; active pill fill 38 vs 41–43;
  inactive label 170 vs Linear ≈150; page background 13 vs 18 (global theme).
- **Unverified:** pill widths with matching locale; light theme; narrow window; hover/pressed states;
  per-column `…` / `+` board header controls.

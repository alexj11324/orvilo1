# Page audit dimensions

Apply these to the page, its detail panes and menus, and each state in its matrix. Record the exact reference and candidate routes, locale, viewport, theme, revision, and data cardinality beside the findings.

| Dimension      | Compare both directions                                                                                                                                | Primary instrument                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Page topology  | Entry points, breadcrumbs, tabs, sidebars, routes, dialogs, panels, and reachable deep links. Include controls revealed by menus and collapsed groups. | ARIA inventory, per state              |
| Data contract  | Query scope, row count, grouping, sort, filters, columns, field meanings, and parent-child relationships.                                              | Network/tRPC readback, row counts      |
| Layout         | Region bounds, alignment, widths, heights, spacing, scroll containers, sticky positions, and overflow.                                                 | Layout rules, anchor geometry          |
| Type and paint | Font family, size, weight, line height, colors, icons, images, borders, radius, shadows, and hover/focus/selected states.                              | Type-scale histogram, anchor styles    |
| Interaction    | Real click target, menus, keyboard actions, navigation destination, create/edit/delete effects, persistence, undo, and feedback.                       | Hit-tested clicks, write/readback      |
| System states  | Loading, populated, empty, no-match, error, retry, permission denied, blocked/running, and offline states where reachable.                             | State-matrix runs of the passes above  |
| Adaptation     | Narrow and wide windows, dark and light appearance, density, truncation, and keyboard or assistive-technology access.                                  | Viewport/theme runs, clipped-text rule |

## Verdicts

Every page × state × dimension carries exactly one verdict, each with its evidence (probe output, screenshot, or trace tied to the source revision):

- **matched**: observed on both sides and equivalent.
- **missing in Orvilo** / **extra in Orvilo** / **different**: an observed mismatch.
- **unverified**: not observed, or not comparable. Causes include mismatched content, a reference action that was not exercised, a control that was off-screen or hidden, or a candidate that was not the current build.

A dimension with no recorded verdict counts as unverified, so a skipped check can never pass as a clean one. Never turn lack of observation into proof that an element does not exist.

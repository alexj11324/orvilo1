# Page audit dimensions

Apply these to the page, its detail panes and menus, and each meaningful data state. Record the exact reference and candidate routes, locale, viewport, theme, revision, and data cardinality beside the findings.

| Dimension      | Compare both directions                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page topology  | Entry points, breadcrumbs, tabs, sidebars, routes, dialogs, panels, and reachable deep links. Include controls revealed by menus and collapsed groups. |
| Data contract  | Query scope, row count, grouping, sort, filters, columns, field meanings, and parent-child relationships.                                              |
| Layout         | Region bounds, alignment, widths, heights, spacing, scroll containers, sticky positions, and overflow.                                                 |
| Type and paint | Font family, size, weight, line height, colors, icons, images, borders, radius, shadows, and hover/focus/selected states.                              |
| Interaction    | Real click target, menus, keyboard actions, navigation destination, create/edit/delete effects, persistence, undo, and feedback.                       |
| System states  | Loading, populated, empty, no-match, error, retry, permission denied, and offline or disconnected states where reachable.                              |
| Adaptation     | Narrow and wide windows, dark and light appearance, density, truncation, and keyboard or assistive-technology access.                                  |

For each mismatch, cite a screenshot or DOM/interaction trace tied to the source revision. Mark a dimension **unverified** when the pair has mismatched content, the reference action was not exercised, a control was off-screen or hidden, or the candidate was not the current build. Never turn lack of observation into proof that an element does not exist.

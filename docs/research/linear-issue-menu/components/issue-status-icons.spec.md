# Issue status icons

Use the board’s actual shared renderer: useTaskWorkflowGlyph -> WORKFLOW_CATEGORY_VISUALS -> WORKFLOW_CATEGORY_ICONS. Preserve its existing ring/dash/pie fractions, colors and terminal cutouts; no new SVG set. The status property label uses existing STATUS_PROPERTY_ICON instead of a plain circle.

Read a team’s workflow-state catalog by teamId even when a local workflowStateRefId has no legacy workflowStateId. Resolve the exact local ref first; only non-null provider IDs may match remoteStateId. Never match null IDs to the first local state. The exact catalog state chooses its canonical category icon; each state remains a separate menu row in the existing board category/position order. Preserve status-write, admission, assignee and execution behavior.

Current TeamWorkflowStateItem exposes identity/name/category/position, without color or custom progress. The current board renderer has fixed category fractions (in progress .5; in review .75). No fullTeamWorkflowStates helper or independent exact-state geometry exists in this revision; extending those data/visual semantics requires confirmed source evidence instead of guessing.

Regression checks: local-only ref resolves correct label and category; the menu reads all team states without legacy ID, renders each canonical glyph and preserves same-category ordering; a team task without any state ref keeps its category label instead of selecting the first null-remote state. Scoped owning tests/lint plus collector’s real board/detail/menu icon evidence; no local tsgo or browser automation.

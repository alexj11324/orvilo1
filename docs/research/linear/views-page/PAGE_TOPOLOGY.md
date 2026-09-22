# Views detail topology

Collected 2026-09-22 from the authenticated Linear reference
`https://linear.app/bdiverifier/view/all-issues-3320169ce6ab` and the local Electron
candidate at `app://renderer/ws-useragenttes/views/builtin:all`.

## Comparable surface

The Linear screenshot is a saved-view **detail**, not the `/views/issues` directory. The
candidate directory at `/views` is therefore not a comparable route. The closest existing
candidate surface is `/views/:viewId`; `builtin:all` was used for baseline runtime evidence,
while owner-only editing must be accepted against a controlled user-owned local view.

## Reference regions at 1440 x 900

1. Header, x=244..1432, y=8..52. Title `All issues`, favorite switch, view-options menu.
2. Query toolbar, x=245..1431, y=52..96. `236 issues` at left; Add filter, Display
   options, and Close view details at right.
3. Results list, x=245..1020 with details open. Status-group header begins y=96;
   first row y=134, h=44. Closing details expands rows to x=245, w=1175.
4. View sidebar, `aside`, x=1031, y=96, w=400, h=767. It contains title,
   visibility, owner, and tabs for Assignees, Labels, Projects, and Teams.

## Candidate baseline

- `/views` renders a provenance table of five virtual built-in views. Linear
  `/views/issues` is an empty directory shell in the inspected account.
- `/views/builtin:all` renders 16 real fixture tasks but only exposes Favorite and Save as.
- The candidate has no query toolbar or details pane. `displayOptions` exists on the
  persisted saved-view record but is not consumed by `SavedViewPage`.

## Responsive reference

- 1440px: details is a 400px adjacent pane; result rows are 775px wide.
- 768px: details overlays the result list from x=384.65 with width 383.35.
- 390px: workspace navigation is hidden; details overlays from x=40 with width 350.

# Electron verification findings

Fixes for failures found while verifying the UI unification work on the Electron app in the dark theme.

- Kanban cards (the sortable wrapper) and Issue list rows show a `focus-visible` ring; home inbox topic rows are now focusable, `role="button"` and open on Enter or Space.
- Electron tab close buttons carry an accessible name. The Issue detail "Sub-issues", "Add sub-issue" and "Activity" headers are real buttons with `aria-expanded`.
- `lambdaClient` sends any query whose encoded input is larger than 1500 characters over POST. A single oversized input can never fit the batched GET budget, so it failed with "Input is too big for a single dispatch" before any request was made.
- `WorkQueryVirtualList` resolves rows from the grouped pages as well as the flat lists. Otherwise a tab whose grouping preference had not resolved yet rendered group headers and "Load more" but zero-height (null) rows.

Not changed on purpose: the sidebar team chevron already rotates (`in-data-panel-open:rotate-90` matches Base UI's `data-panel-open` on the trigger); Tailwind v4 emits the `rotate` property, so `getComputedStyle(...).transform` stays `none`. Check `.rotate` instead.

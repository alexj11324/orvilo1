# Review Overview specification

- Target: `src/features/Reviews/ReviewPullRequestPage.tsx` plus a focused Overview component.
- Evidence: authenticated Linear split Review capture at 1440 × 900, light theme, English; identical open GitHub PR in Orvilo zh-CN. Private screenshots are local at `/private/tmp/reviews-linear-reference.png` and `/private/tmp/reviews-orvilo-before.png`.
- Interaction model: tab click switches Overview/Diff; content and queue scroll independently. The top action opens its workflow. The changed-file outline is navigation to the diff, not an inline second column of patches.

## Observed structure

1. Detail context header, approximately 44 px tall: issue context, PR icon/title, additions/deletions, compact utility icons. It remains above the scrolling content.
2. Mode row, approximately 44 px: 28 px round Overview and Diff pills; the right edge holds the primary available action.
3. Overview scroll: 24 px/600 title, 12–13 px author/base/head metadata, then main Markdown description without a card border. A narrow right rail displays real Status, Checks, Branch and changed-file outline. Reference also has issue-link and reviewer controls, but Orvilo has no linked-issue or reviewer mutation contract yet; do not show fake editable controls.
4. The description and rail align at the top with a 24–32 px gap. In the 1440 px split state, detail pane is approximately 716 px wide, with fixed inner gutters; in direct standalone detail the main text expands while rail stays narrow.
5. Activity/reviews/threads follow the description. The fixed review form must leave the initial reading viewport; the action can reveal it on demand.

## State and behavior

- Loading/error/disconnected states keep the current real SWR and connect flow.
- Stale snapshot alert remains visible before any write and blocks submission until refreshed.
- Overview shows the actual head/base, GitHub check summary, and changed files; no placeholder issue association or synthetic reviewer data.
- If GitHub paginates the file list, the rail exposes a route to Diff where the existing file pager loads the remaining files.
- At narrow widths, the rail stacks below the description. The existing route back control stays available.
- Save no reference content or avatars to product fixtures. Use Orvilo semantic tokens for text, surfaces and borders.

## Unobserved

- Issue-link mutation, reviewer assignment and merge action were not exercised; no new write behavior follows from the screenshot.

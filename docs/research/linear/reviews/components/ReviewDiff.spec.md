# Review Diff specification

- Target: `src/features/Reviews/ReviewPullRequestPage.tsx` and existing `ReviewFileCard.tsx`.
- Evidence: Linear `/changes` was reached through a hit-tested CDP click on the Diff pill. Screenshot at `/private/tmp/reviews-linear-diff-real.png` is private local evidence.
- Interaction model: selecting Diff changes the visible detail mode while preserving PR identity. File headers collapse/expand; selecting a file from Overview opens this mode and scrolls to its anchor.

## Observed structure

1. The same context and mode rows as Overview.
2. One full-width file count/control strip, then file cards. The diff uses the entire detail pane; there is no persistent intermediate file-navigation pane.
3. Each file card has a compact header with filename/path and additions/deletions, followed by code diff. The reference has a Reviewed checkbox; Orvilo has no persistent reviewed-file model, so omit that control.
4. Existing Orvilo split/unified diff control, thread cards, comments, pagers, and stale-head protection remain in this mode. They must not render on Overview.

## States

- File patch unavailable: keep the existing explanation.
- Partial file/thread/check collections: keep the current load-more controls and totals.
- Review write disabled: line-comment affordances and submit action should be absent or disabled based on the server capability, while reading the diff remains possible.
- Narrow width: full-width diff remains scrollable horizontally where code requires it; header controls remain reachable.

# Reviews master-detail shell specification

## Overview

- Target: `src/features/Reviews/ReviewsPage.tsx`
- Detail target: `src/features/Reviews/ReviewPullRequestPage.tsx`
- Interaction model: click-driven selection with route persistence; independent pane scrolling
- Evidence: live authenticated Linear DOM/computed styles plus actual Electron screenshots listed in `../CANDIDATE-VERIFICATION.md`

## Measured reference geometry

### Page and panes

- Main: x 243.6, y 8.5, width 1187.9, height 855
- Master pane: width 481.5
- Detail pane: width 705.9
- Main background: `lch(97.94 0.5 282)`
- Outer border: 0.5 px; radius 12 px
- Master/detail divider: one subtle vertical border

### Master header and tabs

- Header height: 44 px
- Title: 13 px, weight 500
- Tab row height: 43.5 px
- Tab pills: 28 px high, 9999 px radius, 10 px inline padding
- Tab label: 12 px, weight 500
- Active fill: `lch(93.483 0.5 282)`

### Group and row

- Group header: 28 px high, sticky, 8 px radius
- Group label: 12 px, weight 500
- Row: 40 px high, 8 px radius
- Inner inline inset: 19 px from pane edge to row content
- Pull-request glyph: 14 px
- Title: 13 px, weight 500, single-line ellipsis
- Relative age: 13 px, weight 450, secondary text

## Candidate behavior

1. Desktop and mobile register one `reviews/:reviewId?` route element, so selecting/closing detail cannot remount the shell or discard paged queue state.
2. `WorkSurfaceSplit` gets a 482 px list width on wide surfaces.
3. The queue rows navigate with the active tab in the URL and store the exact list return path in location state.
4. The selected row exposes `data-active=true` and uses the standard tertiary fill.
5. The existing real review page is embedded. Wide embedding hides its redundant Back button; narrow detail retains Back.
6. Tablet/mobile render the list alone until selection, then a full-pane overlay. The list remains mounted below it.
7. No filter/display trigger is rendered until a real query contract exists.

## Data and lifecycle invariants

- `for-me` remains the server query for open non-draft PRs requesting this viewer.
- `created` remains the server query for the viewer's open PRs.
- Queue cursor, total and partial-state affordances remain visible.
- A disconnected GitHub account remains a connect state, not an empty queue.
- Existing detail read/write contracts, stale-head gating, operation IDs, comments, paging and review submission remain unchanged.

## Remaining gaps

- Exact Linear `For you` aggregation and group classification require server fields not present in the current queue response.
- Orvilo's existing `For me` locale key still differs from the measured `For you` label.
- Exact Linear Overview/Diff information architecture and its filter/display settings are outside this bounded shell slice.
- Reference screenshot pixels were viewed in the connector session but could not be exported to a repository path.

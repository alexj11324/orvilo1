# Saved view detail controls specification

## Overview

- Target: `src/features/SavedViews/SavedViewPage.tsx` and a page-owned details component.
- Reference: `https://linear.app/bdiverifier/view/all-issues-3320169ce6ab`.
- Candidate: `app://renderer/ws-useragenttes/views/:viewId`.
- Interaction model: click-driven popovers and a click-driven responsive details pane.

## Observable success

1. A user-owned saved view shows Add filter and Display options in a dedicated toolbar.
2. Each control opens only its corresponding subset of the existing real editor.
3. Changes remain draft state until the existing Save action succeeds; Cancel restores
   the persisted view definition.
4. A details toggle opens a 400px desktop pane and an overlay pane at narrow widths.
5. The pane uses live evaluation data: total, entity, layout, grouping, visibility,
   and available status-group counts.
6. Closing details gives the results surface the freed width and reopening restores it.

## Reference measurements

- Header controls: 28 x 28, y=16.5.
- Query toolbar controls: 28 x 28, y=60.5.
- Results/detail boundary: x=1020/1031 at 1440px.
- Details pane: 400px wide, gap/border region 11px.
- List rows: 44px high.
- Details panel cards: white surface, 1px neutral border, rounded corners.

## Implementation boundary

- Reuse `ViewDefinitionEditor`, `saveView`, conflict handling, `WorkQueryResults`,
  and the persisted saved-view service. Do not add a second query engine.
- Do not change sidebar navigation, routes, database schema, Projects, Inbox,
  My issues, Reviews, or shared WorkSurface behavior.
- Built-in system views remain read-only; owner-only editing is verified with a
  controlled local view.

## Failure conditions

- Buttons that only open inert menus.
- Candidate changes that persist before Save.
- Details derived from fixture constants rather than evaluation data.
- A narrow pane that forces horizontal page overflow.

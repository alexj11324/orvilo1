# Sidebar row affordances specification

## Overview

- User screenshot: the four favorite rows expose paired up/down chevrons;
  team rows put their disclosure chevron before the team icon. The user's
  follow-up requires Linear's inline sidebar drag behavior with no drawer.
- Target files: `src/features/HomeSidebar/Body/FavoriteRow.tsx`,
  `WorkFavorites.tsx`, `favoriteReorder.ts`, `TeamsSection.tsx`.
- Reference screenshot (private/local):
  `/private/tmp/linear-team-overview-reference.png`.
- Candidate screenshot: `/private/tmp/orvilo-team-overview-baseline.png`.
- Interaction model: favorite activation navigates; pointer or keyboard drag
  edits the inline order. Team disclosure toggles nested routes.

## Reference and user-directed structure

The Linear reference has one team row: icon, name, then one small disclosure
mark to the right of the name. The candidate team row shows its mark before
the icon. Move the indicator after the label while preserving the row's
keyboard and click disclosure behavior. Child Home/Triage/Issues/Projects/
Views rows remain nested and keep their current routes.

The reference screenshot has no favorite records, so no populated favorite row
can be claimed visually matched from that capture. The user explicitly rejects
the candidate's always-visible up/down pair and the separate management drawer.
Remove both. Render every favorite inline and make each row sortable with
pointer and keyboard sensors. Retain unpin and ordinary click navigation; a
drag release must not activate the row link. The context menu keeps Move Up and
Move Down as an accessible fallback.

## Appearance

Normal sidebar rows keep their current 28px rhythm, icon size, text color and
hover surface. No new accent. Team name truncates when long; indicator remains
visible after the visible name. The Favorites header has no management action
or overflow row.

## States and verification

- Default: no up/down pair visible on favorite rows; team indicator follows
  icon/name on the right.
- Hover/focus: favorite unpin and team menu are reachable without occlusion.
- Click/keyboard: team disclosure still expands/collapses; an ordinary
  favorite click navigates; pointer and keyboard reorder survive reload.
- Drag release: reordered row does not navigate.
- Empty Favorites: section stays mounted with an empty panel.
- Narrow and dark: same ordering and theme tokens; no duplicate marks.

Use existing tests for favorites and team nav, adding focused regressions for
full-list ordering and the drag-release navigation guard. Validate the pointer
drag and persisted order in Electron before pushing.

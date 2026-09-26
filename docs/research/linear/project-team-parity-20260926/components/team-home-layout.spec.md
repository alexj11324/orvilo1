# Team Home Overview layout and type specification

## Overview

- Target: `src/features/WorkTeams/TeamHome.tsx`,
  `src/features/WorkTeams/home/TeamHomeTabs.tsx`,
  `src/features/WorkTeams/home/TeamHomeOverview.tsx`.
- Reference screenshot (private, local):
  `/private/tmp/linear-team-overview-reference.png`.
- Candidate screenshot: `/private/tmp/orvilo-team-overview-baseline.png`.
- The menu state is in `/private/tmp/linear-team-add-resources-menu.png`.
- Interaction model: page tabs and rail links are click-driven; description
  remains the existing editable control. Resource controls are a separate
  capability specified below.

## Comparable state

Both pages use light theme, English, 1440 × 900 CSS pixels and a one-member
team with an empty resource section. Linear has one team and Orvilo has two;
sidebar content counts therefore differ. Electron has 46px of native chrome;
vertical comparisons subtract that chrome before judging page content.

## DOM and layout

Linear: header row, full-width tab row, then a centered two-column overview.
Tabs start x253 (8px inside the content area) at y60. The body starts around
x349 with a left content column and a right rail at x1097. The 36px team icon
and 24px title share one row; description follows; Team resources begins at
x349/y236. The rail shows Members and then Go to. The page itself scrolls.

Orvilo baseline: `TeamHome.page` centers a 972px wrapper containing both tabs
and body, so tabs start x352/y123. Keep the body centered but move tabs to the
full page width with 8px inline padding. Remove the page's 16px top margin:
after subtracting the Electron chrome, the tab top is then within 1px of
Linear. Keep the 28px pill height and 12px/500 label. Set tab gap to 8px
(Linear) from current 4px.

The existing Overview grid spans the rail over two auto-sized rows. At this
state the first row is 141px while its content needs about 99px, injecting
roughly 42px before Team resources. Put identity/description and resources in
one natural-height left column beside the rail so the rail cannot stretch the
internal spacing. Keep the body's starting x around 352, reduce the main grid
column from 712px to about 700px, and keep 48px gap plus 212px rail. Remove
12px inner padding on identity/description/resource title and copy; visible
text should start within 3px of Linear's x349.

## Computed text and paint

| Element              | Linear measured                 | Candidate baseline      | Target                                              |
| -------------------- | ------------------------------- | ----------------------- | --------------------------------------------------- |
| Tab labels           | 12px, 500, 28px pill            | same size/weight/height | Keep                                                |
| Team title           | about 24px, full ink, 36px icon | 24px/500, 36px icon     | Keep, align x/y                                     |
| Description prompt   | 15px/450, line 23px             | 15px/450, line 23px     | Keep type; increase margin after identity about 8px |
| Team resources title | 18px/500, line about 22px       | 18px/500, line 28px     | Set line about 22px                                 |
| Empty resources text | 15px/450, line 23px             | 13px/400, line 20px     | 15px/450, line 23px                                 |
| Rail headings        | 13px/500, muted ink             | 13px/500, tertiary ink  | Use description ink token and align left edge       |
| Rail links           | 13px/500, 36px row rhythm       | 13px/500, 36px rhythm   | Keep type/rhythm, align with rail                   |

Use `cssVar` theme tokens for colors; do not hardcode Linear's LCH values.
The empty copy's meaning should mention documents, links and sections, as
the reference does, with en-US/zh-CN authored together.

## States and behavior

- Default: both columns present, no Recent issues block.
- Hover/focus: tabs and rail links retain their current focus behavior; audit
  screenshots after CSS changes. Resource menu state belongs to the resource
  capability spec.
- Error/loading: preserve current member skeleton and retry affordance.
- Narrow 390px: rail reflows inline after description as existing container
  query intends; the pinned global sidebar may leave little width. Capture
  and report any obstruction before changing breakpoint behavior.
- Dark mode: same tokens and structure; capture after implementation.
- Persistence: tab URLs preserve the `section` query parameter.

## Verification

Take a new Electron screenshot at 1440 × 900 and compare every named element
above to the reference screenshot, including x/y, font and visible copy.
Check the tabs with real hit-tested clicks and URL readback. Run existing
Team Home scoped tests plus lint. Pure CSS assertions that simply mirror a
stylesheet string are not needed; a real layout probe measures bounds.

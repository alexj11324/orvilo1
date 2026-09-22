/**
 * One visual spec for the milestone diamond, shared by the overview body
 * (`Workspace/ProjectDashboard`) and the right-hand rail
 * (`Layout/ProjectSidePanel`). Milestones render on both surfaces at once, so
 * two local copies of these numbers drift apart the moment one is touched —
 * which is exactly how the rail ended up at 12px while the body sat at 14px.
 *
 * Linear draws the glyph in its own brand indigo — measured on the reference
 * (2026-09-22) as `stroke: #5e6ad2`, `fill: #505ec4`. This is a **borrowed
 * brand colour, not an Orvilo one**: antd has no semantic for it (`success |
 * processing | error | warning` is the whole set), so the previous
 * `cssVar.purple` was standing in — and rendering the wrong hue entirely.
 * Measured on the candidate, that token resolves to `#bd54c6`, a **magenta**;
 * the reference's is a blue-leaning indigo. That is a hue difference, not a
 * shade difference, so no amount of lightening or darkening closes it. (The
 * token's own comment used to claim antd purple-6 `#722ED1`; the palette in
 * this app is customised, so the claim was simply wrong.)
 *
 * A literal is correct here for the same reason as
 * `AgentSidebar/Topic/List/Item/metaCardData`'s `MERGED_PURPLE`: there is no
 * token to read. The glyph paints in the stroke colour for both `color` and
 * `fill`, so the reference's slightly darker fill is not split out — one
 * constant keeps the revert to an Orvilo palette colour a one-line edit.
 */
export const MILESTONE_ICON_COLOR = '#5e6ad2';

/** Reference glyph box, measured with `getComputedStyle` on the reference. */
export const MILESTONE_ICON_SIZE = 16;

/**
 * In-page landing spot for a milestone. The overview row carries this as its
 * `id`, and the overview glyph is the only thing that points at it — the rail
 * row navigates to the project's issues instead, and never renders on a tab
 * that shows the overview.
 */
export const getMilestoneAnchorId = (milestoneId: string) => `milestone-${milestoneId}`;

/**
 * Bring a milestone's row into view.
 *
 * The reference wraps the overview glyph in
 * `<a href="…/overview#milestone-<id>">`, but **what that link does when clicked
 * was never observed** — the reference was only read, never clicked. So this is
 * not a reproduction of the reference's landing effect; it is the smallest
 * provable one: in-page positioning onto the row that owns the anchor.
 *
 * The scroll is driven from the click instead of left to the browser's fragment
 * navigation. The candidate is a react-router SPA, where a bare `#…` href is a
 * URL update that a router is free to treat as a navigation rather than a
 * scroll; the address is still the real `href`, so the link stays copyable.
 * Driving it in JS is also how this repo already moves to an in-page anchor
 * (`Acceptance/Viewer/Comments/anchor.ts`, `SettingsSearch/anchor.tsx`).
 */
export const scrollToMilestoneAnchor = (milestoneId: string) => {
  const target = document.getElementById(getMilestoneAnchorId(milestoneId));
  if (!target) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
};

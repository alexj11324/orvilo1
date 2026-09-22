import { cssVar } from 'antd-style';

/**
 * One visual spec for the milestone diamond, shared by the overview body
 * (`Workspace/ProjectDashboard`) and the right-hand rail
 * (`Layout/ProjectSidePanel`). Milestones render on both surfaces at once, so
 * two local copies of these numbers drift apart the moment one is touched —
 * which is exactly how the rail ended up at 12px while the body sat at 14px.
 *
 * Linear draws the glyph in purple (measured `fill: lch(42.969% 59.31 288.43)`,
 * `stroke: lch(48% 59.31 288.43)` on the reference, 2026-09-22). antd's status
 * semantics only cover `success | processing | error | warning`, none of which
 * is purple, so this uses the palette token the repo already reads as its
 * violet marker — `cssVar.purple` (antd purple-6, `#722ED1` in light mode),
 * the same one `components/ExecutionStatus` uses for its violet states.
 *
 * Deliberately not `cssVar.colorPrimary`: that token follows the user's
 * appearance setting, which would make a milestone change colour per user.
 */
export const MILESTONE_ICON_COLOR = cssVar.purple;

/** Reference glyph box, measured with `getComputedStyle` on the reference. */
export const MILESTONE_ICON_SIZE = 16;

/**
 * In-page landing spot for a milestone. The overview row carries this as its
 * `id`; the rail links to the same string. Only the overview row owns the id —
 * the rail renders on every project tab, so an id there would either duplicate
 * the row's or point at itself.
 */
export const getMilestoneAnchorId = (milestoneId: string) => `milestone-${milestoneId}`;

/**
 * Bring a milestone's row into view.
 *
 * The reference wraps the glyph in `<a href="…/overview#milestone-<id>">`, but
 * **what that link does when clicked was never observed** — the reference was
 * only read, never clicked. So this is not a reproduction of the reference's
 * landing effect; it is the smallest provable one: in-page positioning onto the
 * row that owns the anchor.
 *
 * The scroll is driven from the click instead of left to the browser's fragment
 * navigation. The candidate is a react-router SPA, where a bare `#…` href is a
 * URL update that a router is free to treat as a navigation rather than a
 * scroll; the address is still the real `href`, so the link stays copyable.
 * Driving it in JS is also how this repo already moves to an in-page anchor
 * (`Acceptance/Viewer/Comments/anchor.ts`, `SettingsSearch/anchor.tsx`).
 *
 * The rail calls this too. It only resolves on Overview — the rail itself is
 * mounted on every project tab, and none of the others render the row.
 */
export const scrollToMilestoneAnchor = (milestoneId: string) => {
  const target = document.getElementById(getMilestoneAnchorId(milestoneId));
  if (!target) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
};

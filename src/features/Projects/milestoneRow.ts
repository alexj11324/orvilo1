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

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
 * **The glyph is two-tone, so the paint is one object rather than two
 * constants.** The reference fills the diamond `#505ec4` and draws its outline
 * in the lighter `#5e6ad2`; drawn from separate constants, the fill can
 * silently collapse onto the stroke value and the diamond renders flat — which
 * is exactly what it did (both at `#5e6ad2`) until the two layers were read
 * apart. The candidate's `svg` carries the paint as inherited attributes, so
 * the reference's `fill="none"` + painted `path` shape is *not* reproduced;
 * comparing the two by the `svg`'s own `fill` reads as "none vs #5e6ad2" and
 * mistakes a difference in technique for a difference in colour.
 *
 * A literal is correct here for the same reason as
 * `AgentSidebar/Topic/List/Item/metaCardData`'s `MERGED_PURPLE`: there is no
 * token to read. Both surfaces spread this one object, so the revert to an
 * Orvilo palette colour stays a one-line edit. `color` (the stroke, as
 * `Icon` names it) is the lighter of the pair; `fill` is the darker.
 */
export const MILESTONE_ICON_PAINT = {
  color: '#5e6ad2',
  fill: '#505ec4',
} as const;

/** Reference glyph box, measured with `getComputedStyle` on the reference. */
export const MILESTONE_ICON_SIZE = 16;

/**
 * In-page landing spot for a milestone. The overview row carries this as its
 * `id`, and the overview glyph points at it. The rail also appears beside
 * the overview; its row is not a navigation target. Of the two issues
 * affordances, the overview progress link opens the milestone-filtered list
 * while the rail's hover-only See issues opens the project's unfiltered
 * issues — the same split the reference was measured with.
 */
export const getMilestoneAnchorId = (milestoneId: string) => `milestone-${milestoneId}`;

/**
 * Bring a milestone's row into view.
 *
 * The reference wraps the overview glyph in
 * `<a href="…/overview#milestone-<id>">`. With only read-only evidence,
 * in-page positioning was the smallest provable implementation. Later CDP
 * clicks reached the reference target but were canceled by its draggable
 * row, so the landing effect remains unresolved. That observation does not
 * justify removing the candidate's working anchor behavior. The separately
 * observed progress link now opens issues filtered to the milestone.
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

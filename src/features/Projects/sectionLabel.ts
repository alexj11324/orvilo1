import { cssVar } from 'antd-style';

/**
 * The one de-emphasised tone for a label that names a project section.
 *
 * Linear paints every section label in a single muted step — measured
 * `#5c5c5e` on the reference (2026-09-22, light mode). The candidate had grown
 * several different greys for that one semantic, wrong in both directions:
 * `#999999` on the overview's `Properties` / `Resources` headings (too light —
 * that is the placeholder tone) and body ink `#080808` on the `Description`
 * label and the `Milestones` heading (too dark).
 *
 * `cssVar.colorTextSecondary` is that tone here. It is **not** antd's stock
 * `rgba(0, 0, 0, 0.65)`: this app runs a customised palette, so the value was
 * read out of the app's own theme pipeline rather than assumed — the same
 * `createLobeAntdTheme` + `theme.getDesignToken` pair
 * `layout/GlobalProvider/AppTheme` hands the provider. It resolves to
 * `#666666`, ΔE 4.2 from the reference's `#5c5c5e`; the two greys it replaces
 * sit at ΔE 24 (`colorTextDescription`, `#999999`) and ΔE 37 (`colorText`,
 * `#080808`).
 *
 * A literal `#5c5c5e` would be marginally closer, but it would be a
 * light-mode-only number: the reference was only measured in light mode, and
 * the token keeps the label right in dark mode where a frozen hex would not.
 * Revisit only with a dark-mode reference measurement in hand.
 */
export const MUTED_LABEL_COLOR = cssVar.colorTextSecondary;

/**
 * Full spec for a section label at the reference's third text step:
 * 13px / 500 in the muted tone above. Every project section label spreads this
 * object, so none of them can drift to a private grey again.
 *
 * Size and weight are part of the spec rather than decoration: the overview's
 * `Milestones` heading had drifted to 15px / 600 — body-title scale — while
 * the labels beside it stayed at 13px / 500.
 */
export const SECTION_LABEL_PROPS = {
  color: MUTED_LABEL_COLOR,
  fontSize: 13,
  weight: 500,
} as const;

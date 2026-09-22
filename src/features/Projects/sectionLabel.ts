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
 * read out of the app's own theme pipeline rather than assumed. A token's real
 * rendered value needs no browser — run the same two calls
 * `layout/GlobalProvider/AppTheme` hands the provider (`neutralColor` and
 * `primaryColor` are both unset there, so the seed carries neither):
 *
 *     const cfg = createLobeAntdTheme({ appearance: 'light', neutralColor: undefined });
 *     const tok = theme.getDesignToken({ algorithm: cfg.algorithm, token: cfg.token });
 *     // colorText #080808 · colorTextSecondary #666666 · colorTextDescription #999999
 *     // colorTextTertiary #999999 · colorTextQuaternary #bbbbbb · purple #bd54c6
 *     // colorWarning #ee9e0b · colorInfo #0072f5 · colorSuccess #379d4a
 *
 * (`@lobehub/ui/es/styles/theme/antdTheme.mjs` + `antd`'s `theme`.) Three of
 * those reproduce live CDP measurements on the running candidate exactly —
 * `#080808`, `#999999` and `#bd54c6` — which is why this counts as a
 * measurement and not an inference.
 *
 * `colorTextSecondary` resolves to `#666666`: ΔE 4.2 from the reference's
 * `#5c5c5e`, against ΔE 24 for `colorTextDescription` (`#999999`) and ΔE 37
 * for `colorText` (`#080808`). Use ΔE, not sRGB distance — the same pairs are
 * 16 / 105 / 147 in sRGB, which ranks them the same way here but overstates
 * the winner badly enough to pick wrong elsewhere in the dark end.
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

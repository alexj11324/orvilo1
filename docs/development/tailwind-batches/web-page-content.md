# Web page content cards: Tailwind migration

Tracking: #577.

Migrate the crawler loading and result cards to Tailwind while preserving the DOM, loading/error/success branches, copy action, tool navigation and external links. Keep 360px sizing, 136px loading height, 12px card radius, exact typography and logical padding.

Loading text uses the existing shared shimmer class with Tailwind two-line clamping. The shared shimmer does not set display or overflow, so the clamp remains independent. Shared animation and reduced-motion rules remain unchanged.

Remove unused result-card style entries (no references in the module). Remove the two footer `!important` declarations: their consumers are plain divs with only flex/gap classes, no competing local component styles. Keep inherited line height explicitly.

Retained variables: `--ant-color-text-tertiary` and `--ant-color-fill-quaternary`, pending semantic mapping by the frontend owner in #577. No new tokens or dependency. Global cascade remains OFF. Portal content/link styles remain separate work.

Scoped lint and independent review are recorded in the PR; no source-string CSS tests. 未做真机验证: no Electron light/dark visual parity is claimed.

`skeleton: no-change`

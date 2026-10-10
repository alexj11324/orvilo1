# Knowledge tool: Tailwind migration

Tracking: #577.

Remove all five direct antd-style imports from the knowledge-base tool's presentation modules. Preserve DOM, streaming/loading/result branches, relevance calculations, translations, filename rendering and error presentation. MaterialFileTypeIcon and shared highlight/shimmer dependencies remain.

Keep 360px cards, 6/8/12px radius roles, inherited font metrics, logical spacing, and the existing 0.2s all-property transition. The badge remains a pill. Preserve the original elevated-surface color-mix expressions (90%/85% with white) exactly, including next-themes selection; this does not introduce a new color value or theme mechanism. Preserve existing shadow variables pending semantic migration.

File preview's Tailwind padding/radius/line-height now override its earlier utilities through cn, matching the previous unlayered styles. Remove unused filename/mobile/description/icon style entries and footer !important on plain divs.

Retain exact tertiary/description text, quaternary fill, elevated surface and secondary/tertiary shadow variables; frontend owner tracks mapping in #577. No dependencies or global cascade changes.

Scoped checks and independent review are recorded in the PR. Pure style changes add no source-string tests. 未做真机验证: no Electron light/dark visual parity is claimed.

`skeleton: no-change`

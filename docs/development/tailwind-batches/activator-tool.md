# Activator tool: Tailwind migration

Tracking: #577.

Remove three direct antd-style imports from activator tool presentation modules. Preserve DOM, source-specific labels, streaming/loading branches, requested/activated tool fallback, missing-tool warning and tooltip, avatar rendering and Markdown content.

Preserve existing chip/pill geometry, wrapping, truncation, logical spacing and inherited line heights. Use exact card, sidebar-border, accent and warning theme aliases. Keep the original skill description-color variable pending frontend owner mapping in #577. Markdown/SkillsIcon/shared inspector/shimmer dependencies remain. No global cascade or dependency changes.

Scoped checks and independent review are recorded in the PR. No source-string tests for pure style migration. 未做真机验证: no Electron light/dark visual-parity claim.

`skeleton: no-change`

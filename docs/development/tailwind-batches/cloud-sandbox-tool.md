# Cloud sandbox tool: Tailwind migration

Tracking: #577.

Remove four direct antd-style imports from cloud sandbox inspectors/renderers. Keep the same DOM, streaming and success/error conditions, stdout/stderr rendering, copy controls and download/fallback logic. Preserve logical start padding and negative block-end icon margin. Success and error colors use exact existing semantic variables. Preserve icon font size with inherited line height.

Shared FilePathDisplay, inspector and shimmer styles remain dependencies; this batch does not remove their providers. No new tokens, dependencies or global cascade changes.

Scoped check and independent review are recorded in the PR. No source-string tests for pure styles. 未做真机验证: no Electron light/dark visual-parity claim.

`skeleton: no-change`

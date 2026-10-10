# Web search portal: Tailwind migration

Tracking: #577.

Migrate three portal presentation modules: crawled page content and ordinary/video search result cards. Preserve DOM, desktop link interception, video expansion, preview/raw switching, copying and all error/content branches.

Preserve 6px and 8px radius roles, inherited line height, typography, logical margins and truncation. Remove redundant flex display on clamped video titles/descriptions: their old unlayered `display: -webkit-box` already won against the utility. Remove competing muted-foreground class where the original generated description color won. These changes preserve the existing computed intent; no new layout is introduced.

Remove unused style definitions and page-content margin/text `!important`: direct consumers are plain divs without competing component classes. Base link reset is layered; no global cascade flag changes.

Retain exact `--ant-color-link`, `--ant-color-text-description`, `--ant-color-text-tertiary`, `--ant-color-text-quaternary` and `--ant-color-fill-quaternary`, pending frontend owner mapping in #577. Markdown remains a shared LobeHub dependency; no claim of removing the full dependency graph.

Scoped check and independent light review are recorded in the PR. No source-string tests for pure styling. 未做真机验证: no Electron light/dark visual-parity claim.

`skeleton: no-change`

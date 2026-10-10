# Skills tool: Tailwind migration

Tracking: #577.

Remove the skills tool's six direct antd-style imports from its inspectors and renderers. Preserve DOM, label-source resolution, streaming/loading/result branches, script-running state, code/Markdown rendering and copy controls. Keep logical padding/margins, negative status-icon offset, dimensions, typography and pill appearance.

RunSkill uses the existing 12px overlay radius, card/sidebar-border roles and inherited line heights. ExecScript success/error SVG colors use exact existing semantic variables. The shared inspector and shimmer classes remain opaque; cn is not asked to merge two competing generated classes.

Retain `--ant-color-text-description` on the skill icon pending frontend owner mapping in #577. Markdown, SkillsIcon and shared styles remain dependencies. No new dependency or cascade switch change.

Scoped check and independent review are recorded in the PR. No source-string tests for pure styling. 未做真机验证: no Electron light/dark visual-parity claim.

`skeleton: no-change`

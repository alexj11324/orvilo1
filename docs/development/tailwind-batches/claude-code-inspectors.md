# Claude Code tool inspectors

Sixteen Claude Code Inspector files remove direct antd-style imports. Local
flat styles become Tailwind utilities and conditional class composition uses cn.
Shared inspector/shimmer classes remain unchanged. ToolSearch keeps its baseline
alignment through an inline public style because the shared root still sets
center alignment in an unlayered rule.

Chip sizing, exact 999px radii, logical margins, monospace text and 240ms ring
transitions remain. Semantic foreground/fill/status roles use their existing
variables; description, tertiary, quaternary and error-background roles retain
exact legacy variables pending shared theme migration. The existing branded
icons remain for the later LobeHub component migration.

Tool arguments, fallback labels, streaming conditions, metrics, task summaries
and worktree state resolution are untouched. No tool execution code changes.
Scoped checks and independent review are recorded on the PR. 未做真机验证；no
visual parity or Electron acceptance claimed. No source-string tests are added.

The scoped check retains one pre-existing react-hooks/exhaustive-deps warning
in TaskInspector: its fallback items array is recreated per render. The relevant
expression and memo are unchanged by this style migration.

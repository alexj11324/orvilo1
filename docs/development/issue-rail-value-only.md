# Issue properties rail: value-only rows

Rows in the issue properties rail show only the value control, which carries its own glyph and placeholder ("Add assignee", "No priority"). The field name is kept as the row's accessible name (`role="group"` with `aria-label`) and as a hover title, instead of a separate 120px label column. The relation fields (Blocked by, Blocks, Related) no longer print filler "None" text when empty; their add button stays.

This matches the value-only rail on the `codex/issue-ui-corrections` branch. That branch also hides empty due-date and schedule rows behind a properties setup modal, which is not part of this change.

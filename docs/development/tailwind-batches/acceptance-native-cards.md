# Acceptance native cards

Continues #577 in the delete-confirm facts table, shared criterion list/row and run-result card. Three sources remove antd-style; DOM, keyboard handlers, required-toggle behavior, deletion/purge logic, verdict lookup and request/store flows are unchanged.

Delete facts retain their auto/1fr grid, 4px/14px gaps, 10px/12px padding, legacy large radius, quaternary background and 13px tabular text. Existing descendant dt/dd selectors become Tailwind variants without moving nodes.

A stable local acceptance-criterion-row marker preserves adjacent-row-only separators. The first row after a group heading still has no separator. Rows retain 10px/12px padding and quaternary hover; caller classes remain supported. Goal creation's existing scroll/max-height override stays effective.

Run results retain the existing 16px radius, secondary borders, exact failed-border token, 13px/1.7 body, 12px/1.5 subline and existing header/footer spacing. Status fills use existing semantic aliases; active-status text keeps exact legacy variables. No new tokens, animations or global cascade changes.

Validation: scoped check and selected related tests, normal hooks and one independent light review. No source-string tests for style substitutions. 未做真机验证；no Electron visual parity or mobile runtime acceptance claimed.

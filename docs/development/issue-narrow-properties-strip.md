# Issue detail: properties above the description in narrow panes

The properties and project controls are mounted once, ahead of the description in DOM order. In a narrow task-detail container (< 720px) they wrap into a single pill strip under the title instead of landing at the bottom of the page; in a wide container the same controls form the sticky right rail. Empty optional rows (Labels) are `data-wide-only` and appear only in the rail. The relation group headers no longer reference style keys removed with the label column.

Adapted from the layout on the `codex/issue-ui-corrections` branch; its properties setup modal and relation/resource modals are not part of this change.

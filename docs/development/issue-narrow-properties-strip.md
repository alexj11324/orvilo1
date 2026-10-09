# Issue detail: properties above the description in narrow panes

The properties and project controls are mounted once, ahead of the description in DOM order. In a narrow task-detail container (< 720px) they wrap into a single pill strip under the title instead of landing at the bottom of the page; in a wide container the same controls form the sticky right rail. Empty optional rows (Labels) are `data-wide-only` and appear only in the rail. The relation group headers no longer reference style keys removed with the label column.

Adapted from the layout on the `codex/issue-ui-corrections` branch; its properties setup modal and relation/resource modals are not part of this change.

Unset properties keep a leading 16px placeholder icon so the empty row still reads like Linear: an unassigned Assignee shows the dashed `UnassignedAssigneeIcon` (reused from the Codex branch approach), No priority keeps its own priority glyph, Due date a calendar, Labels a tag, Reviewer a user-check and Schedule a clock, all in the `propertyPlaceholder` color. Set values render their own avatars and glyphs instead; row height stays 28px.

The agent assignee now lives in the properties (an "Agent" row with a 16px runtime avatar and no border), replacing the pill under the title. The two round copy buttons above the properties are gone: the header overflow menu already offers Copy ID, Copy link and Copy branch.

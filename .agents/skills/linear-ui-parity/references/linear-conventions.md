# Verified Linear conventions

Behaviors confirmed against live Linear during parity work. Apply them without re-deriving; if live Linear now differs, re-verify and update the entry rather than following it blindly. Each entry names where it was established.

## Dates

- The current year is omitted; other years are shown. Chinese uses the full form, `M月D日` in the current year and `YYYY年M月D日` otherwise, never a bare `12月1`. Reuse `time.formatThisYear` / `time.formatOtherYear` through `formatTaskItemDate`. (PR #239)
- No ISO dates in the UI. Milestone chips and rail rows format through the same helper.
- A date field's calendar glyph stays visible on hover. Clearing a date is an action inside the picker popover, not an inline clear button on the row. (PR #239)

## Issues

- The issue rail has one Status row: the workflow state, which is the board column. Orvilo's execution lifecycle (queued, running, awaiting review) does not get its own row; it appears only in that row's tooltip. (PR #241)
- A status glyph appears once per row, and it is the same glyph the board and group headers use for that state. (PRs #227, #240)
- The Team Issues list groups by workflow state by default, matching the board. (PR #240)
- Every rail property row fills the rail width and is left-aligned in every state, including disabled or running. (PR #241)

## Projects

- The project header, breadcrumb, and rail show the project's icon; a project without one shows the box glyph on a transparent background, not a letter avatar. (PR #238)
- Overview body text sits one ink step below headings (about 88% of the text color); headings keep full ink. Milestone names are weight 600. (PR #238)

## Copy

- Distinct workflow states need distinct labels in every locale. In zh-CN, backlog is 待办 and todo is 待处理；a test asserts the labels are unique. (PR #241)

# Activity composer controls — observed reference slice

## Scope and provenance

Reference: the existing authenticated Linear project Activity reached by clicking
`Write first project update` from Overview on 2026-09-22. Candidate: actual Electron
at `app://renderer/orvilo-dev/project/wave-2-verify-project/activity`, source
`a3b882ea`, plus unrelated Dependencies worktree edits. Existing owners are
`src/features/Projects/Updates/index.tsx` and `ProjectUpdateEditor.tsx`; no new
route, global theme, or domain replacement is authorized by this spec.

CDP screenshots were opened locally at `/tmp/orv-update-state-9222.png` and
`/tmp/orv-update-state-9223.png`. Reference viewport was 1600 × 1002; candidate
was 1366 × 864. These prove observed composition, not equal-viewport pixel parity.
Private captures remain local. Raw structural measurements are in
`/tmp/orv-composer-metrics-9222.json` and contain only product control labels/styles.

## Observed interaction and structure

- Both actual clicks navigated Overview → Activity and opened an empty Update
  editor. No text was entered and neither Post action was triggered.
- Reference composition: Comment/Update tablist and health trigger at top;
  rich editor; project-change summary; footer with Write with Agent, attachment,
  and Post update controls. Candidate lacks the latter capabilities except Post.
- Reference editor was empty but project-change summary was nonempty. Post update
  was enabled; candidate had no summary and Post update was disabled. This is not
  sufficient evidence to enable submission of an entirely empty candidate update.
- Reference has no published updates in this observed project. Candidate has
  persisted updates/comments. Their feed row counts and layouts are not matching
  state evidence.

## Measured control styles (light theme, Update selected)

| Element            | Geometry                             | Typography                         | Surface                                           |
| ------------------ | ------------------------------------ | ---------------------------------- | ------------------------------------------------- |
| Tablist            | 131.266 × 26; padding 0              | —                                  | radius 9999; border 1px `lch(90.55 0 282)`; white |
| Each tab           | height 24; horizontal padding 8      | 12px / 500 / 18px                  | radius 9999                                       |
| Selected Update    | 57.547 × 24                          | color `lch(20 1 282)`              | background `lch(95.543 0 282)`                    |
| Unselected Comment | 71.719 × 24                          | color `lch(40 1 282)`              | transparent                                       |
| Health trigger     | 84.734 × 24; horizontal padding 8    | button container 12px / 500 / 12px | radius 9999; transparent 1px border               |
| Post update        | 86.516 × 24; horizontal padding 8    | 12px / 500 / normal                | white; radius 9999; transparent 1px border        |
| Write with Agent   | 131.266 × 24; padding left 6/right 8 | 12px / 500 / normal                | white; radius 9999                                |

Button hairlines are painted through `::after`, not the transparent border:
`lch(0 0 0 / 0.103) 0 0 0 1px`, plus shadows
`lch(0 0 0 / 0.02) 0 3px 6px -2px` and
`lch(0 0 0 / 0.04) 0 1px 1px 0`.
Selected tab uses the same latter two shadows with a
`lch(90.55 0 282) 0 0 0 1px` outline.
The health label/icon's nested colors must be measured separately; its button
container color is not evidence that the visible health label should be gray.

## Unknowns and dispatch boundary

This is a partial evidence packet, not a complete builder handoff. Before changing
controls, collect matching viewport, keyboard/focus/hover, dark/narrow/short-window
states, actual nested health content styles and shared-component impact. Never
replace working behaviors with decorative buttons. Attachment and agent-writing
need their real existing domain owners, persistence and failure validation.

Project-change summary baseline, date/progress calculation, empty-body posting
semantics, and inclusion/exclusion interactions remain unknown. Investigate those
before adding API/schema or relaxing current submission validation. Track the
remaining work under ORV-125; this document does not close that issue.

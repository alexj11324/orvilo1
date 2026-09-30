# Issue properties rail — current reference contract

Observed 2026-09-29 through copied-profile Brave CDP9337. Reference: Linear issue detail, English/dark/populated, initial viewport1645×945 then matched desktop1440×900. Local-only screenshot and measured DOM: /tmp/orvilo-linear-context-reference/issue-rail.png and issue-rail-geometry.json. No private issue content may be copied into repository evidence. User asks layout/button/function comparison while preserving ReUI default shapes and native glass left sidebar.

## Structure and current owners

Reference: quick clipboard/branch actions above right rail; Properties heading; Status → Priority → Assignee rows; separate Labels heading with label chips and add control; separate Project heading with project picker and distinct open-project link; milestone child row indented beneath project. Related groups are conditional. Candidate owners: AgentTasks/AgentTaskDetail/{TaskDetailSections,TaskProperties,TaskProjectSection,TaskRailActions,TaskPrerequisites,TaskAcceptanceStateRow,taskDetailLayoutStyles}; shared property pickers: features/{TaskPriorityTag,AssigneeMemberSelector,TaskLabelSelector}. TaskStatusTag already uses local ReUI from verified first batch; preserve it unless a concrete composition bug requires repair. IssueContent is shared by full page, My Issues pane and chat portal. No route or main-app shell rewrite.

## Appearance from live DOM

Properties/Labels/Project headings: 13px/500, neutral muted lch(61.803 1.2 272), padding-inline8px. Value text:13px/500, neutral lch(90.451 1.2 272). Normal property rows: transparent background, 28px control height, glyph14–16px,6px internal icon/text gap; row y153.25,185.25,217.25 indicates32px rhythm. Reference controls are pills; user explicitly prefers ReUI default shapes, so use actual default ReUI Button/Popover/Dropdown composition rather than copying old pills. Semantic workflow/priority/label icon colors remain meaningful; text, ordinary buttons and selected surfaces are neutral. Initial reference rail content width400px at1645px viewport; confirm responsive behavior before changing candidate width blindly.

## Real interactions

Status must choose exact team workflow states and preserve CAS/picker safeguards. Priority, assignee, labels and project menus persist real writes; project navigation is separate from picker. Milestone uses existing project-owner permission and actual catalog. Copy ID/link/branch reuse existing canonical URL/branch logic. Running/readonly states keep disabled edits; reviewer/acceptance/schedule are retained Orvilo capabilities in distinct conditional groups, not deleted merely because Linear lacks them. Do not fabricate subscriber count or subscription state without a read API.

## Verification

Inspect dark/light, populated and empty property values, selected menus, disabled/running state, narrow content/embedded pane, keyboard focus and portal layering. Measure text ink/colors/rectangles and hit locations against actual rendered controls, not stylesheet strings. Local disposable fixture writes must survive refresh; nativeWeb main layout/navigation remains preserved. Scoped regression/checks, no local tsgo; independent final review.

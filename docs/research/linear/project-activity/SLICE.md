# Project Activity page: bounded parity slice

## Output plan and evidence conditions

- Existing app root: /Users/alexjiang/Desktop/vibe/orvilo-linear-parity
- Site/page key: linear/project-activity
- Reference: <https://linear.app/bdiverifier/project/repository-slimming-and-acp-boundary-hardening-89e1b7831472/activity>
- Candidate route: /ws-useragenttes/project/parity-test-project/activity (actual runtime URL to be confirmed)
- Artifacts: docs/research/linear/project-activity/
- Change owner: the expanded composer style in src/features/Projects/Updates/index.tsx, mounted by Activity. Overview mounts only its unchanged collapsed entry. No route, navigation, database, locale, or fixture files are in this slice.
- Repository baseline: c5f45c9a329245a1f3a9474ed279bcd412ded535 with unrelated dirty files retained. Actual post-edit revision and diff will be recorded at acceptance.

Reference was inspected on 2026-09-22 in an authenticated, dedicated Brave tab, English locale, light theme, 1440 × 900 CSS px. The chosen project has multiple milestone events, one long comment, and a creation event, with no published update. Data cardinality and event kinds differ from the candidate fixture, so this is structure/behavior evidence, not equal-content pixel proof. The private comment body is intentionally omitted.

## Observed reference topology and states

- Shell: left navigation, project header and tabs stay fixed. The Activity center column scrolls independently of the project details rail.
- Default Activity mode is Comment. A white rounded composer appears at x261–1004, y140–312 in the 1440 × 900 viewport. Its Comment/Update tablist is x273–403, y153–178. Comment editor starts at y190; attachment control and Comment action are in its footer.
- Clicking Update is read-only and keeps the route. It selects Update, labels the editor Project update, adds an On track health control, a project-change summary and Write with Agent control, and renames the action Submit update. Clicking Comment restores the original mode.
- Below the composer, project events are compact inline rows with a 16 px glyph and 12 px / 450 text; one measured row is 17 px high with a 12 px gap between icon and text wrapper. The long comment is a bordered card, not an inline event. The bottom has older milestone events and project creation; no load-more button was visible in the observed finite stream.
- Scroll sweep: center column scrollHeight 1572, clientHeight 768, scrollTop 804.5 at bottom; right rail has its own scrollbar. Project header and tabs remain in place.
- Observed controls: Comment and Update tabs, health selector in Update, rich editor, attachment, submit action, Write with Agent in Update, comment reaction/options/reply expansion, event links, project tabs and rail. Only the tabs and scrolling were exercised. All submit, attachment and agent-writing outcomes remain unknown.

## Candidate source map and known gaps

Current Activity page composes ProjectUpdateComposer, project updates, task field-change activity rows and a creation row. Backend project.activityFeed returns only task assignee/status/priority/automation/reviewer changes. It does not return project milestone or general project-property history. Composer data behavior and the database model remain outside this styling slice. The existing earlier composer spec is docs/research/linear/project-overview/activity-composer-controls.spec.md.

Candidate was inspected on 2026-09-22 at `app://renderer/ws-useragenttes/project/parity-test-project/activity`, actual Electron CDP `:9222`, zh-CN, light theme, 1440 × 900 CSS px, source `c5f45c9a329245a1f3a9474ed279bcd412ded535` before the local composer diff. The synthetic project has 16 milestone-linked issues and four milestones but zero displayed updates or task-change events, so only project creation appears in its feed. The screenshot is local at `/tmp/orv-project-activity-before.png`.

| State                    | Reference                                                                                                                        | Candidate before change                                                                                                          | Verdict                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Default Comment composer | x260.5/y140, 744 × 172, 0.5 px light border, 10 px radius                                                                        | x269/y155, 739 × 128, 1 px dark focus border, 12 px radius                                                                       | Expanded composer geometry and focus treatment differ.                          |
| Comment → Update click   | Route unchanged; Update selected, Project update editor, health control, project-change summary, Write with Agent, Submit update | Route unchanged; Update selected, Project update editor, health control, Publish update; no summary, agent-writing or attachment | Tab transition works. Added capabilities need separate domain/persistence work. |
| Update → Comment click   | Original Comment mode restored                                                                                                   | Original Comment mode restored                                                                                                   | Transition matches.                                                             |
| Feed after composer      | Compact project events start around y360; mixed comment card appears below                                                       | Only a project creation row immediately below the composer                                                                       | Different data kinds/cardinality. Do not use this as visual parity proof.       |

The measured candidate composer is `Updates/index.tsx`; its editor is `ProjectUpdateEditor.tsx`. Overview calls the same composer with `onExpand` and no `defaultExpanded`, so it renders only the collapsed button and navigates to Activity on click. This slice changes only expanded styling. The frozen acceptance checks are: Comment and Update still switch without navigation; the editor remains focusable; the expanded composer is at least 172 px tall with a light hairline border even while focused; the Overview entry still navigates to Activity; the existing post validation remains unchanged. A matching 1440 × 900 runtime probe plus the existing focused project tests verify these outcomes. The current reference does not prove task field-change icon treatment; its visible inline rows are milestone events. Do not infer exact task-event visuals from them.

## Delivered bounded slice and verification

The expanded composer now has a 172 px minimum height, 0.5 px neutral border and 10 px radius. Focus no longer changes the border to dark. The footer takes the available empty space above it, so the Lexical editor retains its original 32 px minimum; an initial attempt to enlarge that inner editor produced an unwanted empty-state scrollbar and was corrected before acceptance. The Overview collapsed entry and the existing submission guard were not changed.

Final local runtime: 2026-09-22, Electron CDP `:9222`, URL `app://renderer/ws-useragenttes/project/parity-test-project/activity`, viewport 1440 × 900 CSS px at DPR 2, zh-CN, light theme. Repository HEAD during capture was `b5e87be2c391dbfd612c80f9bbe0148d11cbd6f2` plus the uncommitted `Updates/index.tsx` diff. `/tmp/orv-project-activity-after.png` is the local screenshot; it shows no empty-editor scrollbar. The one-pass CDP probe used real hit-tested tab clicks and restored `/ws-useragenttes/projects`, confirmed afterward by target listing.

| Runtime check                                | Final result                                                                                                                                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comment / Update / restored Comment composer | All three measured x269/y155, 739 × 172, `0.5px solid rgb(227, 227, 227)`, 10 px radius.                                                                                                                                         |
| Empty editor scroll state                    | All three had `clientHeight=46`, `scrollHeight=46`; no inner scrollbar was painted.                                                                                                                                              |
| Keyboard/editor focus and mode switch        | Initial Comment editor was focused. Real clicks selected Update, changed the editor aria-label to `项目更新`, then restored Comment/`评论`; URL stayed on Activity.                                                              |
| Submission guard                             | Both empty actions remained disabled. No external/project data was posted.                                                                                                                                                       |
| Scoped checks                                | `bun run check --lint src/features/Projects/Updates/index.tsx` passed; existing `ProjectDashboard.test.tsx` passed 58/58 before the final CSS-only scrollbar correction; `git diff --check` passed afterward. No local tsgo ran. |

The page as a whole is still not at Linear parity. Reference milestone history, comment cards, attachment, Write with Agent, update summary and feed spacing remain open differences. The populated reference project and synthetic candidate fixture have different data types and cardinalities, so this capture proves the expanded composer slice only.

# Inbox parity audit — Linear vs Orvilo

Reference: `https://linear.app/bdiverifier/inbox` (resolves to `/inbox/priority`), en-US.
Candidate: `http://localhost:3010/agent-testing/inbox` and `SPA_PORT=9814` dev build.

Evidence files in this directory:

- `linear-inbox-dom.png`, `l-1-inbox.png` — Linear Inbox (Priority tab, populated).
- `l-3-detail.png` — Linear detail pane open.
- `l-4-other.png` — Linear "Other" tab.
- `linear-menu-actions.png`, `linear-menu-filter.png`, `linear-menu-display.png` —
  Linear `⋯` notification-actions, Add-filter, and Display-options menus.
- `linear-header-dom.json` — enumerated header buttons/tabs from live Linear DOM.
- `linear-row-dom.html` — outerHTML of a live Linear notification row
  ("Devin mentioned you" mention card, read state).

## Linear row anatomy (from `linear-row-dom.html`)

Two-line flex row, **no avatar element**:

1. Line 1: state label span (`Read`) + issue title (`title` attr = full title)
   - trailing colored type glyph (14px SVG).
2. Line 2: actor-action phrase (`Devin mentioned you`) + relative timestamp
   (`2d`) carrying an absolute `title="Sep 21, 3:29 PM"` tooltip.

## Findings

| element                                  | shape\_diff                                                                                                   | icon\_diff                            | reaction\_diff                                                                                 | status                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Segmented tabs (Priority/Other + counts) | same two-tab segmented control with counts                                                                    | —                                     | same route-per-tab                                                                             | parity (pre-existing)                                                                                                                     |
| Header `⋯` notification actions          | Linear lists Mark all read / Delete all / Delete all read / Delete all completed / Go to settings + shortcuts | —                                     | Orvilo renders only Mark all read / Delete all / Go to settings                                | intentional gap — `Delete all read/completed` have no truthful backend filter; not rendered dead                                          |
| Show unreads only toggle                 | Linear header icon button                                                                                     | Linear eye icon                       | Orvilo exposes the same state via the `unread` filter chip                                     | parity-by-model (documented)                                                                                                              |
| Add filter menu                          | Linear: attribute filter builder (type/from/team/project/priority/status/review submenus)                     | funnel icon                           | Orvilo: fixed filter chips (all/unread/mentions/snoozed/archived)                              | domain gap — Orvilo backend has no attribute filter API                                                                                   |
| Display options menu                     | same icon-button menu                                                                                         | sliders icon                          | Orvilo has show-snoozed toggle                                                                 | parity                                                                                                                                    |
| Row: type glyph                          | Linear trails a colored type icon at line-1 right edge                                                        | colored per type                      | Orvilo showed the glyph only as leading fallback when no actor — actor rows had no type signal | **fixed** — actor rows now trail the type glyph at the title line's right edge (`typeTail`)                                               |
| Row: avatar                              | Linear shows no avatar; actor name is line-2 text                                                             | —                                     | Orvilo keeps the actor/agent avatar as leading anchor                                          | domain difference (kept — Orvilo's feed carries actor/agent identity)                                                                     |
| Row: timestamp                           | relative text + absolute `title` tooltip (`Sep 21, 3:29 PM`)                                                  | —                                     | Orvilo had relative text only                                                                  | **fixed** — `title={dayjs(...).format('MMM D, h:mm A')}` matches Linear's format exactly                                                  |
| Row: hover actions                       | Linear reveals envelope (read/unread), clock (snooze), tray (archive) over the row's right edge               | lucide Mail/MailOpen/TimerOff/Archive | Orvilo had no per-row hover actions — organize required opening the card                       | **fixed** — `.work-inbox-row-actions` strip revealed on hover/focus-within over the timestamp; capability-gated by `inboxCardActionFlags` |
| Row: unread dot + selected fill          | same leading dot, subtle fill on selection                                                                    | —                                     | same                                                                                           | parity (pre-existing)                                                                                                                     |
| Click row → detail pane                  | Linear opens right-hand detail pane                                                                           | —                                     | Orvilo same via `?item=&detail=1` deep link                                                    | parity (pre-existing)                                                                                                                     |
| Detail pane header actions               | Linear pins bell(snooze-ish)/clock/tray icons right of the identifier                                         | —                                     | Orvilo buried snooze/archive inside `⋯`                                                        | **fixed** — standalone snooze (preset menu) + archive icons now render in `paneHeader` before `⋯`                                         |
| Detail: decision buttons                 | Linear approve/decline affordances                                                                            | —                                     | Orvilo approve/decline/cancel/reply row                                                        | parity (pre-existing)                                                                                                                     |
| Keyboard nav                             | Linear j/k + enter + ⌥U                                                                                       | —                                     | Orvilo j/k/arrows + enter + esc + Alt+U                                                        | parity (pre-existing)                                                                                                                     |
| Snooze presets                           | Linear: later today / tomorrow / next week style absolute presets                                             | —                                     | Orvilo: In 1 hour / Later today 6 PM / Tomorrow 9 AM / Next week Mon 9 AM                      | parity                                                                                                                                    |
| Priority onboarding banner               | Linear shows "Keep priority inbox" + "Choose what to include" + Disable                                       | —                                     | Orvilo has no priority-onboarding banner                                                       | gap — documented, no settings surface to drive it                                                                                         |
| Empty state                              | Linear inbox-zero artwork                                                                                     | —                                     | Orvilo `Empty` with inbox icon                                                                 | parity-ish                                                                                                                                |

## Implementation

- `src/features/WorkInbox/inboxOrganize.ts` — `inboxCardActionFlags` is the
  single capability gate shared by the row-hover strip, the detail `⋯` menu,
  and the pane-header standalone icons.
- `src/features/WorkInbox/WorkInboxPage.tsx` — `rowWrap`/`rowActions` hover
  reveal, `typeTail` trailing glyph, timestamp `title`, `markCardRead`
  (observed-version receipt + read-receipt suppression for the open card),
  `snoozeMenuItems` shared preset builder, pane-header snooze/archive icons
  (task-linked pane header AND the plain-card detail action row), `role="list"`
  wrapper so the `listitem` rows have a valid ARIA parent.
- Regression test: `inboxCardActionFlags` coverage in `inboxOrganize.test.ts`.
- i18n: `inbox.markRead` added to `packages/locales/src/default/notification.ts`,
  `locales/en-US/notification.json`, `locales/zh-CN/notification.json`.

## Not verified

- Live Linear hover-strip icon set/order — CDP was saturated; row DOM +
  prior-art docs drove the envelope/clock/tray mapping.
- Orvilo populated-feed rendering of the new strip/badge after the change
  (browser verification pending at PR time — see PR body for evidence).
- Snooze confirmation toast parity — not observed live on Linear (mutations
  were read-only).
- zh-CN visuals.

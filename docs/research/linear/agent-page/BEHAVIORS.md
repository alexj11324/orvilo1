# Linear Agent page behaviors

## Control inventory and click-after outcomes

| Control                                                               | Observed outcome                                                                                    | Mutation status                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Header `Switch agent chat`                                            | Opens a 320 px-wide menu under the title with a `Chat history` search field and existing chat rows. | Read-only; exercised.                          |
| Existing history row                                                  | Navigates to `/agent/:chatSlug` and renders the persisted conversation.                             | Read-only; exercised.                          |
| Bottom `Chat history`                                                 | Opens the same searchable history rows in a menu anchored above the bottom-right control.           | Read-only; exercised.                          |
| `Skills`                                                              | Opens a searchable menu. The observed account offered `Create skill`.                               | Read-only menu open; create was not exercised. |
| `Chat options`                                                        | Opens `Copy as markdown` and `Delete`.                                                              | Menu only; neither action exercised.           |
| `Worked for 7 seconds`                                                | Expands inline work steps above the result, preserving the conversation scroll position.            | Read-only; exercised.                          |
| Bottom `Agent`                                                        | Opens Linear's global floating quick-chat panel with minimize, full-page, and close controls.       | Read-only; opened then closed.                 |
| Composer, attachment, send, favorite, edit/copy, create Skill, delete | Inventoried only.                                                                                   | Not exercised.                                 |

## Responsive behavior

- 1440x900: 244 px shared sidebar; route content begins at x=245. New-chat composer is 712x104 at
  x=482, y=395. The text editor begins at x=500, y=409 and measures 676x24.
- 768x900: shared sidebar is hidden; a Menu button appears in the 44 px header. Composer remains
  712 px wide with 28 px side margins. The 336 px illustration remains centered.
- 390x844: shared sidebar remains hidden. The illustration remains 336 px wide at x=27. The
  composer has about 24 px side margins; the text editor is 306 px wide at x=42.

## Previously observed examples state

The repository's earlier same-day evidence records a delayed examples state with three 232x135
cards and a Dismiss control. The current authenticated account remained in the dismissed state.
This slice therefore covers the persisted centered-composer state and keeps the examples state as
an explicit follow-up; it does not fabricate click behavior for actions that can create external
records.

## Measured visual contract

- Page font: `Inter Variable`, with system fallbacks.
- Header height: 44 px.
- Header title trigger: 28 px high, 12 px/500 type, 9999 px radius, 8 px horizontal padding.
- New-chat composer: 12 px padding, 10 px radius, near-white surface, subtle two-layer shadow.
- Composer editor: 15 px/450 type with 24 px line height.
- Skills button: 24 px high, 12 px/500 type.
- Send button: 24 px square with 12 px radius.
- Illustration: 336 px square and intentionally very low contrast.

Hover and keyboard-focus style diffs were not captured in this bounded pass and remain open parity
gaps rather than inferred matches.

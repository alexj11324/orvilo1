# Light-theme text contrast

Round 3 Electron verification measured text below 4.5:1 on the light theme. DESIGN.md owns the rule: status colours used as text take the `*-text` roles, and a lower text hierarchy does not waive contrast. The fill colours (`colorWarning`, `colorSuccess`, ...) stay on dots and glyphs.

## Changes

| Surface                                                   | Before (light)                                                  | After                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Project health label (`ProjectHealthCell`)                | label painted `colorWarning` 2.2:1, `colorSuccess` 3.45:1       | dot keeps the fill; label takes `text-warning-text` / `text-success-text` / `text-destructive-text`   |
| Project header status pill (`TabsBar`)                    | label painted with the status fill (amber `进行中` 2.2:1)       | glyph keeps the status colour; label is `text-foreground` (#080808, 20.0:1)                           |
| Projects table headers and cells                          | `colorTextTertiary` #999 on white 2.85:1; sortable headers only | `colorTextSecondary` #666 (5.74:1), the same role as the non-sortable `text-muted-foreground` headers |
| Context rows in My Issues / team Issues (`TaskRowIndent`) | whole row `opacity: .5`, secondary text 2.12:1                  | title steps to `colorTextSecondary` (5.74:1); only glyphs and avatars are faded                       |
| Team glyph letter (`TeamIdentity`)                        | white on the team colour, 1.6-3.5:1 on most palette colours     | black or white, whichever contrasts more (4.7-13.2:1 on the palette); 9px minimum like `Avatar`       |

Values: `--warning-text`, `--success-text`, `--destructive-text` are resolved by `stateText` in `src/styles/themeRoles.ts`, which only accepts a candidate with 4.5:1 on the status wash, its hover wash and the surface, and otherwise falls back to `colorText`. The static fallback in `globals.css` is `#080808` in light (20.0:1 on white) and `#ffffff` in dark.

## Dark theme

No dark value changes. Dark text roles are `#ffffff` (20.1:1 on `#070707`), the secondary role is `#aaaaaa` (8.7:1) and the dark amber fill `#ffb224` is 11.2:1, so moving labels from fill colours to the text roles keeps or raises contrast. The team glyph picks its foreground from the team colour, which does not depend on the theme.

## Context rows

A context row is a parent shown only to place a nested child that matched the query, so it was dimmed. The dimming is kept, but done with a text role instead of a row-level opacity, which cannot pass for secondary text (`#666` at 50% over white is 2.12:1).

## Not changed

- `transition: all 0s` on Issue list rows is the computed serialization of "no transition" (initial `transition-property: all`, `0s` duration; also what `transition: none !important` from the disabled-animation stylesheet reports). Neither the row nor an ancestor declares `transition: all`, so there is nothing to replace.
- Decorative glyph colours (status icons, the dashed no-update health glyph) are graphics, not text.

## Task manager panel labels

The right AI panel (`AgentTaskManager`) reads the lazily fetched `topic` namespace. On a cold load `t()` returned the raw keys (`taskManager.welcome`, `actions.addNewTopic`, `actions.showTopics`) for several seconds. The welcome line, the topic title fallback and the toolbar titles now wait for react-i18next's `ready` for that namespace and render nothing (no title) until it lands. No render test was added: the change is a `ready` gate, with no pure logic to assert.

## Round 4: counts, separators, composer placeholder

Measured on the light theme: board column counts 2.85:1, the team-page breadcrumb separator 1.92:1 and the Topics (话题) panel composer placeholder 2.85:1. All three now take the semantic `text-muted-foreground` role (`--ant-color-text-secondary`, #666 on white, 5.74:1) instead of `colorTextTertiary` / `colorTextDescription` / `colorTextQuaternary`:

- `KanbanColumn` `count` and `collapsedCount`: the colour is removed from the antd-style classes and applied as a utility, so no antd-style colour competes with it.
- Team Issues / Team Projects breadcrumb `›`: `aria-hidden`, so the 3:1 non-text target applies; it uses the same `text-muted-foreground` token as the separator in `ui/breadcrumb` and `AgentTaskItem`, which exceeds it.
- `Placeholder` (composer, both variants): `text-muted-foreground` on the placeholder span.

Dark theme: `--muted-foreground` is #aaaaaa on #070707 (8.7:1), which is higher than the tertiary roles it replaces.

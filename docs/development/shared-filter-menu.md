# Shared filter menu

The project issue list (`Issues/IssueFilterPopover.tsx`) and the project list
(`List/AddFilterPopover.tsx`) share one "Add filter" menu:
`src/features/Projects/FilterMenu/FilterMenuPopover.tsx`.

- **Callers describe, the menu renders.** Each caller maps its filter model to
  `FilterMenuGroup[]` (`label`, `icon`, `supported`, lazy `getPicker()`), and
  passes the translated `labels`, `onSubmitAi` and `onOpenAdvanced`. Filter state
  (URL params, stores) and i18n keys stay with the caller.
- **Picker kinds** (`model.ts`): `options` (checkable rows, optional visible
  search, `pinned` rows such as "No assignee", loading/error `statusMessage`),
  `dates` (field list, then a window list) and `text` (draft + Apply).
- **Pure helpers** in `model.ts` (`buildMenuEntries`, `filterOptions`,
  `toggleListValue`, `toMemberOptions`) are covered by `model.test.ts`.
- **Interaction.** Every list is a Base UI `Autocomplete` rendered `inline`
  (`@/components/reui/autocomplete` item styles): the input keeps focus, so
  Up/Down move the highlight (`bg-accent`), Enter activates the row and Esc
  closes the popover. Pickers without a visible search box keep a
  screen-reader-only input so the arrow keys still work. Checked rows use
  `bg-selected`. The trigger button carries `aria-label` and `aria-pressed`.
- **Adding a filter group**: add it to the caller's group list and return a
  picker from `pickerFor`; do not copy the menu shell again.

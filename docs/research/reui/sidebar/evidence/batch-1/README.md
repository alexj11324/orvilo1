# Batch 1 Electron evidence

Source revision: `46c275354f727c0e11cccbe18a81a12b37c6988e`. Screenshots were produced on the same source before the commit; the four source SHA256 values in `selection.json` were checked against that commit and match.

Isolated Electron 43 / Chromium 150, populated local fixture: one workspace, three favorites, one joined team and six My Issues rows. These are disposable test identities, not production data.

- ReUI sidebar expanded in light and dark themes: [light](light.png), [dark](dark.png).
- Default 16 px Checkbox: 16 real clicks across both themes, including extended hit areas; Cmd toggle and Shift range selection retain the route. See [selection results](selection.json).
- Sidebar collapse rail no longer covers the Issue hit area; measured hit-area-to-row-background gap is 9 px.
- Search regression: three real press/open/Escape cycles per theme, with identical trigger/body rectangles and sidebar scroll position. See [light](search-light.json), [dark](search-dark.json). The same check failed with the old pressed translation.
- Settings personal/workspace categories and search, navigation, nested menus, group folding, create/cancel, subscribe/unsubscribe and titlebar history were exercised in Electron.
- Combined scoped quality check: 95 files lint clean; 87 related tests passed. Separate selection checks: 110 tests passed. Independent combined source review found no blocking defect.

Native macOS background surfaces remain transparent. CDP screenshots show renderer colors, not native compositor material; the final native screenshot API returned a Stage Manager thumbnail and is not used as material proof. Empty/error/loading/pagination fixtures were not exercised for the Issue list. Local Web startup was rejected by the machine's Electron-only development rule; Web and Typecheck are remote CI gates.

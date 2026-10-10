# SelfLearning pages: Tailwind migration

Tracking: [#577](https://github.com/alexj11324/orvilo1/issues/577); batch [#635](https://github.com/alexj11324/orvilo1/pull/635).

## Changes

Migrate overview, experience list and lesson detail layouts to Tailwind. Preserve scroll ownership, native section grid, adjacent matching-sibling logical border, title width and data callbacks. Three source files no longer import antd-style.

The global `ANTD_STYLE_LAYER_ENABLED` switch stays OFF. This batch does not approve a global cascade flip, theme-host removal, or dependency removal. It is independent of the other feature batches and follows integration #630.

## Verification

Implementation revision: `99412018e5f96220ba02b90b39a4b28e3b5da226`. Documentation-only follow-ups leave these source files unchanged.

Scoped check: 3 files lint clean, 4 tests passed. Independent review verified exact ThemeRoles aliases and generated Tailwind sibling/grid/width utilities; no findings.

未做真机验证. No new Electron light/dark visual-parity evidence is claimed. The owner instructed that individual environment blockers should be recorded while unaffected work continues; normal CI and merge gates remain in force.

## Remaining dependencies

No new theme-variable exceptions. Untouched SelfLearning components remain outside this batch.

`skeleton: no-change`

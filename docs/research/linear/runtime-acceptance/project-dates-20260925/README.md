# Project list / board / timeline — date display — acceptance evidence

Surface: Projects list, board, and timeline (`/ws-*/projects`).

| Element                       | Before                    | Linear                                    | After                                                                     |
| ----------------------------- | ------------------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| Milestone chip (list + board) | `dayjs().format('MMM D')` | localized, year only outside current year | `useProjectDateFormatter()`                                               |
| Board card target date        | `dayjs().format('MMM D')` | same                                      | `useProjectDateFormatter()`                                               |
| Timeline range label          | `dayjs().format('MMM D')` | same                                      | `formatDate(start) → formatDate(target)`                                  |
| List target-date cell         | `dayjs().format('MMM D')` | same                                      | `formatDate(value)`; hover tooltip keeps absolute `formatOtherYear HH:mm` |
| Timeline axis / today pill    | `dayjs` (kept)            | calendar-widget labels                    | unchanged per handoff                                                     |

`projectListDates.test.ts` gates the formatter wiring in all four files and the removal of the hardcoded `'MMM D` formats.

Reference: Linear renders the same date everywhere — localized, `Mar 1` en / `3月1日` zh-CN, year kept for other years (`Mar 1, 2027`). Linear screenshots stay local.

Runtime verification against Linear is still pending (Electron `:9232` + parity DB live on the reference machine); tracked in `docs/linear-parity-handoff.md` §D.

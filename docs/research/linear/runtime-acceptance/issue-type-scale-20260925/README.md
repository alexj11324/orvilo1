# Issue detail — rail and body type scale — acceptance evidence

Surface: issue/task detail (`/ws-*/task/<id>`), right rail (232px) and body.

| Element                              | Before                         | Linear | After |
| ------------------------------------ | ------------------------------ | ------ | ----- |
| Rail property values (all rows)      | 14px (lobehub `Text` default)  | 13px   | 13px (`RAIL_VALUE_FONT_SIZE`) |
| Title input                          | 26px                           | 24px   | 24px  |
| Description / body                   | 16px / 400                     | 15px / 450 | 15px / 450 |
| Milestone + project-menu dates       | raw ISO `2026-03-01`           | localized (`Mar 1` / `3月1日`) | `formatTaskItemDate`, year dropped in current year |
| Rail label for `project · date`      | single `Text` — date clipped at 232px | name truncates, date visible | name `ellipsis` + date `flex: 'none'` |

`railText.test.ts` gates the constant, every rail `<Text>` carrying `fontSize`, the 24px/15px/450 styles, and `formatTaskItemDate` wiring, so the spec cannot regress silently.

Reference: measured on live Linear (issue page, zh-CN). Linear screenshots stay local.

Runtime pixel verification against Linear is still pending (Electron `:9232` + parity DB live on the reference machine); tracked in `docs/linear-parity-handoff.md` §D.

# Project dates — acceptance evidence

Surface: Voyager Launch → Overview, Electron dev app, zh-CN, 1440×900 @2x. "Today" is 2026-09-24.

## Date text (revision `7926e75aa`)

| Field                               | Before                        | After                           |
| ----------------------------------- | ----------------------------- | ------------------------------- |
| Start date (this year)              | 12 月 1, 2026                 | 12 月 1 日                      |
| Target date (next year)             | 2 月 28, 2027                 | 2027 年 2 月 28 日              |
| Overview milestone card (next year) | 1 月 31 (year lost)           | 2027 年 1 月 31 日              |
| Rail dates                          | 12 月 1, 2026 / 2 月 28, 2027 | 12 月 1 日 / 2027 年 2 月 28 日 |

English reads "Dec 1" / "Feb 28, 2027" (unit test in `createProjectForm.test.ts`).

## Hover and clear

`date-chip-probe.mjs` hovers the start-date chip with a real mouse event, opens it, reads the popover and presses Escape (no date is changed).

| State   | Before                                                                                           | After                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Rest    | glyph visible                                                                                    | glyph visible                                                                                   |
| Hover   | glyph hidden, clear button over the last character (`candidate-hover-before-allowclear-fix.png`) | glyph visible, no clear button                                                                  |
| Popover | precision tabs + calendar                                                                        | current date with a clear button, then precision tabs + calendar (`candidate-date-popover.png`) |

Reference (Linear, measured 2026-09-24): the date chip shows only its glyph on hover; the popover opens with the current date in an input that carries the clear button, then Day / Month / Quarter / Half-year / Year. Linear screenshots stay local.

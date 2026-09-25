# Team Issues row status mark — acceptance evidence

Surface: Parity Shipping → Issues → All issues, list layout
(`/ws-useragenttes/teams/team_sBgk9AgJ4uwh?tab=issues&layout=list`), Electron dev app, 1440×900 @2x.

| Revision                    | Screenshot                                   | What it shows                                                                                                                                                           |
| --------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f1cb43a8d` (row mark only) | `candidate-marks-only-run-status-groups.png` | One 14px workflow mark per row, no status pill. Groups are still run status, so SHIP-1 (started) sits under Todo and backlog rows sit under a dotted run-status header. |
| `be6254cc7`                 | `candidate-workflow-groups.png`              | List grouped by workflow state. Every header glyph equals the marks beneath it: Backlog → Todo → In progress → In review → Done.                                        |

`rowprobe.js` (run via `bun run dev:env cdp 9232 app://renderer @rowprobe.js`) reports, for every row, the number of status marks, the mark size (14×14) and its SVG signature. At `be6254cc7` each row has exactly one mark and no text status chip.

Reference: live Linear team issues list, grouped by Status (workflow state), one status glyph per row between identifier and title. Linear screenshots stay local and are not committed.

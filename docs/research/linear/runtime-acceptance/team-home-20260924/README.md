# Team Home: Electron acceptance

Source commit: `b07df11a2b0ee97238ab39c1e8075abe8958a88b`

Route: `app://renderer/ws-useragenttes/teams/team_r6cxh0GBbfrI`

Fixture: Parity Test Team, including PMI-4 (`workflowCategory: in_progress`).

Runtime: Electron dev build, CDP port 9233, dark appearance, en-US, DPR 2.

| Window     | Result                                                                                                                                                                                                       | Evidence                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| 1440 × 900 | Right-rail title and link labels compute to 13px / 500. Links are 28px tall with 36px between row starts. PMI-4 renders the shared board mark (`data-workflow-icon="in_progress"`) with title “In progress”. | [Screenshot](./electron-1440.png) |
| 900 × 900  | The rail moves inline without overlap; PMI-4 keeps the same workflow mark.                                                                                                                                   | [Screenshot](./electron-900.png)  |

The Linear Team Home reference at 1440 × 900 uses 13px / 500 labels and 36px link-row spacing. Its current fixture has no Recent issues section, so the PMI-4 check uses the populated Orvilo fixture. A real click through to Team Issues confirmed that the board's In progress column renders the same `data-workflow-icon="in_progress"` mark. These screenshots cover the two requested changes, not full Team Home parity.

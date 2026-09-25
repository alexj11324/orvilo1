# Team Issues list grouped by workflow state — acceptance evidence

Surface: Parity Shipping → Issues → All issues, list layout (`?tab=issues&layout=list`), Electron dev app, zh-CN, 1440×900 @2x.

Revision `68b87855f`, on top of #227 (`e5be8d2dc`).

`candidate-workflow-groups.png`: groups are 待办 (backlog) → 待处理 (todo) → 进行中 → 审核中 → 已完成. Every group header draws the same workflow glyph as the row marks beneath it, and SHIP-1 (started) sits under 进行中. Before this change the list defaulted to run-status groups (待办 / 进行中 / 已暂停 / 已完成), so a started issue appeared under 待办 and backlog rows appeared under a run-status header.

Reference: Linear groups the team issue list by Status (workflow state), the same dimension as its board.

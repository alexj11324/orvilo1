# Task board status markers

Board cards show the workflow status glyph without an additional execution badge or privacy lock. Workspace cards are not marked private; personal private tasks retain their collaboration metadata. Priority, assignment, run actions and drag overlays keep their existing behavior.

The two card files were verified with `bun run check --lint --test src/features/AgentTasks/AgentTaskList/TaskBoardCard.tsx src/features/AgentTasks/AgentTaskList/TaskBoardCard.test.tsx`: 18 tests passed and lint was clean. The regressions cover workspace and personal tasks in normal and overlay cards. Independent code and TypeScript reviews found no blockers.

Native normal-card acceptance was captured on the isolated Electron fixture on 2026-10-06. The board contained 11 tasks; the visible cards retain their workflow glyph, priority and assignee indicators without the removed execution badge or privacy lock. [Full native board capture](./task-board-markers-evidence/board-visible-6818.png) records the current viewport, not every horizontally offscreen card. The capture is zh-CN, dark mode, 100% zoom, with a 1291 × 886 CSS window and an uncropped 2582 × 1772 image. The original `.png` filename is preserved; the file contains JPEG data.

The capture carries the original candidate identifier `6818b5c0fae2a08030965ee6bd54080282aa2cca`. A programmatic SHA-256 comparison of both delivered card source/test files at `07907b61b0be96dfa2e75f1c21b35c7ffb6c7b97` against the frozen runtime map for `d78fa1eb2678fa8508f8c861d49e9e71dec7c6d9` found both unchanged. Moving the isolated window onto the visible display restored ScreenCaptureKit capture after error `-3812`; this does not establish a TCC permission change.

Actual dragged-overlay visual acceptance remains pending: no dragged-overlay screenshot was captured. The existing 18 tests cover normal and overlay cards, but they do not replace that visual check. This update attaches existing runtime evidence only; it changes no product code and requires no new test or runtime run.

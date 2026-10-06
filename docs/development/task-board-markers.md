# Task board status markers

Board cards show the workflow status glyph without an additional execution badge or privacy lock. Workspace cards are not marked private; personal private tasks retain their collaboration metadata. Priority, assignment, run actions and drag overlays keep their existing behavior.

The two card files were verified with `bun run check --lint --test src/features/AgentTasks/AgentTaskList/TaskBoardCard.tsx src/features/AgentTasks/AgentTaskList/TaskBoardCard.test.tsx`: 18 tests passed and lint was clean. The regressions cover workspace and personal tasks in normal and overlay cards. Independent code and TypeScript reviews found no blockers.

Native acceptance is pending. The populated Electron fixture reached the board with 11 cards, but the computer-use capture service then repeatedly returned macOS ScreenCaptureKit error `-3812` (invalid parameters). No successful screenshot of the changed cards was captured, so reaching the board is not recorded as visual acceptance. Before marking this PR ready, verify that normal and dragged cards retain their workflow glyph, priority, assignment, and actions without the removed badges, and attach the screenshot with its revision.

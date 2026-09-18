# HOME-LAYOUT-RAIL-001 ("受限桌面宽度下 Home 内容整体滚动") was retired with S20.
#
# Every step of it read `[data-testid="home-rail"]` on `/`, and Web's index slot
# now renders `WebHomeRedirect` (`src/spa/router/desktopRouter.config.tsx`) — `/`
# resolves to the task list, which has no Home dashboard and therefore no rail.
# The rail itself still ships in Electron's per-tab Home, where this geometry
# still matters, but this suite runs the Web app and there is no Electron E2E job.
#
# The parts of the contract that are still observable without an Electron
# renderer stay pinned by unit tests:
#   - `src/features/Home/__tests__/homeDashboard.test.tsx` (regions and mode)
#   - `src/spa/router/WebHomeRedirect.test.tsx` (where `/` goes instead)
# The rail's real geometry — its scroll coupling and collapse behaviour on a
# rendered desktop surface — is recorded as BLOCKED in
# `docs/development/task-first-rollout.md` §7.4 rather than silently dropped.
@journey @home @layout @regression
Feature: Home Dashboard 双列布局
  作为桌面端用户，我希望 Home 内容作为一个整体滚动，且滚动条贴合内容区边缘

  # No scenarios remain: since S20 this Feature describes an Electron-only surface.

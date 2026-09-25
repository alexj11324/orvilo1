# Task 1 — Sidebar More menu — runtime evidence

Commit under test: `24bbdab70` (branch `devin/v6-linear-polish`, Electron dev server on :9222 running this worktree).

## `more-menu-open.png`

More (更多) dropdown open on `/projects`, zh-CN locale. Verified structure top-to-bottom:

- `显示所有条目` — non-interactive group label (= Linear "Showing all items")
- `成员` → click verified, navigates to `app://renderer/ws-useragenttes/members`
- `团队` → `/teams`
- `自定义侧边栏` → `openCustomizeSidebarModal()`
- divider
- `助理` / `自动化` / `资源` / `工作区设置` — pre-existing Orvilo entries, retained per ruling R1

Reference: `docs/research/linear/ref-2026-09-23/ref-nav-more-open.png` (Linear: Showing all items / Members / Teams / Customize sidebar).

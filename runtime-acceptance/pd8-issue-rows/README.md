# PD8 — Project Issues 行结构运行时证据

**绑定 SHA**: `302a674e6801ca178c2516e370321f1ff8ee8925`（采集时工作树 = 已暂存 PD8 diff，
commit 未改内容；lint-staged 自动修复无语义变化，diff 复核一致）。

## 采集环境

- 候选端：Brave 副本 @ CDP `:9222`，`http://localhost:9878`（独立 Vite `dev:spa`，本 worktree），
  1250×845 继承 viewport，zh-CN。
- 采集脚本：`.agents/acceptance/scripts/cdp-inspect.cjs`（`--match` 锁 tab；
  `--click` 走真实 `Input.dispatchMouseEvent`）。
- 探针源码已随目录归档（`pd8-probe-*.js`），可复跑。

## 已验证（candidate 实测）

| 检查项                                 | 结果                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Project Issues 行首 = 可点 status 控件 | 7/7 渲染行 `statusIndex: 0`，`[status @275][ID @299][title]`（嵌套行同构 @311）                                                               |
| 冗余 workflow 文本 chip 移除           | `[data-task-workflow-state]` 页面计数 **0**（改造前同面为 7）                                                                                 |
| 行内 priority 选择器移除               | status 前无任何元素（原结构 `[priority][status][chip][ID]`）                                                                                  |
| status 控件可点                        | 实点弹出 `Backlog 1 / Pending review 2 / Completed 3 / Canceled 4`（数字键），见 `status-dropdown-open.png`                                   |
| priority 仍可改                        | 右键菜单含 `Status ▸ / Priority ▸ / Copy ID / Copy Link / Delete`；详情 Properties 面板 `Priority: Urgent` 可见，见 `project-issues-rows.png` |
| My Issues 不变                         | 18 chips；行结构 `[priority @257][status @281][chip @305][ID @364]`，见 `my-issues-rows.png`                                                  |
| Team Issues 不变                       | 7 chips 仍在卡片内；该面走 `WorkQueryResults`（非 `TaskList`/`AgentTaskItem`），`linearIssueRow` 不可达，见 `team-issues-board.png`           |

## 未验证 / 不在本切片

- Linear 参考端本次未重新对照行几何（沿用既往实测结构 `[status][ID][title]`）。
- 组头 `+` / 折叠交互 ——`tasks/todo.md` 冻结为待复核，本切片未触碰。
- Project Issues **board** 面不经 `TaskList`，不在 PD8 范围。
- 不主张九页 parity 完成；本目录仅覆盖 PD8 行结构切片。

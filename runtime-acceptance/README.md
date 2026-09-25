# Runtime acceptance — evidence index（2026-09-23 r2）

> Parity 运行时证据总索引。每条记录绑定 commit SHA（或注明未绑定）。
> **规则：implemented ≠ verified** —— 矩阵（`docs/research/linear/PARITY-MATRIX.md`）
> 只认本索引内的证据为「已验证」；静态检查与单测不算。
>
> 采集环境：候选端 Electron @ CDP `:9222`（`app://renderer/ws-useragenttes`，
> zh-CN，跑 `devin/v6-linear-polish` 工作树）；参考端 Brave 副本 @ `:9666`
> （`linear.app/bdiverifier`，team ORV，en-US）。

> ⚠️ **stash 事件（2026-09-23）**：lint-staged 自动 stash 将本目录大部分 payload
> 连同其它～180 个未跟踪文件收回未恢复。**全部可从 `stash@{0}` 的 index commit
> `dbdf9d689`（base `1514ae00b`）恢复**，恢复动作待执行。下表「盘上」列如实标注
> 现状；「stash 待恢复」= 证据存在、路径当前为空。

## 1. 本目录（`runtime-acceptance/`）

| 目录                          | 盘上现状                                                                                                                              | 绑定 SHA / 基线                                                    | 覆盖 surface                                  | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `t1-24bbdab/`                 | ✅ 在盘                                                                                                                               | `24bbdab70`（后 amend 为 `8fe855456`）                             | 侧栏 More 菜单                                | `more-menu-open.png`：菜单结构逐项核对 + 成员→`/members` 点击实测（Electron :9222，zh-CN）                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `wave1/`                      | ⚠️ **stash 待恢复**                                                                                                                   | HEAD `19a74c040`（HMR）                                            | Drafts 卡（T14）、Inbox 优先收件箱横幅（T11） | `drafts-card.png`（卡 137.4px vs 参考 139、excerpt 标题 + issue chip）；`inbox-banner.png`（优先 3 / 其他 1 tabs + 横幅 + 头部三图标 + `4 条未读通知` 详情空态）；目录 README 在 stash                                                                                                                                                                                                                                                                                                                                                                               |
| `responsive-dark-2026-09-23/` | ⚠️ 盘上仅存 `*.log`×6（sweep/finish/retry/rescue/recap/watch）；**49 PNG + 48 JSON + README + skipped.txt + 9 采集脚本 stash 待恢复** | 采集时 worktree ≈ `4b23b3658`+ 在途 WIP（SHA 待绑）                | 响应式三档（1440/1024/800）+ 暗 / 浅主题      | **最终口径（skipped.txt 尾注取代 transient 记录）**：15 面 ×3 档全部采到（drafts/inbox/inbox-detail/members/my-issues/project-issues/projects/reviews/team-home/team-issues/team-projects/team-triage/team-views/views-directory + light 对照 4 张）；**唯一真跳过 = view-detail**（workspace 无 saved views）；**inbox 组 degraded**（`?item=<dead>` 撞 ErrorBoundary + 并发 vite 编译中断，JSON metrics 存活，需重拍）。Chrome 实测：sidebar 244→0 @\~960 PASS；portal 列 407px 固定 GAP；无 master-detail back GAP；无横溢 PASS。详见 `responsive-dark-report.md` |
| `perf-2026-09-23/`            | ⚠️ **stash 待恢复**（目录不在盘上）                                                                                                   | 采集时 HEAD `4b23b3658`+WIP（README 在 stash 内已含方法 /caveats） | 性能：冷 + 热加载 ×5 面                       | `raw/`：inbox、my-issues、projects、team-issues {,-b}、views 各 `*.cold.json`/`*.json`/`*.err` + `nav-snapshot.json`。结论（`perf-report.md`）：my-issues 2478ms+virtuoso、projects 1378ms、views 2041ms 健康；inbox/team-issues 撞 ErrorBoundary——**两个 P0 根因已修（`997a20c6e`/`d88945da3`），修复后未重测**；dev cold-load 6.7s/6700 modules（dev-only）                                                                                                                                                                                                        |

## 2. 历史证据目录

| 目录                                                | 盘上现状                                  | 绑定 SHA / 基线                                                      | 覆盖 surface                                                                                                                                                 | 内容                                                                                                |
| --------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `docs/research/linear/runtime-acceptance/e56fd439/` | ✅ 在盘                                   | `e56fd4391`                                                          | Projects 列表、lead picker、Project overview、Team home、Team views、View 编辑器 / 保存流、Inbox 旧版                                                        | 22 张 PNG（candidate+reference 对照）；README 内含已修复 bug 与 known gaps                          |
| `.agents/runtime-acceptance/dom-specs-candidate/`   | ✅ 在盘（**13 份**，gitignored 未受影响） | SHA **未记录**；`capturedAt` 2026-09-23T10:13–10:15Z，1440×900 zh-CN | drafts、inbox、members、my-issues、project-overview、projects-list、reviews、team-home、team-issues、team-projects、team-triage、team-views、views-directory | `dom-spec-capture.cjs` 产出的结构化 DOM / 几何快照；stash 事件后新采，部分顶替丢失的 sweep DOM 证据 |

## 3. 逐页验证文档（docs/research/linear/ 下，绑定 SHA，均在盘）

| 文档                                               | 绑定 SHA / 基线                                                 | 覆盖内容                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `my-issues/VERIFICATION.md`                        | `710ee2069` + 未提交 diff                                       | Assigned attention 四组、44px 行、层级缩进 + 肘线、折叠 aria-expanded、Created 22 行          |
| `reviews-page/CANDIDATE-VERIFICATION.md`           | `c191c163e`                                                     | master-detail 482/704 分栏、768px overlay+Back、stale write-gate A/B 回归（断连账号）         |
| `drafts-page/electron-verification.md`             | `c5293bc3a`                                                     | 合成草稿全旅程：autosave→卡出现→Edit 恢复→角标联动（discard 完成态被拒未点）                  |
| `drafts-page/rich-preview-verification.md`         | `c5f45c9a3` → `0092dad3e` + 未提交 diff（后落 `67f2bed84`）     | 卡标题 / 正文角色修正、468×144.4 实测、`?draft=1` 恢复、角标 = 1                              |
| `agent-page/VERIFICATION.md`                       | `c5f45c9a3` + 未提交 diff（后落 `a1b1f5e6a`）                   | inbox landing A 态 712×106\@y400.5、水印 336、390px 无裁剪、workspace 前缀不再泄漏为 topic 段 |
| `views-page/runtime-acceptance-2026-09-22.md`      | `fcbad6e8d` dirty worktree                                      | owner 控件 /live 数据 /details pane、隐藏草稿跨 popover 回放                                  |
| `views-page/directory-entity-tabs-verification.md` | `3f3061f21`                                                     | Issues/Projects 分段、query 保持、New view 实体初始化、Back                                   |
| `team-pages/ISSUES-SCOPE-NAVIGATION-SLICE.md`      | `c5f45c9a3` + diff（后落 `bd80bc23d`）                          | scope 历史：Active→Backlog→Back 恢复、reload 保持                                             |
| `team-pages/TRIAGE-CREATE-SLICE.md`                | 未提交 diff（后落 `962c31212`）                                 | triage 创建 CTA→composer 打开、X 关闭队列不变                                                 |
| `team-pages/evidence/`                             | 同 `e56fd439` 批次                                              | `candidate-home-1440x900.png` / `candidate-home-390x844.png`                                  |
| `project-overview/right-rail-verification.md`      | `a1478716b`                                                     | 右栏行集合 / 几何 / 折叠交互                                                                  |
| `project-overview/priority-icons-verification.md`  | `fcbad6e8d`                                                     | 五档优先级图标、urgent 橙色、57.28×28 trigger                                                 |
| `project-overview/inline-codex-verification.md`    | `b8e008890`                                                     | inline properties 菜单化实测                                                                  |
| `project-overview/hover-jitter-2026-09-22.md`      | `963aa7a06`                                                     | hover 后 7 控件 x/y/w/h 零位移                                                                |
| `b1-codex-verification.md`                         | `84c01725e`                                                     | milestone 锚点 + 过滤链接 7/16 往返                                                           |
| `project-activity/SLICE.md`                        | `c5f45c9a3` + diff（捕获时 HEAD `b5e87be2c`；后落 `9c445ed93`） | composer 739×172/0.5px 边框 / 10r/focus 不变深、tab 原地切换                                  |
| `team-seed-verification.md`                        | `df5e94627`                                                     | fixture 种子数据计数核对                                                                      |
| `team-projects/DIFFERENCE-AND-ACCEPTANCE.md`       | 对照文档（无 SHA）                                              | team projects 参考端 1440/768/390 vs 候选端紧凑行                                             |

## 4. 参考端采集（只读基线，非候选端证据）

| 目录                                   | 盘上现状                                                                                                                                               | 日期       | 内容                                                                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/research/linear/ref-2026-09-23/` | 部分在盘：`NEW-FINDINGS.md` + `dom-specs/reviews.json` + `ref-inbox-menu.png`（随 `c98681b9a` 入库）；**15 份 dom-specs + 15 张 ref PNG stash 待恢复** | 2026-09-23 | 参考端 PNG（`ref-inbox-menu.png` ⋯菜单枚举、`ref-projects-timeline.png`、`ref-projects-display-options.png`、`ref-projects-filter-menu.png`、`ref-issue-detail.png` 等）+ `dom-specs/` 16 份 DOM 结构 JSON + `NEW-FINDINGS.md` |

## 5. 报告级运行时记录（无截图文件或证据在 stash）

| 记录                                                                   | 基线               | 内容                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.superpowers/sdd/linear-parity-2026-09-23/task-t15-report.md`         | `4b23b3658` 工作树 | Team Triage populated：CDP DOM 探针实测 PARITY-1..4 行渲染（identifier/age/creator/ 动作钮），Accept 实点 + toast + 行消失 + 种子回滚；snooze disabled tooltip 实测             |
| `.superpowers/sdd/linear-parity-2026-09-23/task-inboxmenu-report.md`   | 参考端 :9666       | Inbox `⋯` 菜单真 CDP 枚举（`Input.dispatchMouseEvent`）：5 项 + 2 分隔线 + 快捷键（`⌥U`/`⇧⌫`）+ settings href                                                                   |
| `.superpowers/sdd/linear-parity-2026-09-23/responsive-dark-report.md`  | `4b23b3658`+WIP    | sweep 结论汇总：15 面 ×3 档、chrome 级 findings（sidebar PASS /portal 407px GAP / 无 back GAP / 横溢 PASS）、暗 / 浅主题 toggle 实测、inbox degraded 原因、view-detail 跳过原因 |
| `.superpowers/sdd/linear-parity-2026-09-23/perf-report.md`             | `4b23b3658`+WIP    | perf 数字表 + 两个 P0 崩溃根因（均已修：`997a20c6e`/`d88945da3`）+ P1 dev cold-load + P2 API churn + 重测建议                                                                   |
| `.superpowers/sdd/linear-parity-2026-09-23/task-errorstates-report.md` | `efd36e13c`        | 12 面 loading/empty/error/retry 审计矩阵 + `usePagedLoadMore` 修复清单 + 7 条 documented-not-fixed gap                                                                          |

## 6. 证据缺口（下轮验收首要清单）

**最高优先 — stash 恢复**：`stash@{0}`（index commit `dbdf9d689`，base `1514ae00b`）
含 `runtime-acceptance/{README.md,wave1/,perf-2026-09-23/,responsive-dark-2026-09-23/}`
全部 payload、`ref-2026-09-23/` 15 dom-specs+15 PNG、`.agents/acceptance/scripts/` 脚本
（`dom-spec-capture.cjs` 已在盘）。恢复：`git checkout stash@{0} -- <path>`。
恢复后各目录补 README SHA 绑定（采集基线 ≈ `4b23b3658`+WIP）。

**待重采 / 待补**：

- inbox-{800,1024,1440}.png 重拍（原组 degraded）；`?item=<dead>` 深链整面
  ErrorBoundary 缺口需先裁决修不修。
- perf 重测：两个 P0 已修，重跑拿 team-issues 60 行虚拟化 / 滚动实测数 + inbox 正常态指标。
- view-detail：workspace 无 saved views，需先造数据（或确认 fixture 缺口）。
- 暗色逐面 vs Linear dark 参考对照未做（toggle 机制已验）。
- T8 team-issues chrome 未落地，落地后 team-issues/team-triage/team-projects/team-views
  四面的 sweep 需按新 chrome 重拍。

**已合入但零 / 弱运行时证据的 commit**（截至 `c98681b9a`）：

- `e6dea3310` — issue detail 整页 Linear-style（对照 `ref-issue-detail.png` 未做）
- `d88945da3` — team home 子页签 + resources + recent issues
- `efd36e13c` — bulk select + `usePagedLoadMore` 全系尾页重试
- `1950ea793` — hotkeys C/g>\* 序列 /? 实机触发未验
- `997a20c6e` — inbox P0 import 修复（崩溃面恢复未实测）
- `39d46b587`/`4b23b3658`/`e77c3966a`/`e54d0f530`/`abc7089ad`/`cf1f38c9f`/`f930f3051`/`74582b2c7`/`27cb54ba3`/`2e04d09bf`/`eebbb8578`/`d666fe0a4` — wave-3 主体（证据采过但在 stash；`dom-specs-candidate/`×13 已部分覆盖 DOM 层）
- `0cd6b5542`/`09bda1182`/`04ff74c50`/`850e1d05a`/`12587f5a9`/`a6bbe2f9a`/`a2eddd31d`/`cdbf1dd4d`/`889277cc8`/`19a74c040`/`e8d43bf5f` — wave1/wave2 主体（评审已过，运行时未验或证据 stash 待恢复）

**新规则**：证据产出先落 gitignored 路径（`.agents/`、`.superpowers/`），再复制进
`runtime-acceptance/`、`docs/`；未跟踪文件在 commit 前承担 stash 丢失风险。

# Orvilo ↔ Linear parity: handoff (2026-09-25)

移交给下一个 agent。先读本文件，再读 `.agents/skills/linear-ui-parity/`（方法与门槛都在那里，本 PR 一并提交）。

## 0. 总目标

严格双向对齐：Linear 有的 Orvilo 必须有；Orvilo 有而 Linear 没有的可见 UI 必须删。例外只有 `linear-design` skill 里写明的 Drafts / Try，以及用户明确给出的例外。宣称完成前，必须由没参与实现的独立 subagent 逐页逐状态审查，修复后复审；绿色 PR、单张截图、空数据页都不算证据。

发现问题**不要再靠人眼**：按 skill 的 `references/discovery.md` 跑布局规则、ARIA 清单、字号直方图三遍，覆盖每页的状态矩阵，先把问题清单给用户，再修。

## 1. 待办（按优先级）

### A. 布局规则 / ARIA 探针（云端会话在做）

- 分支 `feat/ui-layout-rule-probes`，起点 `5b985fc9a`：未测试、未审查的草稿（`e2e/src/probes/layoutRules.ts`、`ariaInventory.ts`，`TaskProperties` 加了 `data-testid="task-properties"`）。
- 用户已在 app 里开了云端会话「UI 布局规则探针」接着做。**不要再开第二个**。它会开 PR 到 canary。
- 规格：6 条布局规则（sibling-edge、centered-in-full-row、clipped-text、type-scale、date-format、hover-glyph）+ ARIA diff + E2E（running 任务的属性栏 0 违规，且采到 ≥ 4 行作为正对照）。E2E 依赖 #241 的修复。
- 它交付后：审它的 PR；然后在本地用这些探针跑 issue 详情和项目详情的状态矩阵（default /hover/popover /empty/running / 窄屏 /dark），对 Linear 跑 ARIA 对比（Orvilo 切 en-US），**先出问题清单给用户，不修**。

### B. CI 红灯

- \#238、#240 挂在 Agent 对话 E2E（「删除单条消息」「删除对话」，等 `Orvilo AI` 消息 5s 超时），与改动无关、每次场景不同，疑似 flaky。重跑失败 job 后再判断。
- \#241 失败的是汇总门禁（`Check all PR gates before Vercel`、`Required Quality Gate`），先查是哪个上游 job 导致。
- 从不开 auto-merge，不合并。

### C. 等用户答复

- \#227 在 1440px 下 issue 侧栏排在描述**上方**而不是右侧。要不要修需要问用户。

### D. 已知但未修（探针跑起来后应能自动发现）

- issue 侧栏里程碑显示 ISO 日期（`TaskProjectSection` 的 `milestoneLabel` 直接用了 `milestone.date`，应走 `formatTaskItemDate`）。
- 项目 list /board/timeline 仍硬编码 `MMM D`。
- 侧栏日期被截断。
- issue 详情字号：值 14→13、描述 16/400→15/450、标题 26→24、子 issue 行 12→13。

## 2. PR 栈（全部 open）

| PR   | 分支                                            | base                        | 内容                                                                             |
| ---- | ----------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| #227 | fix/linear-parity-issue-detail-layout           | fix/linear-parity-team-home | issue 详情几何 + 状态图标（主线；其 worktree 属于另一个 agent，别动）            |
| #238 | fix/linear-parity-project-overview              | devin/v6-linear-polish      | 项目 box 图标 + 概览正文墨色降一档                                               |
| #239 | fix/linear-parity-date-display                  | #238                        | 日期：当年不写年、中文带「日」、hover 保留图标、清除移入弹层                     |
| #240 | fix/linear-parity-team-issues-workflow-grouping | #227                        | Team Issues 默认按 workflow 状态分组                                             |
| #241 | fix/linear-parity-issue-single-status           | #227                        | 侧栏只一个 Status 行；`046d2b437` 修负责人 / 标签在 running 时居中（附回归测试） |
| #232 | docs/linear-parity-skill                        | canary                      | 本 PR：`linear-ui-parity` skill + 本移交文档                                     |
| #235 | chore/dev-orchestrator-script                   | canary                      | `dev:env` 工具（skill 的 runtime-setup 依赖它）                                  |

\#239 与 #227 都改了 `AgentTaskItem.tsx`，合并时可能冲突。

## 3. 本地环境

- Electron 候选端 CDP `:9232`；后端 `:3010`；库 `orvilo_linear_parity_20260922`（隔离的对齐验收库，写操作只在这里做）。
- `dev:env`（#235 分支）：`bun run dev:env cdp 9232 app://renderer <expr|@file> [--viewport 1440x900] [--shot f]`；`dev:env switch <worktree>` 切 renderer，取证前回读 renderer 服务的是哪个 worktree 和 commit。
- 验证样本：VYG-2（running），路由 `/ws-useragenttes/task/VYG-2/...`。
- 参考端是用户自己的浏览器（CDP `:9222`）：只用 `dev:env ref open` 开自己的窗口，`ref close <targetId>` 关；Linear 只读；Linear 的截图与快照不进仓库、不发布。

## 4. 硬约束速查

- 与用户用简体中文；commit 英文 + gitmoji；PR 目标 canary 或所依赖的栈分支。
- 共享 worktree：`git commit -- <paths>`；不 reset /clean/stash /broad-add。
- lint-staged 可能拒绝提交而 shell 继续跑：每次提交后读 `git log -1`，推送单独一步。worktree 没装依赖时 pre-commit 会报 `lint-staged: command not found`，把另一个已安装 worktree 的 `node_modules/.bin` 加进 PATH 再提交。
- 每个 bug 修复配一个修前失败的回归测试；不新增组件级 `.test.tsx`。
- 本地不跑全仓 type-check；用 `bun run check --lint --test <files>` 并读测试计数。
- 交付前一次独立 subagent review；密钥在 GCP Secret Manager，不打印。
- 派发云端：Agent 工具的 `isolation: "remote"` 在当前账号会静默退回本地子代理。派发后用 ListAgents 核实标注为 `cloud`；不可用时让用户在 app 里开云端会话。

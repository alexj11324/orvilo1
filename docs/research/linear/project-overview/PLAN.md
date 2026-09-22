# Output plan — Linear Project Overview parity

按 `.claude/skills/clone-website-orvilo` 的 Pre-Flight 第 5 步产出。本文件是本次
对齐工作的**目标与边界声明**，改任何共享文件前先读它。

## Target

| 项           | 值                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| 参考 URL     | `https://linear.app/bdiverifier/project/repository-slimming-and-acp-boundary-hardening-89e1b7831472/overview` |
| 同源其它 tab | `…/activity`、`…/issues`（page-key 复用 `project-overview`，见「状态」节）                                    |
| `<app-root>` | `/Users/alexjiang/Desktop/vibe/orvilo-linear-parity`（git worktree，分支 `devin/v6-linear-polish`）           |
| `<site-key>` | `linear`（沿用仓库既有约定）                                                                                  |
| `<page-key>` | `project-overview`                                                                                            |
| 候选路由     | `app://renderer/ws-useragenttes/project/parity-test-project/overview`（SPA `src/spa` 注册）                   |
| 参考端 CDP   | `:9333`（Brave，已登录 `bdiverifier`）                                                                        |
| 候选端 CDP   | `:9222`（本工作树 Electron）                                                                                  |

> 端口与仓库既有 spec 不同（旧的 `typography.spec.md` 写的是 9222/9223）。**以本文件的 9333/9222 为准**，
> 因为本机当前实例的端口就是这样分配的；旧 spec 的数字是它当时的实例。

## Artifact roots

| 用途      | 路径                                                     | 是否入库          |
| --------- | -------------------------------------------------------- | ----------------- |
| 截图      | `docs/design-references/linear/project-overview/`        | **否，本地 only** |
| 组件 spec | `docs/research/linear/project-overview/components/`      | 是                |
| 行为清单  | `docs/research/linear/project-overview/BEHAVIORS.md`     | 是                |
| 页面拓扑  | `docs/research/linear/project-overview/PAGE_TOPOLOGY.md` | 是                |

**截图为什么不入库**：参考端是真实私有 workspace（真实 issue 标题、成员姓名、项目 URL）。
契约要求「无法授权发布时把敏感截图留在本地，并报告这条未满足的发布要求，而不是重试」，
且此前的上传已被明确拒绝。`docs/design-references/` 已加入 `.gitignore`。
本地可用 `node .agents/acceptance/scripts/cdp-inspect.cjs --port <9333|9222> --viewport 1440x900 --shot <path>` 复现。

`screenshots/` 与 `components/` 是本轮**新建**目录；`docs/research/linear/project-overview/`
下已有的四个文件（`typography.spec.md` / `activity-composer-controls.spec.md` /
`link-modal.spec.md` / `overview-members-updates.md`）是他人已批准产物，**只增不改**。

## 不做的事

- 不替换 scaffold、不引入第二套组件树（shadcn/Tailwind）、不改根 layout。
- 不重命名知识库、不返回模拟保存、不降低权限去模仿参考截图。
- 不把参考端的私有内容（真实 issue 标题、成员姓名、头像）写进任何分发文件。
- 不修改参考端数据；只做只读动作。创建 / 发布 / 删除 / 邀请及未知按钮一律**不点**。
- 不动 `ProjectPropertiesCard.tsx` 里 Dependencies 的既有逻辑。

## 状态（states）盘点与「未知」边界

契约要求：空态 ≠ 非空态。本轮**已知**两端数据基数不同（参考 4 里程碑 / 16 issue 全 Done；
候选 4 里程碑 / 16 task 全未完成），所以：

- 任何数字型差异先归入 **data-delta**，不得当成缺陷。
- 参考端只在**非空**状态下观测过；**空态未观测** → 涉及「删除控件」的改动必须先补空态证据。

## 共享文件所有权

| 文件                                                                             | 本轮谁改     | 说明                                    |
| -------------------------------------------------------------------------------- | ------------ | --------------------------------------- |
| `src/features/Projects/Workspace/ProjectDashboard.tsx`                           | 单一 builder | 主列里程碑区                            |
| `src/features/Projects/Workspace/ProjectPropertiesCard.tsx`                      | 单一 builder | 右栏属性卡（避开 Dependencies 段）      |
| `src/features/Projects/Layout/TabsBar.tsx`                                       | 单一 builder | 头部                                    |
| `packages/locales/src/default/project.ts` + `locales/{en-US,zh-CN}/project.json` | 串行追加     | i18n 三处同 PR；多 builder 同时改会冲突 |

**冲突裁定**：i18n 是唯一的真共享文件。规则：builder **不得**自行改 i18n；
需要新键时在 spec 里列出「需要的键 + en/zh 文案」，由控制器统一追加后再派 builder。
`ProjectDashboard.tsx` 与 `ProjectPropertiesCard.tsx` 由**同一个** builder 串行处理，
因为两处渲染同一批 milestone 数据，分开做会各写一套取值逻辑。

## 构建顺序

1. 采集（参考 / 候选各一个 collector，各自独占一个浏览器，禁止交叉导航）
2. 控制器复核并写组件 spec
3. 统一追加 i18n 键
4. 派 builder（按组件切分，同一共享文件的合并成一个）
5. 组装 + 整页 QA diff（同视口 1440 / 768 / 390）

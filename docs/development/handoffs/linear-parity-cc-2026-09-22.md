# Linear UI parity → Claude Code 交接

## 先读这段

用户已要求 Codex **停止实现，交给 CC**。本文件是交接，不是验收通过。
原始目标不变：通过 CDP/DOM 对齐所有 Linear 对应页面的字体、尺寸、UI、
交互和真实功能，杜绝同名不同行为，补齐缺失功能。不能缩成 Project 或几个按钮。

用户对执行方式的最新纠正：**先完成整页审核与规格，再统一实现，再整页验收**，
不要发现一个控件就立即改一个。用户也要求本轮不使用 subagent。
上一批 Codex 实际只采集了 composer 的部分状态就动手修改，未达到该要求，
因此最后的 composer 改动没有提交为产品代码，也没有验收。

## 版本与交接载荷

- PR：<https://github.com/alexj11324/orvilo1/pull/209>，OPEN / Draft。
- 分支 `devin/v6-linear-polish`，目标 `canary`。
- 本文之前的已推送产品 HEAD：`44afd39e378d9f6334e6a5ab687b8f1cb1caa99a`。
- 原工作区：`/Users/devin/repos/orvilo-cascade`。
- 已完成与未完成的描述以当前代码、真实页面和 issue 最新追加记录为准，
  **不要把历史文档中的旧状态当作当前状态**。

随本文保存的 `linear-parity-cc-2026-09-22.wip.patch` 是最后一批未验收
composer 源码和采集记录的精确快照。它不自动进入产品代码：

```bash
# 在干净的 PR 分支上，完成审核后再决定是否复用。
git apply --check docs/development/handoffs/linear-parity-cc-2026-09-22.wip.patch
```

原工作区中该 patch 所含三文件已经有这些未提交改动，不要重复 apply：

- `src/features/Projects/Updates/index.tsx`
- `src/features/Projects/Updates/ProjectUpdateEditor.tsx`
- `docs/research/linear/project-overview/activity-composer-controls.spec.md`

另外两处原本就存在、非本批所有的 Dependencies WIP，**未收进 patch，勿覆盖**：

- `src/features/Projects/Workspace/ProjectPropertiesCard.tsx`
- `src/features/Projects/Workspace/ProjectDashboard.test.tsx`

远端 checkout 不包含上述两处本地 WIP；若需要它们，应与原工作区 / 所有者衔接，
不能假定 PR 已包含。本文提交仅保存交接文档和 patch，不提交或回滚这些产品改动。

## 用户约束

1. 仅 CDP/DOM；不请求电脑控制、Accessibility、Screen Recording 权限。
2. 不再派本轮 subagent；不要因 Skill 默认分派流程而覆盖用户最新要求。
3. 全 CI 留到最终整体验收；现在跑 scoped checks，检查点用 `[skip ci]`。
4. 继续 Git/PR 管理、同步 Linear issue；保持 Draft，未验收项目不能关闭。
5. 灰色截图背景是用户已确认的查看器现象，**无需修复、不要全局改色或生成查看版**。
6. **保留 inline Properties 的 Members**。用户明确纠正了 “成员只属于右栏” 的错误推断。
7. 空态看不见不等于非空态不存在；不能删数据制造一致、不能把知识库改名伪装文档。
8. 私密截图上传此前被拒绝：留在本地，不重试、不绕过；公开证据要求仍未满足。
9. 活参考中的创建、发布、删除、邀请及未知按钮不在只读采集授权内。
10. 曾意外创建参考空白文档 `/bdiverifier/document/untitled-7746269635ed`，已告知用户；
    不要删除它或关闭相关 tab 来掩盖。当前没有删除授权。

## 仓库 Skill 与执行顺序

必须先读 `.agents/skills/clone-website-orvilo/SKILL.md` 及两份必读引用：
`references/orvilo-contract.md`、`references/inspection-guide.md`。
它是下载上游后适配的版本，不是另起炉灶写的摘要。上游固定 SHA：
`0fc4dca34fcfcfd32108fb67118aa897a6045414`；原文在 `upstream/*.original.txt`
及其 references 子目录，MIT 许可证保留。AGENTS.md 已要求使用该 Skill。

Skill 有边采集边分派的默认流程，但当前用户明确要求先整页审核，且不用子代理；
用户要求优先。建议先交付可检查的页面拓扑、全部控件 / 状态清单、差异与规格，
再执行实现批次。清单必须包含未知和不可安全操作项，不能称作 “全部通过”。

后续代码按 React、TypeScript、测试、路由、数据库、i18n 等领域 Skill 执行。
不要仅为了交接重新跑完整 CI 或重做已有效的验证。

## 环境和浏览器

以下是原工作区的运行配置，接手时重新确认目标、PID/cwd、登录和数据环境，勿盲启服务：

| 用途                     | 地址 / 配置                                    |
| ------------------------ | ---------------------------------------------- |
| 已登录 Linear Chrome CDP | `http://localhost:9222`                        |
| 真实隔离 Electron CDP    | `http://localhost:9223`                        |
| Electron renderer Vite   | `5174`，`apps/desktop`                         |
| 本地后端                 | `http://localhost:37031`                       |
| Electron 数据模式        | `selfHost`，remoteServerUrl 必须是上述本地后端 |
| 本地 PostgreSQL          | `localhost:5432`，数据库 `orvilo`              |

参考精确 project URL 已在 `scripts/ui-parity/composer.example.json` 中。
Chrome 另有 Linear 空白 document tab，不能用宽泛 `linear.app` 匹配任意 tab。
现有本地 fixture：

- `app://renderer/orvilo-dev/project/verify-create-flow/overview`：已存在的无 published update 项目。
- `app://renderer/orvilo-dev/project/wave-2-verify-project/overview`：已有 published update/comments。

采集前先确定唯一 page target、路由和空草稿，再导航。只有一个导航 owner。
最后一批采集将两边都设成 1440×900；也临时检查过 390×900。
最后已知参考停在 Activity/Update，候选在空 fixture 的 Activity/Comment；需重新读取。
不要把这种 viewport 或 CDP handle 当作另一个机器上的稳定配置。

## 已推送的最近成果（均不等于整页完成）

| 提交                    | 内容                                | 已有证据与边界                                                                                             |
| ----------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ce8a733b` / `a3b882ea` | 固化适配 Skill，保存逐字上游档案    | Validator 和原文比较通过                                                                                   |
| `b3f64a4a`              | Add link 弹窗尺寸 / 滚动修正        | 局部 CDP / 响应式；资源功能整体未完成                                                                      |
| `bd7336c2`              | Activity composer 实测规格          | 部分状态，不是完整实施合同                                                                                 |
| `07eb4316`              | confirmed-empty 更新入口            | 外卡 66px、内按钮 32px；未知数据不冒充空态；Members 未删除；点击留白不跳转、按钮进入 Activity/Update       |
| `52350162`              | 通用多步 UI 转换检测器              | 30 项 Node 回归；真实 composer 转换仅 recorded dimensions 为 observed-match                                |
| `44afd39e`              | Project 局部 bundled Inter 与许可证 | 5 处实际 glyph 从 Geist 换成 Inter；抽查颜色未变；10 项字体 / 导航测试、lint；不是完全相同字体二进制或字宽 |

字体资源在 `src/assets/fonts/inter`，来源 `@fontsource-variable/inter` 5.3.0，
OFL-1.1。Project Layout 保留用户字体覆盖与 locale fallback，只覆盖项目字体。
独立复核发现的许可证未随构建分发问题已修：静态 URL 引用 `LICENSE.txt` 并
提供 `rel=license`；Electron 返回 200 / 完整文本，follow-up 无该范围阻塞项。
Google Fonts 字库内部名与参考不同。空态按钮自然宽 196.281px，参考 200.734px；
不要硬编码宽度，应核对字库版本 / 字宽 / 图标 /gap。Portal、Web 实机、暗色、非拉丁等未全验。

曾尝试 pnpm 安装字体，但触发全 workspace 解析，已中止并改为 vendored assets。
package.json/pnpm-lock.yaml 没有改动；过程中本地 node\_modules 有解析 / 链接活动。
后续 Electron 与 scoped tests 正常，但不应把该环境视作干净安装验收。

## 最后一批未验收 composer patch

变更：局部浅色变量、圆角 / 切换器 / Health/Post 样式、header/footer 留白、编辑器 450 字重。
只运行了两个改动文件的 scoped lint，通过且格式化已包含于 patch。
**没有修改后的 CDP 验证、没有回归测试、没有整页验收、没有独立复核。**
用户因流程问题中止了它。不要自动应用、不要把它标成完成。

本轮改动前的新采集确认：

- 同 1440×900 的 Comment/Update、编辑器 focus、Post hover、Health 菜单已观察。
- Tablist26px，单 tab24px；12px/500/18px；全胶囊、border1，header padding12px 12px 0/gap8。
- Health 按钮 24px，icon16px，On track label 为绿色，不是按钮容器的灰色。
- Composer radius10，border1px `lch(97.3 0 282)`，小阴影；不能仅从伪元素 shadow
  属性就断言蓝色焦点环实际画出来，opacity 等尚需检查。
- Editor 文字 15px/450/24px、横向 16px，region70px / 前间距 12px；footer52px。
- Comment 模式隐藏 Health 与 Write with Agent，提交文案是 `Comment`。
  仓库 en/zh/source 早已正确，但旧 Electron 实例显示 `Post comment`，可能加载 / 缓存问题，
  根因未确认。不要重复添加 locale 键。
- 参考空正文按钮 disabled=false，不证明空提交成功；Update 还有项目变更摘要，
  本地没有，不能直接取消本地非空正文校验。
- 390px 参考 Properties 覆盖内容，本地 unmount 右栏；这是框架 / 交互差距，未解决。
- Health 图标的真实形态仍不匹配（现有 offTrack 使用 CircleCheck 尤其需复核），
  不要只改颜色就判通过。

## 关键功能缺口与代码调查

### 附件（ORV-125，尚未实现）

参考仅实测入口 `Attach images, files, or videos`，28×28，hidden file input
multiple=true/accept 为空。大小、MIME、attachment-only 发布、失败 / 重试规则未观察。

可复用 `src/features/EditorCanvas` 真上传 / 进度与
`src/features/PageEditor/DocumentComments` 的 Markdown+editorData、草稿恢复。
但 `/f/:id` 当前是未鉴权的按 ID 读取；FileModel 的 uploader-private/workspace-public
不能表达项目成员权限。**不能把裸文件 URL 塞进 editorData 就算完成附件功能。**

建议服务端边界（是调查方案，未实施）：可信 update-file 关联、nullable editorData、
幂等 clientId、完整 fileId 权限校验、基于 project readable 的预览 / 下载、读取时刷新附件 metadata。
UI 覆盖独立上传失败 / Retry/Remove、上传中禁发、提交失败保留、刷新回显；清理未引用附件
时扩展引用检查，不能误删 Library 复用文件。回归覆盖伪造 / 跨项目 fileId、私有项目成员、
撤权访问、重复提交、旧 Markdown 兼容。不要未经证明放开 attachment-only 发布。

### 项目变更摘要与历史（ORV-125/132，尚未实现）

现有 ProjectModel.createUpdate 发布事务和当前 project/task 值可复用；但没有可靠
project 属性 from/to 历史或 update summary snapshot，task 活动也不足以重建全部历史。
不能拿当前值拼 “假历史” 或虚构进度曲线。需先确认参考的 baseline、progress 公式、
空正文语义、comments 是否重置 baseline，再实现服务端计算 / 持久化与事件数据。

主要调查入口：`packages/database/src/models/project.ts`、schema `projectUpdate.ts`、
`task.ts`、`linearSync.ts`、server project router、`projectIssueProgress.ts`。

### Resources / Properties / 其他页面

Add document 必须是真正的项目文档创建 / 编辑 / 权限 / 刷新行为，不是知识库改名。
Lead/Members/Labels/date/priority 已有多批真实保存与刷新验证，但邀请、分组、创建标签、
各种错误 / 权限 / 鼠标间歇性问题和全部状态没有完整验收。Members 误删候选从未集成。
标题 input vs contenteditable、描述保存时机、选区 toolbar、历史操作等仍有差距。

## Linear issue 索引

接手先读取最新描述 / 状态；早期描述有已过时判断。不要从这张表直接关闭任何项。

| Issue                     | 范围                                                     |
| ------------------------- | -------------------------------------------------------- |
| ORV-117 / ORV-5           | 母任务 / 总目标                                          |
| ORV-125                   | Update/Comment、编辑器、附件、摘要、Agent 能力、Activity |
| ORV-129                   | Properties、Members/Labels/ 邀请 / 状态语义              |
| ORV-130                   | Resources、链接 / 项目文档                               |
| ORV-131 / 132             | Milestones / Progress 与历史分组                         |
| ORV-133                   | 全页面框架、字体、缺失 / 多余控件、响应式                |
| ORV-134                   | 通用检测器与全控件覆盖                                   |
| ORV-119 / 120             | Workspace settings（最后）/ Account preferences          |
| ORV-121 / 122 / 123       | Triage / Cmd+K / Context menus                           |
| ORV-124 / 126 / 127 / 128 | Health / 缩进 / Notifications / Initiatives 与 Cycles    |

总体页面还包括 Projects / 新建项目、Inbox、My issues、Views、Teams、Members、Reviews
及上述设置专项；不能把 Project 局部状态当作全目标。

## 检测器：能证明什么、不能证明什么

```bash
node --test scripts/ui-parity/*.test.mjs
node scripts/ui-parity/run.mjs scripts/ui-parity/composer.example.json /tmp/cc-parity-evidence
```

第二条会操作已审核的真实两端页面，先确认无草稿与唯一匹配 tab；不是纯静态命令。
`authorization.mjs` 在连接前精确验证获审动作 / 目标 / 序列；这是权限边界，
不是硬编码预期结果。新增场景需审核权限，不可自称 read-only 就执行任意 Delete→Confirm。

映射绑定起点原始 path/hash 前缀或 query key，保留重复参数及顺序，防止
Project/Team 不同目的地被规范化成同一个。30 项测试包含上述反例。
它比较有限 route/dialog/menu/editor/selected/expanded/focus 转换，能记录可信事件，
**不覆盖全页面视觉、所有控件、权限、持久化和全部用户路径**。Observed-match 只代表
所测转换维度，不是 parity certificate；超时 / 未观察必须留 inconclusive。

## 本地证据与资料（不随本文上传）

- `docs/development/linear-parity-project-audit.md`：长期 ledger，前部状态过时，读后续追加。
- `docs/development/linear-parity-workflow.md`：指向固定 Skill。
- `docs/research/linear/project-overview/`：link-modal、overview-members-updates、
  activity-composer-controls、typography 规格，均有明确部分覆盖边界。
- `/tmp/orvilo-parity-context-20260922/`：检测器双端 trace、comparison、截图。
- `/tmp/orvilo-project-page-survey/`：旧整页 DOM / 文字 / 样式采集，不是完整交互扫描。
- `/tmp/orv-composer-9222-*.json|png` 与 `9223` 对应文件：最后一轮状态采集。
- `/tmp/orv-update-activity-9223.png`、`/tmp/orv-update-overview-9223.png`：会被覆盖的
  scratch 截图；文件名不是稳定 revision 证明。
- `/tmp/orv-overview-inspect.mjs`、`/tmp/orv-font-inspect.mjs`、
  `/tmp/orv-composer-batch.mjs`：临时 CDP 脚本。先读再用，避免重复导航、覆盖证据。
  旧 `/tmp/project-resource-reference.mjs` 曾误创建文档，**不要再运行**。

这些 /tmp 文件只在原机器、且可能失效；远端 CC 应重新安全采集，不能假装已拿到。
截图含私密内容，本文 / PR 不附带图片。此前记录的测量不能取代当前运行结果。

## CC 的首个工作批次

1. 读用户最新要求、AGENTS/Skill、当前 PR 差异、dirty 状态与 issue；不立即改产品代码。
2. 建立全页面范围清单，然后对本批 Project Overview/Activity/Issues 的整页拓扑、
   控件和状态完整盘点，含 shell/header/footer、侧栏、弹层及被遮挡背景。
3. 同角色 / 数据状态 / 视口比较，完成滚动、hover/focus、可安全点击、1440/768/390 检查。
   空 / 单条 / 多条、loading/error、不可授权操作分别列 observed/inferred/unknown。
4. 形成集中差异表：缺失、多余、视觉不同、行为不同、未验证；写明引用证据 / 代码 owner/
   验收方式与共享基础依赖。先解决审计覆盖，再决定是否复用本交接 patch。
5. 按共同根因统一实施，禁止以单个按钮绿测代替整页验收；所有真实写入在获授权的
   本地 fixture 验证保存→刷新→权限→失败恢复，不对参考盲写。
6. 同步 issue、commit/PR 证据与剩余项。最后做原范围整体验收和完整 CI。

当前不具备全目标完成证据，PR 保持 Draft。Codex 到此仅负责交接，后续由 CC 接手。

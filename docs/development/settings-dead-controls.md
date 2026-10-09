# 设置页死控件与失败无反馈清理

来源：`tasks/ui-audit/settings-dead-controls.md`（静态审计，编号沿用）。原则：控件声称的能力不存在就删除入口；能力存在、接线很小就接上；失败无反馈就补 toast 并回滚。只改前端。

## 处理结果

| #      | 处理 | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | 删除 | Labs「Artifact 部署」条目与两个 locale key。搜索索引由 `LAB_FEATURES` 派生，随之消失。偏好 schema 字段 `enableArtifactDeployment` 保留。                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2-4    | 删除 | 重新生成 / 删除最后一条 / 删除并重新生成。Conversation store 里动作存在（`regenerateAssistantMessage`、`delAndRegenerateMessage`、`deleteMessage`），但要接上需要：选定 “最后一条” 的口径、避开进行中的生成、防止多个 Conversation 面板（话题、线程、Portal）重复注册、给无确认的键盘删除加护栏。这不是小接线，三项一起从 `HOTKEYS_REGISTRATION`、类型和 locale 中删除。用户已存的旧键值留在 jsonb 里：`hotkey` 的 schema 是 `z.any()`，不会解析失败；页面按注册表渲染，冲突检测（`getHotkeyConflicts`）也只统计注册表内的 id，旧键不会造成幽灵冲突。 |
| 5      | 删除 | `switchAgent`（Ctrl + 数字）只有展示，无注册点。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 6-8    | 收起 | 工作区设置「存储」页：移除侧栏项与 Admin 空分组、路由叶子、页面组件、`WorkspaceSettingsTabs.Storage` 与专属 locale。旧链接 `/:slug/settings/storage` 通过 `WORKSPACE_SETTINGS_ALIASES` 重定向到设置首页；同时把 `storage` 从 `WORKSPACE_SETTINGS_TABS` 去掉，避免个人存储页的链接在工作区内被改写成已退役的工作区路径。                                                                                                                                                                                                                               |
| 9      | 修   | 移动端 `/chat/settings` 去掉无内容的 Prompt 标签；初始标签取第一个有内容的（`resolveActiveTab`）。                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 10     | 修   | AgentRules 每行整行做成 `Link`，指向与「打开规则」相同的页面；无目标时不显示箭头。                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 12     | 修   | 设备详情保存失败：toast，并把失败请求携带的名称或默认目录回滚到已存值。                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 13     | 修   | 更新渠道保存失败：回滚并 toast（`runWithRollback`）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 14     | 修   | Windows Shell 模式保存失败：toast，并重新读取已存值。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 15     | 修   | Web 端隐藏仅桌面端生效的 4 个快捷键（切换标签、下一 / 上一标签、终端面板）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 16     | 删除 | 「获取移动应用」一行与 `getMobileApp` 文案。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 19     | 修   | 给 Notification 加 `gate`（桌面端或部署含业务页），Web 直链返回 NotFound。                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 26, 27 | 删除 | `BuiltinSkillItem.tsx`、`WorkspaceSetting/Title.tsx`，`git grep` 无引用。                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 未做

- 28：`ModelSwitchPanel/components/ControlsForm/index.ts` 在另一项重做的范围内，不碰。
- 24、25：ProviderBindings 与旧 Linear 页是否废弃由 #568 确认，不删。
- 17、18、11、20-23：需要产品判断或后端，见 #568。

## 验证

`bun run check`（lint + 相关测试）通过。未在 Electron 上验证：Web 与桌面快捷键页差异、更新渠道与 Shell 模式失败回滚、设备详情失败提示、旧存储链接重定向。

## 延迟失败与新草稿

设备名称或默认目录的失败回滚只在当前草稿仍等于该次提交值时执行，保留等待期间继续输入的新草稿。Electron 原生 ModalHost 挂载交付的 DeviceDetailPanel，通过 bridge 前 fixture-only fetch 拦截延迟失败，名称 / 目录各覆盖新草稿与未改草稿：旧实现 4 cases 重现新草稿丢失；修复后 4 cases 保留新草稿、未改草稿回滚。所有设备写入均未转发。仅组件级原生回归证明，不声称完整设备路由、设备持久化或网关连接验收。

现有相关测试 5 文件 46 cases 通过；共享 node_modules 的 hotkey package 路径用临时本地别名校正，未改项目测试配置。

## Workspace route parity integration

The retired workspace Storage URL remains a bookmark redirect to the workspace settings index. It is deliberately excluded from automatic workspace prefixing, so personal storage stays personal. The shared Web/Electron parity test now compares registered tabs against both live workspace tabs and declared legacy aliases; existing alias tests still assert their exact redirect destinations. The prior owning CI failed both parity cases for the additional `storage` redirect; the scoped shared-router and alias suites pass all 81 cases after this correction. Canonical Issue hotkey copy is preserved while dead delete actions are removed.

## Round 3 follow-ups

- **Hotkey conflicts across surfaces.** The Electron global shortcuts (Quick Composer, Quick Chat, Show App, App Settings) live in a separate store from the in-app shortcuts, and the Desktop rows passed no `hotkeyConflicts` at all, so recording ⌘K on the empty Quick Chat row was accepted while Command Palette uses ⌘K. `getHotkeyConflicts` takes an `external` list (matched by key combination only, because `showApp` exists on both sides) and `getDesktopHotkeyConflicts` feeds in-app bindings to the Desktop rows; Desktop also toasts the existing `hotkey.errors.CONFLICT` message before calling the main process. The in-app rows receive the desktop bindings when running in the desktop app. The retired-id rule is unchanged (stale ids never block).
- **`navigateToChat` ("切换至默认会话") is kept**: `useNavigateToChatHotkey` registers a handler through `useRegisterGlobalHotkeys`.
- zh-CN labels for Quick Chat / Quick Composer are translated.
- Settings > About hides the "Get desktop app" section inside the desktop app.

## 2026/10/09 移除 Labs 设置页

Labs 里每个开关的默认值都是开（`DEFAULT_PREFERENCE.lab`），页面实际只剩一个把核心功能关掉的入口，所以整页移除，原先被它控制的功能一律无条件启用。

| 项   | 处理                                                                                                                                                                                                                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开关 | `enableAgentGraphConfig`、`enableInputMarkdown`、`enableMessageTextSelectionActions`、`enableSelfLearning`、`enableTopicAcceptance`、`enableProjects`、`enableDesktopSplitView`、`enableHeteroSessionImport` 的读取点全部去掉条件。`enableTaskVerify`、`enableArtifactDeployment` 早已没有读取点，只删选择器。桌面端专属功能仍由各自的 `isDesktop` 判断。 |
| 代码 | 删除 `LAB_FEATURES`、`labPreferSelectors`、`src/features/Settings/labs`、工作区 Labs 路由与 `ProjectDisabled`（它唯一的出口是 `/settings/labs`）。                                                                                                                                                                                                        |
| 入口 | 个人与工作区两个侧栏、移动端标题映射、组件映射、搜索索引（含 Labs 标签关键词）全部去掉。`/settings/labs` 通过 `SETTINGS_CAPABILITIES` 的 `aliasOf` 重定向到 Advanced；`/:slug/settings/labs` 通过 `WORKSPACE_SETTINGS_ALIASES` 重定向到 Advanced，并从 `WORKSPACE_SETTINGS_TABS` 去掉。`SettingsTabs.Labs` 枚举值保留，作为退役注册表的键。               |
| 文案 | 删除 `labs` 命名空间（`default/labs.ts`、en-US、zh-CN）、`settingsSearch.tabKeywords.labs`、`project` 里的 `disabled.*`。其他语言包的 `labs.json` 留给每日 i18n 流程清理。                                                                                                                                                                                |
| 保留 | 持久化的 `preference.lab` 字段、`UserLab` 类型和默认常量不动，避免数据迁移；只是不再读取。                                                                                                                                                                                                                                                                |

## 2026/10/09 移除无读取方的设置项

只删控件与死代码；持久化类型字段与默认值保留（见 "未做"）。

| 项                                                                                       | 证据                                                                                                                                                                                                              | 处理                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Service model「Prompt Rewriting / AI Image Topic Naming / Auto context compression」三行 | `src`、`packages`、`apps` 全仓搜索：`promptRewrite` 仅有 selector 与服务端 env 默认值；`generationTopic` 无读取（图片工作台已退役）；`historyCompress` 唯一读取方是 `internal_summaryHistory`，该 action 零调用方 | 删除三行、两个 selector、整个 `state/memory.ts`（类内只剩这一个方法）及其在 `agentRun/actions/index.ts` 的接线、en-US /zh-CN/default 的 `systemAgent.{key}.*` 文案 |
| About 页 Blog、服务条款、隐私政策                                                        | `curl` 官网 `/blog`、`/terms`、`/privacy` 均返回 404                                                                                                                                                              | 删除 Blog 卡片与整个 Legal 分组、`common` 的 `blog` / `legal` / `terms` / `privacy` 文案（仅 About 使用）                                                          |
| 旧 Linear 同步设置页 `WorkspaceSetting/Linear` 及路由桩 `settings/linear/index.tsx`      | 全仓无导入（含测试、barrel）；`/:slug/settings/linear` 由 `sharedMainAreaLeaves.tsx` 重定向到 `imports/linear`                                                                                                    | 删除页面与路由桩，保留重定向                                                                                                                                       |

### 未做

- `DEFAULT_SYSTEM_AGENT_CONFIG` / `UserSystemAgentConfig` 中的 `promptRewrite`、`generationTopic`、`historyCompress` 字段，以及 `parseSystemAgent.ts` 的 `promptRewrite` 默认值：已持久化到用户设置，服务端 env 解析测试仍断言 `historyCompress`，删除需要迁移，保留。
- `TERMS_URL` / `PRIVACY_URL`：登录页与授权弹窗仍在用，只移除 About 引用；`BLOG` 常量已无引用，但在 `packages/const`，本次不动。
- `workspaceSetting.linear.*` 文案：`LinearImport` 仍共用大量键且存在模板拼接键，无法证明旧页独有，保留。
- 存储页 `useTransferAgentsFormItem`：位于 `src/business/client/hooks`，是业务 overlay 注入点，保留。
- `agentMeta`、`topicAutoSummary`、记忆相关行仍在调查，未触碰。
## 2026/10/09：移除 Agent 标签与空 Security 标签页

Owner 决定：删除 Agent 标签功能和空的 Security 设置标签页。只做前端删除，不重组、不改名。

- **Agent 标签**：标签只装饰 Agent 列表，Issue 指派、编排、执行都不读它。删除个人与工作区设置页（`src/features/Settings/labels`、`src/features/WorkspaceSetting/Labels`、工作区路由叶子）、两处侧栏入口、`WorkspaceSettingsTabs.Labels`、Agent 条目菜单的标签子菜单、Agent 列表页的标签胶囊与「按标签分组」、`useFetchAgentLabels`、home store 的 label slice 与 `agentLabelKeys`、客户端 `agentLabelService`，以及仅这些界面使用的 en-US /zh-CN/default locale key。
- **Security 标签页**：`SettingsTabs.Security` 只是 `<Navigate to="/settings">`，没有侧栏入口。删除组件、组件映射与 `mobile` 参数分支。侧栏的 “Security & access” 分组（凭证与 API Key）是另一回事，保留。
- **旧链接**：`SettingsTabs.Labels` / `SettingsTabs.Security` 枚举成员保留（注册表按枚举全量登记），状态改为 `retired` 并 alias 到设置首页 `Profile`；工作区 `/:slug/settings/labels` 通过 `WORKSPACE_SETTINGS_ALIASES` 重定向到设置首页，并像 `storage` 一样从 `WORKSPACE_SETTINGS_TABS` 去掉，避免个人链接被改写到工作区路径。持久化的 Agent 列表 `groupBy: 'label'` 会被 `normalizeAgentListViewOptions` 归一为 `none`。
- **保留**：服务端 `apps/server/src/routers/lambda/agentLabel.ts`、DB 模型与 schema、`SidebarAgentItem.labels` 类型字段（后端清理另开 Issue）；Issue 标签（`taskLabel`、`ProjectLabelPicker`、`TaskLabelSelector`）和 `members.agentLabel`（“Agent” 文案）与此无关。
- **防回潮**：`retiredSettingsSurfaces.test.ts` 断言两页、工作区镜像、客户端 store /service/hook 不存在，组件映射与侧栏不再引用，注册表别名仍在。
- **验证**：`bun run check`；未在 Electron 与 Vercel 预览验证（后续进行）。

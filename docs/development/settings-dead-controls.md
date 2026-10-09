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

## 2026/10/09 删除对话时代的服务模型功能

Orvilo 以看板为中心，chat 只用来和 Agent 说话。以下功能连同设置一起删除，只改前端；后端与持久化字段留给后端 issue。

| 功能             | 删除内容                                                                                                                                                                                                                               | 保留                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 消息内容翻译     | 服务模型一行；`store/chat/slices/translate`；消息菜单与右键菜单的翻译项；`Extras/Translate`；`chainTranslate` / `chainLangDetect` 两条 prompt 链及测试。                                                                               | `ChatTranslate` 类型、`updateTranslate` 路由、`messageTranslates` 表、追踪场景常量。           |
| 语音合成（TTS）  | 设置里的 `ttsModel` 块与 `enableSTT` 门；`webapi/tts/openai` 路由；`useTTS`；`Extras/TTS`；`store/chat/slices/tts`；`store/file/slices/tts`；消息菜单与右键菜单的 TTS 项；`currentTTS`、`currentAgentTTS*` 等无调用方的选择器。        | `tts` 持久化设置与 Agent 配置的类型与默认值、`enableSTT` 特性开关本身、`@lobehub/tts` 依赖。   |
| 跟进建议         | 服务模型一行；`useChatFollowUp` 及其四个接入点；`FollowUpChips`；`store/followUpAction`；`services/followUpAction`；聊天输入参数里的跟进建议开关。                                                                                     | `chatConfig.enableFollowUpChips` 字段、服务端 `followUpAction` 路由与 prompt 链。              |
| 输入建议         | 服务模型一行；`InputEditor` 里的补全与反馈逻辑；`ChatInput` store 的错误断路器；`InputCompletionErrorAlert`；业务槽 `useBusinessInputCompletionErrorAlert`；`inputCompletionError`；`feature.inputCompletion`。                        | 服务端 `aiChat` 路由里的补全入口与追踪；`input.inputCompletionError.retry`（语音消息复用）。   |
| 档案信息生成     | 服务模型一行；`AgentSetting` store 里的 `autoPickEmoji` / `autocomplete*` 与 `internal_getSystemAgentForMeta`；`useAgentSettings` 与无人使用的 `instanceRef`。                                                                         | 服务端 `generateSkillMeta`。                                                                   |
| 话题自动总结     | 服务模型两行（开关 + 模型）与自定义提示词输入；`topicAutoSummary` 选择器。                                                                                                                                                             | 服务端工作流与 `topicSummary` 数据模型。                                                       |
| 开场白与建议问题 | Settings → Agents 的开场设置区块；旧版 Agent 设置里的「开场设置」页签（`ChatSettingsTabs.Opening`）；无调用方的群组设置弹窗；Portal Agent 详情、AgentHome、群组欢迎页里对开场白与建议问题的读取；`AIChatbot/Suggestions`；相关选择器。 | `openingMessage` / `openingQuestions` 持久化字段与类型；Agent Builder 工具与上下文注入的读写。 |

每个被删的 `systemAgent` 键同时删除了选择器与 en-US、zh-CN 与 default 文案；其它语言交给每日 CI。`UserServiceModelConfig` 的字段与 `DEFAULT_SYSTEM_AGENT_CONFIG` 里的默认值保留：去掉字段需要迁移，且 `parseSystemAgent` 仍按这些键解析部署配置。

### 需要后端处理

- 服务端 `followUpAction` 路由、`aiChat` 的输入补全、`topicAutoSummary` 工作流与 `generateSkillMeta`，以及对应的 prompt 链与追踪场景。
- `systemAgent` 里六个键的字段与 `parseSystemAgent` 的解析；`tts` 设置与 `enableSTT` 开关；`messageTranslates` 表。

### 未决

- 旧版桌面 Agent 设置弹窗（`openAgentSettingsModal`）在三个页签（规则、自我迭代、Graph）都被开关关掉时没有页签；它唯一的入口 `routes/(main)/agent/profile` 已无路由（`/agent/:aid/profile` 重定向到 Settings → Agents），未做处理。
- 语音转文字（STT）没有任何可达界面，只剩无人读取的 `tts.sttModel` 等持久化字段，未做处理。

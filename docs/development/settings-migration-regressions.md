# 设置页迁移回归修复

来源：`tasks/ui-audit/settings-vs-upstream.md` 第 7 节与 `settings-dead-controls.md` 的设计违规项。跳过 `Settings/provider/**` 与 `ModelSwitchPanel/**`（另有重做）。

## 已处理

- 复制按钮改用 `CopyButton`（显示 “已复制”）：`ApiKeyDisplay`、`ViewCredModal`、`ToolDetectorSection`。`ApiKeyModal/Content` 由 #513 覆盖，provider 的 `ModelItem` 不在范围。
- 三处密码框（代理、新建凭据、编辑凭据）改用 `FormPassword`（带显隐按钮）。`FormPassword` 同步修了两点：空值保持受控（表单重置后能清屏），眼睛按钮的 aria-label 本地化。注意：`FormPassword` 在失焦或回车时才提交值。
- 凭据行与 API Key 行：名称和徽标横排、有间距，徽标用 `Badge`，长名称截断。
- 查看凭据弹窗的提示改用 `Alert`（警告、错误、信息三种语义）。
- 去掉 `ApiKey` 名称上失效的 `group-hover:text-primary`：行悬停底色已由 `LiteTable` 提供，DESIGN.md 里悬停是浅色洗色而不是主色文字。
- 侧栏搜索框恢复清除按钮（并支持 Esc 清空）。
- 只放图标的按钮：通知页两个试听按钮、连接器 “添加” 按钮改 `size="icon"` 并补 `aria-label`；凭据行 “更多” 按钮的名称从 “编辑” 改为 “更多”；连接器连接中的转圈按钮补 `aria-label` 与 `aria-busy`。
- 七个页面的加载占位统一成 `SettingsSectionSkeleton`（高级、通用、实验室、记忆、通知、代理、快捷键三段）。
- 工作区设置容器底色改为 `bg-card`，与个人设置的 `colorBgContainer` 一致（主区面板面）。
- B1：实验室与高级页的 `!important` 改为 `[&_.ant-form-item-row]:items-center`。
- B2：`AgentConnectors` 中未定义的 `--lobe-colors-neutral-500` 改为 `text-muted-foreground`。

## 跳过及原因

- 被其他 PR 覆盖：#513（API Key 弹窗复制反馈）、#551（`ViewCredModal` 与 `ToolDetectorSection` 复制按钮、`DeviceItem` 更多按钮的 aria-label）。#547 只改了转圈，没有改初始骨架，所以骨架统一照做。
- B4：两处都在 `ModelSwitchPanel` 与不可达的旧 Linear 页，不改。B5：ollama 关闭按钮在 provider 目录，`DeviceItem` 由 #551 处理。
- 需要产品判断或先核实上游：GroupForm 折叠与分隔线、Profile “账户” 标题、“渠道” 组合并、Devices 分组归属、语言下拉搜索、凭据空状态插图。

变基集成保留 busy 状态的既有 Spinner 导入；初始加载使用 SettingsSectionSkeleton。两处 busy Spinner 导入遗漏由本次 CI Typecheck 的 TS2304 证实并补回，最终类型结果仍由修复后 CI 负责。

## CI 滚动场景隔离

本分支的 Web E2E 在 `AGENT-SCROLL-001` 的贴底断言失败，实际自动滚动设置已在聊天页确认开启。这不是 API 配额错误。排查发现滚动 fixture 按相同提示词和时间查找消息，却没有限定用户；CI 三个 Cucumber worker 共用数据库，可能误读另一 worker 的消息，再把另一轮的已完成状态当成当前轮完成。

消息查询现在同时限定 `TEST_USER.id`，它由 run ID 和 `CUCUMBER_WORKER_ID` 派生；worker 内场景顺序执行。真实本地 PostgreSQL 使用事务内临时表运行原函数：两个用户发送同一提示词，旧代码选择另一用户的消息并读取 `done`，修复后选择当前用户消息并保留 `running`。另验证当前用户独有消息可读、只有另一用户消息时不冒充当前发送；事务最终回滚，没有写应用数据。

这是已复现的 fixture 竞态；旧 CI 未记录被选消息所属用户，不能据此断言历史失败一定由它造成，也不能声称滚动产品行为已通过。修复后的 owning Web E2E 仍须通过。

## 侧栏搜索语义回归

Owning CI 的现有 `AppSidebar.test.tsx` 四个侧栏键盘与查询保留用例失败：输入组未传 `type="search"`，实际可访问角色成为 textbox。现在仅在原 `InputGroupInput` 上恢复 search 类型，保留原断言与完整行为测试。本地修复前四例失败，修复后同一文件全部 26 例通过，包含键盘展开 / 聚焦和折叠后查询保留。此前消息隔离修复后的 owning Web E2E 已通过 36 scenarios / 221 steps；这项搜索语义修复仍须由新的 owning CI 验证。

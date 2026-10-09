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

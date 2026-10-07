# 权限架构：工作区协作 + 项目治理 + Agent Use 名单

**政策已批准实施。2026-10-06。** 当前依据：隔离 worktree `issue-ui-corrections/orvilo1`，HEAD `4b2af76e2ccd1d804cdf98e6bdd2c932a9a298b7` 加冻结 WIP。以下是源码与一手资料研究，不能代表旧缓存后端或真实运行已经生效。用户已批准按本文政策并行实施及独立最终验收；旧 private 数据公开与历史角色转换仍须经过逐记录迁移预览审批。

## 一个简单建议

复用 Workspace **Owner / Admin / Member / Viewer**。所有活跃成员读取工作区 Project、Issue 和 Issue 对话；可写成员直接协作编辑普通 Project/Issue 内容，不要求先加入 Project。

Project 成员界面只保留**参与者 / 管理者**，复用 `contributor / manager` 存储。名单是参与信息；manager/admin 治理成员、设置、删除和完成审批。创建者初始 manager，Lead/assignee 只表达责任，不自动增加权限。个人独立资源继续仅本人范围。

Agent 只有**一张所选成员 Use 名单**，创建者初始勾选且可取消；Manage 不推导 Use。Device 复用现有归属 /shared 注册表、工作区写上限与真实 runtime 就绪检查，不新增设备 ACL 名单。Document/KB 保留自身 ACL，关联或作为附件不会自动公开内容。

用户已确认：Issue 对话对所有活跃工作区成员可读；Agent Use 按所选名单；没有 Use 时保留只读对话和灰色禁用的 Send/Run/Answer/Pause/Stop；尽量简单。本文目标能力表已获用户批准，作为 Orvilo 实施政策；竞品资料仅提供依据，不代表竞品默认规则。

## 一手资料支持什么

| 来源    | 确认的事实与采用的原则                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linear  | 公共 Team 的 Issue/Project 跨团队开放，成员可协作改 Issue；Lead 表达责任，Project 成员表达参与。采用工作区普通协作与责任 / 管理分离。资料未证明 Lead/member 独占 Project 管理权。[Teams](https://linear.app/docs/teams)、[Project overview](https://linear.app/docs/project-overview)、[Edit issues](https://linear.app/docs/editing-issues)                                                                                                    |
| Plane   | 当前文档区分普通贡献与管理，Lead 是信息字段，评论编辑仅作者。借用操作范围和作者归属，不复制完整四 Project 角色或 Guest。[Member roles](https://docs.plane.so/roles-and-permissions/member-roles)、[Manage project members](https://docs.plane.so/core-concepts/projects/manage-project-members)、[Matrix](https://docs.plane.so/roles-and-permissions/permissions-matrix)                                                                       |
| Multica | 所检查代码将 Agent invoke 与 view/manage 分开，Admin 没有 invoke 自动绕过；private runtime 绑定按机器所有者判断。采用 AgentUse≠Manage、机器另查。[Agent ACL 源码](https://github.com/multica-ai/multica/blob/b4ca5b4a23e68b26292a680dca7689a952bb1cd5/server/internal/handler/agent_access.go#L76)、[Runtime 源码](https://github.com/multica-ai/multica/blob/b4ca5b4a23e68b26292a680dca7689a952bb1cd5/server/internal/handler/runtime.go#L863) |

Linear 依据官方文档；Plane 当前文档与 Community commit `5f7d92784c403f76284f0f16718f320221dc7fec`存在角色、评论治理差异，不合并成一个已验证产品；Multica 依据官方源码 commit `b4ca5b4a23e68b26292a680dca7689a952bb1cd5`及文档。没有做竞品线上 mutation 验收。Multica 的私有 direct chat 和按 View 取消任务规则不符合本次 Issue 公开 /noUse 不可 Stop 要求，不采用。[Plane Community 角色定义](https://github.com/makeplane/plane/blob/5f7d92784c403f76284f0f16718f320221dc7fec/apps/api/plane/app/permissions/base.py#L15)、[Multica 取消源码](https://github.com/multica-ai/multica/blob/b4ca5b4a23e68b26292a680dca7689a952bb1cd5/server/internal/handler/chat.go#L1759)。

## 已批准的冻结能力表

每次工作区操作先检查**真实调用者、同一 workspace、当前活跃成员和 workspace 能力上限**；个人独立资源保持本人范围。Viewer 不能因 manager / 作者 / 旧 Use 行重新获得写或执行权；暂停、移除、跨 workspace 全部拒绝。

| 操作                                                                                    | Owner / Admin                                                                 | Member                                   | Viewer                  |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- | ----------------------- |
| 工作区 Project/Issue/Issue 对话读取                                                     | 是                                                                            | 是                                       | 是                      |
| 创建 Project/Issue；普通字段、状态、日期、milestone、Project/Team 关联编辑；更新 / 评论 | 是                                                                            | 是，不需要加入 Project                   | 否                      |
| 本人评论文字编辑                                                                        | 是                                                                            | 是                                       | 否                      |
| 他人评论文字编辑                                                                        | 否                                                                            | 否                                       | 否                      |
| 评论删除                                                                                | 本人或 workspace 治理删除                                                     | 本人；Project manager 可治理所属项目评论 | 否                      |
| Project 成员 / 角色、设置、删除、完成审批                                               | 是                                                                            | 仅该 Project manager                     | 否                      |
| Issue 删除                                                                              | 是                                                                            | Issue 创建者或所属 Project manager       | 否                      |
| 工作区 Agent 安全 profile 读取                                                          | 是                                                                            | 是                                       | 是                      |
| Agent 配置与 Use 名单管理                                                               | Agent 创建者或 workspace admin/owner                                          | 仅 Agent 创建者                          | 否                      |
| Agent Send/Run/Answer/Pause/Stop                                                        | **必须在 Use 名单且有执行上限**                                               | 同左                                     | 否                      |
| Device registry 读取、文件读 / 搜索 / 预览                                              | 现有归属 /private/shared 可见规则；文件仍需批准目录                           | 同左                                     | 同左，不获得写 / 执行权 |
| Agent 在 Device 执行                                                                    | 实际 AgentUse + 实际调用者的 Device 可达授权 + 安装 / 在线 runtime + 批准目录 | 同左                                     | 否                      |
| 直接 Device 文件写 / 移动 / 重命名 / 删除                                               | Device 可见 + workspace 写上限 + 批准目录                                     | 同左                                     | 否                      |
| Device 配置 / 删除 / 共享范围                                                           | 保留现有 enroller/workspace owner 条件，Admin 不自动扩权                      | 保留 enroller 条件                       | 否                      |

边界说明：

- 普通 status 编辑仍遵循已有 Project 完成审批、reviewing/completed 生命周期与运行 fences，不能用普通 Edit 绕过最终审批。
- Project 名单不限制普通协作，不出现四种 Project ACL 角色 picker；`projects.userId`保留创建审计，后续治理按 manager/admin。Lead/assignee 不授予 AgentUse、DeviceManage 或 ProjectManage。编辑 Issue 指令字段属于普通内容；发送给 Agent 或触发执行仍须实际 AgentUse。
- AgentUse 只读 per-user Use 名单；旧 per-user edit 转换后保留 Use，global General Access edit 不变成 Use。创建者初始写入明确 Use 行，取消后也不能执行。Manage 与安全 profile、完整配置 /secret administration 分别检查，配置秘密不会因 Issue 公开而返回。现有 Agent Group 额外 Use 上限保留，Project 成员不自动获得任何 AgentUse。
- 工作区 Agent 删除按创建者 /workspace admin 管理权限及既有依赖、运行引用约束检查；Use 不授予 Delete，配置或删除也不能成为无 Use 用户间接 Stop 的入口。复用现有 guard，不新增 cleanup/kill 系统。
- 个人 Device 只归本人；别人的机器须由机器所有者经现有 workspace Device 注册表共享。\*\* 不得用 Agent 创建者身份替换实际调用者来取得设备。\*\* 直接文件 RPC 没有 AgentId，按 Device 可见 / 目录 /workspace 写权限授权；不能谎称它已经查过 AgentUse。Agent 驱动执行另查 Use。
- 评论治理删除复用现有删除 / 审计，不增加隐藏 / 审核系统；谁都不能改写他人评论原文。Document/KB/ 附件内容每次仍走原资源 ACL，不可读时显示不可访问，不复制内容、路径或秘密到共享 DTO。

## 复用现有执行边界

服务端是唯一 authority：workspaceAuth/RBAC 做上限，ProjectModel/projectMembership 做普通写与治理，ResourcePermissionService 做 AgentUse/Manage，Device guard 做机器范围。UI 只消费服务端`canEdit/canManage/canDelete/canUseResource`，不重写角色规则；加载 / 失败默认禁用。无 Use 仍可读 Issue 对话和发表普通 Issue 评论，执行控件可见但灰色。

权限变化复用 SWR keys、现有 membership events/authzVersion：当前窗口刷新名单、能力和 selector，其它窗口按已有事件 / 重新聚焦刷新；旧 UI 不影响下一次服务端拒绝。撤销 / 暂停后，新 Send/Run/Answer/Pause/Stop、queue dispatch、resume/heartbeat 都重新查**记录的真实 initiator 与锁内实际 Agent**，不能用旧请求 AgentId、creator fallback 或 Manage 代替 Use。

已开始运行的合法 producer 可用原 operation token/run grant/epoch 完成终态输出；这不是新用户 Use 动作。复用现有内部终态与 epoch 验证，拒绝旧 epoch / 重复回调；不因授权撤销丢掉 completion，不新增 forced-kill 或 recovery 系统，不承诺瞬时停止外部 OS 进程。Device selector 按「已授权且已安装匹配 runtime」的设备数量计数，已知 offline 匹配设备仍计入且显示禁用；恰好一个匹配设备时自动选并隐藏 picker，多个匹配设备才显示选择。在线 /readiness 另行阻止 Run，不能从数量中剔除 offline 设备而错误隐藏 picker。

## 一次性数据决定，不能静默回填

目标是统一 workspace Project/Agent 安全 profile 读取和两个 Project 界面身份，不保留一套永久复杂的混合策略。上线前先产出**ID、owner、visibility、成员角色 / Use 行**的迁移预览，不导出私有正文 / 配置。

1. 历史 private Project/Agent flags 逐记录确认：批准进入新 workspace 模型，或暂不迁移并保持原有访问边界。未获确认阻止相关记录 / 范围的切换，不能 bulk publish 描述、配置、旧私有历史。private Project 所属 Issue 依然服从已批准的公开规则，不能重新私有化 Issue 来掩盖冲突。
2. 原 manager 保留、contributor 映射 participant；commenter/viewer 映射 participant 需要明确确认。创建者仅在当前活跃可写时初始化 manager；失活 / 空 owner 记录列入清单，不恢复离职权限、不把 Lead 自动升 manager。
3. Agent 仅将已有有效 per-user use/edit 及活跃作者的既有隐含 Use 转为明确名单；不把 Admin、global edit、Project 名单或 assignee 灌入 Use。名单迁移确认后，visibility 变更不误清有效 Use；删除 /transfer/ 成员移除继续按现有清理规则。不得先 grant 再调用当前会清空 grant 的 private API。
4. 工作区 Issue legacy visibility 不再提供误导性的 private 入口；旧 private Document/KB、附件和描述历史快照不因此自动公开。后续公开这些数据另做明确审批。当前快照 ACL 见`packages/database/src/models/taskDescriptionHistory.ts:15`。

复用`workspace_members/project_members/resource_permissions/execution_grants`，不新建表、Device resource type 或角色 engine。`execution_grants`已有实际 schema 和 CREATE TABLE 迁移：`packages/database/src/schemas/executionGrant.ts:30`、`packages/database/migrations/0172_teammates_collaboration_data_layer.sql:35`；这里只证明现有源码结构，不声称线上已迁移。界面两身份不要求先删四种数据库 role 值。具体幂等回填 SQL、范围和计数待批准清单后再冻结。

## 四个小实施阶段

| 阶段                        | 改动与已有模块                                                                                                                                                                                                                                                                                                                                          | 完成条件                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 冻结政策与迁移预览       | 本表；`packages/business-server/src/membershipLifecycle/roles.ts`、`packages/database/src/schemas/projectMember.ts`、`resourcePermission.ts`现有字段仅用于拟定 mapping                                                                                                                                                                                  | 目标表与作者可取消 Use 已批准；private flags / 旧角色 mapping 按具体 ID 预览审批，不执行未批准回填。                                                          |
| 2. Project/Issue 统一       | `packages/database/src/models/project.ts`、`utils/projectReadable.ts`、`models/task.ts`；`packages/business-server/src/projectMembership/index.ts`；`apps/server/src/routers/lambda/project.ts/task.ts`；Project create / 成员 / 属性 /milestone/ 更新 UI 和`src/features/Teammates/api/{contract,hooks}.ts`                                            | 普通写统一 active writable member，管理统一 manager/admin；creator 初始化、Lead 不赋权；作者评论边界与 UI/API public 默认一致。批准历史记录后才切换对应范围。 |
| 3. Agent 名单与 Device 补漏 | `apps/server/src/services/resourcePermission/index.ts`、`routers/lambda/resourcePermission.ts/agent.ts/device.ts`、`_helpers/workspaceAgentGuard.ts`；现有`taskDispatch{,Start,Resume}`/`taskRunner`与`packages/database/src/models/taskDispatch.ts`锁内检查；`src/features/ResourcePermission`、Conversation/ChatInput access hooks 与 Device selector | 名单是唯一 Use 来源、Manage 不绕过；actual caller 设备检查；Viewer direct 文件写拒绝；queue/revoke 与合法 producer 终态闭环。零新增 Device 名单 / ACL 系统。  |
| 4. 批准回填与真实验收       | 具体迁移脚本 / SQL 及 owning Vitest 回归；`bun run check --lint`限改动文件、审阅 autofix；远程 CI Typecheck；候选 revision Electron 运行                                                                                                                                                                                                                | 回填幂等且未批准 private 数据不公开；行为证据附 PR/Actions artifact 并记录 commit SHA。本地不运行 tsgo，Web 不能代替本地 Agent/Device 的 Electron 验收。      |

必须验证的最小结果：四角色与跨 workspace / 失活拒绝；非 Project 参与者 Member 能日常编辑但不能治理，manager 能治理且 Lead 不自动管理；评论 author-edit / 治理 - delete；AdminManage 无 Use 和 author 取消 Use 均不能 Run/Send/Answer/Stop 但可读对话；queue 期间 revoke、实际 Agent 变化和 resume 当前 Use 复查；合法原 producer 终态与旧 epoch 拒绝；个人 / 共享 Device、安装 / 在线候选、Viewer 文件写和目录外访问；未批准 private Project/Agent/Doc/KB/history 保持原边界。每个非平凡权限变更保留一个能复现原错误的回归路径。

## 当前源码为何需要这些改动

- Project 当前`manageable()`仅创建者；create 不自动加 manager；Lead 另获 update moderation：`packages/database/src/models/project.ts:244/:441/:1545`。成员管理已有 manager/admin 规则：`packages/business-server/src/membershipLifecycle/roles.ts:88`。
- Project 读取仍 private creator/active 成员，Issue WIP 已按 active workspace 公开：`packages/database/src/utils/projectReadable.ts:12`、`sharedTaskReadable.ts:13`。UI create 默认 private，schema/API 省略默认 public：`src/features/Projects/createProjectForm.ts:127`、`packages/database/src/schemas/project.ts:101`。
- Issue 评论模型 edit/delete 目前只有共享 scope，没有 author 条件；Issue delete 仅 creator/workspace owner：`packages/database/src/models/task.ts:4134/:4160`、`apps/server/src/routers/lambda/task.ts:1183`。
- Agent WIP Use 仍有 creator 永久允许，private API 会清空 grants：`apps/server/src/services/resourcePermission/index.ts:289/:299`、`routers/lambda/agent.ts:384`。
- Device 已有归属 /private/shared 与 approved-directory 边界，直接文件 mutation 须补统一 workspace 写门槛：`packages/database/src/models/device.ts:293`、`apps/server/src/routers/lambda/device.ts:74/:104/:1489`。不由这些源码结论推定当前旧进程已应用 WIP。

实施政策已批准。仍待审批的是旧 private 记录公开及 commenter/viewer 一次性 mapping 的具体 ID 清单；预览限定本地 clone，生产数据不得自动公开。

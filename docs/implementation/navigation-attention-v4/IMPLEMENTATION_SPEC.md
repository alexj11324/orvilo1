# Orvilo v4：导航、个人工作与注意事项中心 ——Codex 并行实施规格

日期：2026-09-18。研究基线：`alexj11324/orvilo1` 的 `canary@d2c522fd8bf37448dccd86eacc6442a580d55cbd`。

**性质：实施与验收合同，不是已完成的产品实现。** 本次读取相关源码、v3 执行包、官方产品文档与 Plane 开源通知模型；没有修改业务仓库、运行产品测试、验证线上界面或发布。本包内校验仅检查文档 / 任务图 / 角色分工 / 打包完整性。

本规格补充 v3 的 WM-10 和横向注意事项能力；已实现的 Team、同步、仓库和运行底座不重做。Codex 开工须重新读取实际 HEAD 和开放 PR，不得为了符合本快照倒退代码。后续用户明确指令优先。

## 0. 执行限制与不可更改的边界

1. 不使用或修改受保护目录 `/Users/alexjiang/Desktop/vibe/orvilo1`；使用新的独立实施 clone，再在其上创建隔离 worktree。无权自行改变该限制。
2. 全局最多 **3 个并发写入 Agent**，包括仍在运行的 v3/ACP 工作；不是每个方案各开三个。只读审查不占写槽，但不能暗中修改。
3. **不在本机运行编译、测试、开发服务器或连接真实业务数据库。验证走 GitHub CI 和获准的隔离 Preview。** 本规格覆盖旧 v3 / 仓库默认建议中的本机测试命令；禁止通过伪造 `CI=true` 绕过。允许静态阅读、编辑、Git 操作和交接文档。
4. 分支源和 PR 目标遵循仓库实际策略，研究基线为 canary；提交前重新核对。合并到 canary 可能部署，不能将 “写实施代码” 自动解释为 “批准上线”。不自行合并受保护分支、修改保护规则或生产配置。
5. 保留现有 **Tasks、Projects、Automation** 一级入口及有效 URL；不以本轮为由改名 / 替换 Automation、删除全部任务入口或清空个人导航偏好。
6. 所有模型执行沿用已批准的 ACP/AgentExecution/Agent Gateway/Device Gateway 链路。通知投影与视图查询不要求 LLM；AI 不可用不阻塞基础功能。不得恢复 Provider/BYOK/ 旧 Lobe 模型循环以支持本轮功能。
7. 不恢复社区 / 市场展示、独立文稿 / 生图 / 评测 / Acceptance/Skills/ 浏览器工作台等已退役产品入口。不按名称批量删除仍被任务执行使用的工具、编辑器、技能运行或证据能力。
8. 对话用于协作；通知用于提示；任务是工作事实；审批授权和任务完成均有独立门禁。标记已读、归档、接受分诊、评论、PR 审核、合并、验收通过不得互相代替。
9. 不复制 Plane、GitLab 等受相应许可证约束的源码进入本仓库；借鉴模式并独立实现。官方商业文档不等于同版本社区版源码能力。
10. 每个功能 PR 随附真实用户 / 工程文档与精确 head 的验证证据；不得通过空文档、删测试、放宽权限或 mock 成功绕过文档 / CI 门禁。

## 1. 研究结论与当前基线

### 1.1 研究采用什么，不采用什么

| 来源                              | 已核实模式                                                                                      | 本次采用                                                     | 不照搬 / 不承诺                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Linear Inbox / My issues \[S1,S2] | 通知与个人任务视图分开；通知可读 / 稍后；个人任务按责任 / 创建 / 订阅查看                       | Inbox 与 My Work 分工，键盘流转、详情预览                    | 不把所有通知当 “必须审批”；不复制通知数量 / 保留期限                 |
| Linear Views \[S3]                | 保存筛选与显示配置；视图可分享 / 收藏                                                           | 一个任务、多种查询视图；定义权限和数据权限分别检查           | 分享链接不授权任务；不一次性复制 Initiative 视图等全部类型           |
| Linear Reviews / Pulse \[S4,S5]   | Reviews 汇总 PR 与检查 / 评论；Pulse 汇总项目更新                                               | 审核队列本轮完成，复用任务开发详情；项目更新可进入普通动态   | 首轮不新建完整代码托管 / 审查编辑器，不另建 Pulse 首页               |
| GitHub Notifications \[S6]        | Read、Done、Save、Unsubscribe 分开                                                              | 已读与个人收纳分开；通知打开原对象                           | 通知 Done 不是 Issue Done；不默默改变 GitHub 的个人已读状态          |
| GitLab To-Do \[S7]                | 审查请求、提及、失败流水线等进入个人待办                                                        | 根据需要采取的动作路由，不仅按事件类型广播                   | 其某些评论 / 表情等自动完成规则不用于 Orvilo 的授权审批              |
| Plane \[S8,S9,R12]                | Inbox 右侧预览；开源模型有 receiver/workspace/read/snooze/archive；Views 是保存配置而非复制数据 | 接收人 / 作用域 / 呈现状态；预览不离开列表；持久视图         | 不移植 Plane 的 Project/Module 层级，不把商业页全部能力称为 OSS 已有 |
| OpenProject \[S10,S11]            | 同一查询支持表格、分屏和看板；内置视图与私人 / 收藏视图区分                                     | 内置 “全部任务 / 阻塞 / 待审核” 与保存视图区分，共用查询内核 | 不照搬其全部项目权限、甘特、报表或外部用户共享体系                   |

**结论：本轮不是增加几个菜单，而是接通 “事件 → 接收人 → 注意事项 → 真实动作 → 结果回执”，并给同一批任务建立一致的个人 / 团队 / 保存视图。**

### 1.2 当前实际存在的基础

| 已读取文件                                                 | 事实                                                                              | 改造决定                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/app-config/src/routes/index.ts` \[R1]            | Tasks、Projects、Automations、Settings 是 primary；未注册独立 Inbox/My Work/Views | 添加入口，保留既有任务 / 自动化路径与 retired 语义                |
| `schemas/notification.ts` \[R2]                            | 已有通知、接收人、workspace/personal 隔离、read/archive、dedupe 和发送渠道记录    | 演进现有表，不建第二套平行 notifications                          |
| `models/notification.ts` \[R3]                             | 已有分页与导航统计，读取作用域可省略；mark-all 未携带读取快照                     | 用户入口强制显式作用域；增加资源 ACL 与版本安全的批量操作         |
| `routers/lambda/notification.ts` \[R4]                     | 资源转移请求已经参与待处理卡片 / 计数；个人通知写被绑定到 `message:create`        | 统一 live-action 适配，不丢转移请求；自有已读权限独立于发消息权限 |
| `HomeSidebar/Header/components/InboxModal/index.tsx` \[R5] | 已有通知弹窗、类别 / 已读过滤和转移请求                                           | 抽可复用呈现能力、升级一级路由；旧铃铛打开同一数据而非第三个中心  |
| `HomeInbox/index.tsx` \[R6]                                | 首页还混合 brief 待处理、topic 未读、运行、Goal / 动态                            | 区分保留能力与退役形态；只适配有效工作信号，不复活旧中心          |
| `schemas/team.ts`、`routers/lambda/team.ts` \[R7,R8]       | 已有 Team、状态、项目多对多、周期骨架及成员接口                                   | 补导航与真实列表 / 分诊，不重建 Team；完整周期规划仍后置          |
| `AgentTasksPage.tsx` \[R9]                                 | My tasks 已有 assigned/created；query 使用 `collection=mine&scope=...`            | 抽查询并提升入口，旧查询精确兼容                                  |
| `schemas/eventOutbox.ts` \[R10]                            | 一个全局 status delivered 字段                                                    | 增加消费者独立回执或明确扇出；不能两个消费者抢同一 delivered 状态 |
| `schemas/actionApproval.ts` \[R11]                         | 审批已绑定参数摘要、版本 / SHA、单次消费                                          | Inbox 调用现有授权命令，不自行 “更新通知 = 批准”                  |

上述是源码结构核对，不代表完整调用链、安全或线上可达性审计通过。N00 继续追踪已有通知生产者、事件消费者、权限、隐藏导航及正在合入的 ACP 改动。

## 2. 冻结产品范围和导航

### 2.1 本轮一级导航

```text
工作区切换器                          搜索 / 命令 / 新建任务

Inbox        收件箱                   新增正式路由
My Work      我的工作                 提升已有个人任务能力
Tasks        任务                     保留现有一级入口
Projects     项目                     保留
Views        视图                     新增
Automation   自动化                   保留现有命名、route id 与行为

Favorites    收藏                     有内容才出现
Teams        团队                     按权限、按上下文展示
  Engineering
  Design

设置                                  保持既有入口
```

本轮不为了少一个按钮把 Tasks 偷偷下沉。后续要改变 “全部任务” 的一级位置，应另行评估；不能扩大本次导航迁移。固定工作入口不意味着侧栏一次展示全部团队和收藏：默认最近 / 加入的可见团队，更多使用搜索和分页；禁止取前若干条后丢失其他团队。

个人模式保留个人通知和自有工作，不创建假 Team/Workspace。工作区 Inbox 只显示 “当前用户在当前工作区” 的事件。首版不做跨 Workspace 混合 Inbox。

### 2.2 缺口裁决

| 项目                                   | 本次处理                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| Inbox                                  | 一级页面，待你处理 / 动态；读、未读、稍后、归档、来源预览、真实操作                  |
| My Work                                | 一级页面：我负责、我委派、待审核；创建 / 订阅收在次级筛选                            |
| Teams                                  | 导航分组；团队 Tasks/Projects/Triage；权限与项目跨团队语义保真                       |
| Views                                  | 任务与项目两种持久视图；新增、另存为、编辑、分享范围、收藏、恢复筛选                 |
| Favorites                              | 跨设备持久的目标引用；优先复用已有收藏机制，通过 N00 确认                            |
| Reviews                                | 功能不缺席：My Work→待审核 + Inbox 请求 + 任务开发详情；无独立一级审核中心           |
| Pulse                                  | 本轮后置；既有项目活动可作为动态来源，不建独立更新流 / 播客                          |
| Cycles                                 | 使用已有记录 / 筛选；不提供无后端的排期页，不新增完整周期规划                        |
| Initiatives、Customers、Asks、Insights | 不在本轮；逐项记入差异表，不假装已对齐 Linear 全功能                                 |
| 全局搜索 / 快速创建                    | 补入既有 CommandMenu 的 Team/Project/Issue/View/Inbox 导航与查询；不做第二套搜索中心 |
| 审批、Agent 停止、PR/CI                | 真正能力必须经原服务工作；不是往通知卡片加伪按钮                                     |

### 2.3 路由合同与命名兼容

N01 冻结的新增相对路径建议为 `/inbox`、`/my-work`、`/views/:viewId`；它们经过现有 workspace-aware helper 生成真实路径，不手拼 workspace 前缀。Team 路径复用已有注册；若 N00 发现上述路径已被其他有效 surface 占用，先升级合同并核对消费者，不直接覆盖。route id 使用明确的 `workInbox`/`myWork`/`savedViews`，避免与既有默认聊天 Agent `inbox`、provider webhook inbox 混淆。

| 入口 / 旧引用                                  | 处理                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| 原铃铛 / InboxModal 触发                       | 默认导航统一 Inbox；必须模态的壳复用同一内容与查询，不另起计数       |
| 旧 HomeInbox 摘要                              | 打开对应工作 / 通知；topic 未读仍留在原聊天语义，不批量改 topic 读态 |
| `/tasks?collection=mine&scope=assigned`        | 精确到 My Work 我负责，保留有效上下文                                |
| `/tasks?collection=mine&scope=created`         | 精确到 My Work 我创建筛选                                            |
| `/tasks/:id`、scheduled、项目 / Agent 内 Tasks | 原语义与 URL 继续有效，不广泛重定向                                  |
| 收藏 / 系统通知点击 /command 结果              | typed 目标重新生成当前 scope 下链接，返回路径安全校验                |

### 2.4 四个中心的语义不可串台

| 页面        | 回答的问题                     | 主键事实                                             |
| ----------- | ------------------------------ | ---------------------------------------------------- |
| Inbox       | 最近什么需要我知道 / 处理？    | 接收人的呈现记录 + 当前有效动作来源                  |
| My Work     | 我负责或应审核哪些工作？       | 任务责任 / 明确委派 / 审核请求，不依赖通知有没有送达 |
| Team Triage | 团队尚未接纳和分派哪些新工作？ | 现有 Task 及 intake/triage 状态                      |
| Views       | 按保存的规则查看哪批工作？     | 查询定义，运行时按当前用户权限求值                   |

Inbox 归档不改变 My Work；My Work 接手工作不自动消除必要审核；Triage 接受不等于批准运行。Team 导航中的 Project 是同一个跨团队对象的过滤入口，不复制。

## 3. Inbox：从已有弹窗演进到可操作的一级收件箱

### 3.1 页面和阅读动作

宽屏为列表 / 详情分栏；窄屏为列表→详情并可返回同一位置。采用当前 UI token、组件库和 TaskDetail/PR 摘要能力，不引入新的 UI 框架。主切换只有 “待你处理” 和 “动态”；全部 / 未读 / 提及 / 已稍后 / 已归档在筛选或菜单，不摆出十个常驻 Tab。

单击打开详情并在**该版本的内容真正展示后**确认已读；hover、预取、列表出现和全局快捷搜索不算已读。支持 J/K 或方向键移动、Enter 打开、Esc 返回；输入框 / 编辑器 / 弹窗焦点内不截获单键快捷键；菜单所有操作可键盘与触摸到达，不做 hover-only 功能。

通知行显示：来源对象、事件摘要、相关人 / 执行 Agent、时间、是否需要动作、当前请求状态。红色只用于需要处理的严重异常，不按每个工具调用闪烁。第一屏不展示 eventId、outbox、lease、scopeVersion 等实现术语。

保留旧系统 / 账单 / 资源转移等必要通知，但不复制已退役独立功能的生产者。类型未知但合法的旧通知使用受限通用 renderer；链接不能解析时显示说明而非跳到任务首页假装成功。

### 3.2 事件路由合同

| 事件                      | 接收人                                          | 页面表现                         | 可消除待处理的事实                                |
| ------------------------- | ----------------------------------------------- | -------------------------------- | ------------------------------------------------- |
| 任务分配 / 取消分配       | 当前或原负责人，必要时委派人                    | 普通责任变更动态                 | 阅读仅影响通知                                    |
| 明确 @mention             | 已验证提及身份、且能读对象的人                  | 提及动态                         | 阅读；用户可手动恢复未读                          |
| 评论 / 重要需求变化       | 有效订阅人、相关负责人                          | 按任务 / 线程聚合                | 不改变执行或审批                                  |
| ACP 请求许可 / 高风险操作 | 已授权且有决定权的具体人或审批角色              | 待你处理，动作与参数摘要         | 原审批服务已决定并确认；参数变化时过期            |
| Agent 需要补充输入        | 被明确请求的人                                  | 待你处理，提交答复               | 原有 input 队列接收并回执；不是写一条无关联评论   |
| Run 阻塞 / CI 失败        | 执行责任人 / 委派人；自动修复已在进行时降低提示 | 阻塞或恢复中                     | 对应当前代次的阻塞解除或升级完成                  |
| PR 审核请求               | 明确 reviewer 或策略分配人                      | My Work 待审核 + Inbox 卡片      | 当前 head 对应审核状态 / 请求撤销；评论不等于审批 |
| 合并冲突 / 审查意见       | 当前交付责任人                                  | 同一 PR 的任务更新，不重复造任务 | 修复与重新检查的真实回执                          |
| 同步冲突 / 授权失效       | 工作区有集成管理权限的人                        | 一个安装 / 对象的故障 episode    | 冲突解决或连接恢复并重新核对                      |
| 资源转移 / 邀请待处理     | 现有模型指定的接收人 / 发起人                   | 适配现有卡片，不丢可撤回动作     | 原转移 / 邀请状态终止                             |
| 历史批量导入完成          | 发起者 / 管理员，合并一条摘要                   | 普通动态，不催办所有历史 Issue   | 无额外动作；不触发逐条模型规划                    |

普通 “同步成功 / 工具运行中” 不逐条推送。原作者自身编辑默认不重复发给自己；真正待其授权的请求不可因 “由自己的 Agent 发起” 而被过滤。去重依赖稳定 canonical event / 对象 / 代次，不以 bot 作者或接收时间粗略去重。

GitHub 与 Linear 对同一 PR/Issue 的回声通过已有映射收敛成一个逻辑事件。只收到独立事实且无法证明相同时，不误删；可聚合显示但保留证据。

### 3.3 数据演进：复用 notifications，不新造任务事实

`notifications` 保留现有 ID、userId、workspaceId、类别、内容、历史读 / 归档状态。建议增加或使用伴随一对一表承载：

- `resourceType/resourceId`：规范对象引用；`sourceEventId`、`threadKey`、`episodeKey`。
- `kind = update | action`；动作类型和**现有请求 ID**，不把完整工具参数明文复制入卡片。
- `activityVersion`、`readVersion`、`latestFeedRevision`、`lastActivityAt`；旧 `isRead` 由这些事实作兼容投影。
- `snoozedUntil`、`archivedAt`、`resolvedAt`（来自权威动作，不靠用户读操作）。
- `projectionVersion` 和可追溯的来源 revision；renderer 动态从源对象取可读信息。

新增小型支持结构，N00 若找到等价实现就复用：

| 表 / 抽象                     | 作用与约束                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `notification_event_receipts` | `(consumer,eventId,recipient,kind)` 唯一；重复投递不增加聚合版本                 |
| `notification_feed_state`     | `(user,scope)` 唯一；在事务锁下分配提交一致的 feed revision                      |
| `event_consumer_receipts`     | 多消费者各自领取 / 确认；原 event\_outbox 不再被第一个消费者标记后导致另一个丢失 |
| `task_subscriptions`          | task/user 的来源原因和显式退订状态；通知偏好不取消必要审批责任                   |
| 收藏 / 视图结构               | 见后文，禁止和系统配置 / 浏览历史混成 JSON 大字段                                |

现有去重索引是 `(userId,dedupeKey)`，不能只加新索引就让旧 writer 失去幂等。新 key 包含服务端生成的 scope 与 canonical 来源命名空间；迁移记录旧 key→新 episode/receipt 的对应，保留旧索引到所有 producer 兼容。无 dedupeKey 的历史行按现有 ID 保留，不用标题 / 时间猜两行重复而删除。

NULL workspace 不能依赖普通唯一索引保证个人模式唯一。沿用两个 partial unique index 或显式 typed scopeKey；scopeKey 由服务端生成，拒绝任意字符串越租户。

普通更新按 canonical task/thread + family 聚合，不因改一次字段建一张新待办。一次有效新事件递增 activityVersion，新事件使已归档普通线程重新出现。不同审批 requestId / 执行代次是不同 episode，绝不能聚成一个 “全部批准”。

### 3.4 并发与批量已读

`markRead(id, observedVersion)` 只确认本次展示的版本。新事件到达后仍保持未读。`markUnread/archive/snooze` 使用呈现版本 CAS，避免新内容被旧操作覆盖。

批量流程：`prepareBulkAction(queryFingerprint)` 返回绑定 user/scope/filter/version/ 有效期的快照 token；执行时只处理快照覆盖的呈现版本。不能用 “请求到达时所有未读” 清空用户从未看过的新事件。

**不能拿 PostgreSQL nextval 的最大值直接当提交水位。** 并发事务可能先取较小 ID 后提交；消费者若越过它会漏事件。本轮采用每个用户 / 作用域的事务性 feed 锁 + 独立事件回执。多接收人事务分开提交，或严格按固定顺序锁，避免互锁。

归档是个人收纳，不删源对象。必要动作未解决不能通过 archiveAll 消失；`read=true` 的待审批仍属待处理。Snooze 只影响呈现，不延长批准有效期、阻塞超时或任务截止时间。临近到期 / 安全紧急升级能按明确规则打断稍后；用户可以看到该规则。

API 同时返回 `unreadUpdateCount`、`pendingActionCount`、`snoozedPendingCount`；主 badge 是**未稍后、仍有权读取的唯一活跃卡片并集**，不是几个计数机械相加。筛选计数与可见结果同一权限和状态逻辑。

### 3.5 不让投影失败掩盖待审批

动作事实保留在 `action_approvals`、ACP intervention/input、resource\_transfer\_request、PR review 等原服务。Inbox 的 `ActionSourceRegistry` 只负责权限检查、hydrate、decision adapter、reconcile。

各 source 提供有界 `listPendingForActor`，即使一条通知投影缺失 / 被旧客户端归档，也能用原请求重新呈现并修复投影；不能只信通知布尔位。兼容现有 resource transfer 的 request-based 计数，逐步替代手工 “加减 delta” 但不能丢回归测试。

源服务临时不可达时，返回 `partial/sourceUnavailable/lastReconciledAt`，不能显示 “0 项待办 / 已全部处理”。未能重新证明资源权限的历史敏感内容不返回。对于可本地查询的 Task/Project ACL，权限过滤要尽可能进入 SQL，再分页计数；不能先取一页再在浏览器丢掉不可读行。外部受限 source 使用批量授权 / 受控快照与明确 freshness 状态，禁止每行调用外部 API。

只有发起者可以撤回的 outgoing 卡片应标 “等待对方 / 可撤回”，不算 “必须由我批准”。若现在所有 pending 卡片都算未读，迁移须解释和测试计数变化。

### 3.6 权限、通知渠道与身份

每次列表 / 计数 / 搜索 / 详情 / 动作都检查当前 workspace 成员、资源权限和自身接收人；投影时的权限快照不能替代现在的权限。没有资源权限时连标题、数量、附件 URL、AI 摘要和隐藏团队名称都不返回。

查看自己的消息允许 `notification:self:read`；标记自己的消息使用 `notification:self:organize`。不要继续拿 `message:create` 或 `agent:update` 作为个人已读的前置条件。viewer 可整理可见通知，但不能编辑任务、接受分诊、批准操作；审批走独立权限。

Linear 工作区 OAuth 和 GitHub App 安装不等于某人的私人 Inbox 授权。本轮只从规范业务事件生成 **Orvilo 本地的个人通知**，不复制或回写外部个人已读 / 归档。外部 reviewer/mention 无法确定本地用户时保存外部身份，不用同名自动授予审批。

现有 email/push/im 渠道不重做也不自动启用；渠道失败不能阻塞站内呈现，不要从 Inbox SSE payload 发送明文工具参数或凭据。链接使用服务器生成的 typed navigation target；兼容旧 actionUrl 需 allowlist、合法协议及对象 / 作用域校验，禁止任意 URL / 脚本执行。

## 4. 审批、输入、审查：统一入口但不统一成一个万能 “允许” 按钮

`ActionSourceRegistry` 建议最小接口：

```ts
interface ActionSource {
  listPendingForActor(ctx: AuthenticatedScope, cursor?: string): Promise<PendingPage>;
  getAuthorized(ctx: AuthenticatedScope, ref: ActionRef): Promise<ActionPresentation>;
  decide(ctx: AuthenticatedScope, command: VersionedDecision): Promise<DecisionReceipt>;
}
```

这些是新增内部合同名，不声称已有 API。AuthContext 由服务端解析，客户端不能提交 actorUserId 冒充别人。

每次危险决定必须校验：请求 ID、当前状态、有效期、参数摘要、sourceRevision、执行代次、政策 / 权限版本以及适用的 PR head/base SHA。提交的是 decision + idempotencyKey，不是直接 patch notification。

`requested → deciding → source accepted / rejected / stale / expired / outcome_unknown → source confirmed` 是 UI 表现状态，不替换现有审批的 pending/approved/consumed 状态机。批准入库、发送给 harness、动作真正执行是不同回执。失败不能显示 “已执行”；结果未知不能重新生成操作 ID 或重复放行。

不提供 “批量批准全部”“点击已读默认同意”。模型不能决定要求人类授权的动作。Inbox 页面、任务页、CLI 同时点击同一请求，也只消费一次；若 source 服务缺少 CAS、会话 request 绑定或幂等，则先修 source，再开放按钮。

PR review 与危险工具授权分开：个人 GitHub 身份不足时，显示 PR 状态并提供受权限控制的 GitHub 跳转；不让 app/service token 冒充人类批准。不通过点卡片或一般评论满足代码评审。支持已有内部 diff / 评论能力就复用；若没有，本轮交付完整 “审核队列→准确 PR→原服务 / 外部完成→回执更新” 闭环，不搭半成品 Monaco 审核器。

PR 新 head 使旧审查证据失效时，pending episode 以新 generation 显示。已确认 merged/closed 时解析相关审核请求，但不伪造未完成的任务验收。原任务完成门禁继续执行。

## 5. My Work：责任查询，不是又一张通知列表

主 Tab：**我负责 / 我委派 / 待审核**；次级筛选包含我创建、我订阅，避免六七个常驻标签挤满页面。前两个默认可切列表 / 看板；审核包含 task review 和 PR review 时使用明确类型的审核列表，不强塞进同一状态列。

- 我负责：当前用户是人类 assignee；个人模式采用现有个人所有权语义。
- 我委派：有明确的 `delegatedBy/requestedBy` 业务证据，且仍可读；不能用 “agent 的创建者是我” 替代委派人。缺少历史证据显示未知，不虚构。
- 待审核：仍有效的明确审核请求 / 审核责任；可以包含有权限但未关联 Task 的 PR，不为显示 PR 自动生成 Task。
- 我创建：真实创建主体（包括可验证 on-behalf-of）；外部导入的系统创建者不自动算安装者。
- 我订阅：task 订阅，不是订阅了 Agent 或聊天。退订动态不解除 assignee/reviewer 责任。

My Work 独立查询源事实，因此通知关闭 / 归档不让任务消失。排序规则确定性优先：需要用户动作、阻塞 / 紧急、优先级、更新时间，再用稳定 ID 打平；没有可靠 dueDate 就不伪造超期。

保留 `/tasks?collection=mine&scope=assigned|created` 的语义：开启新入口后仅精确重定向这个已知列表形式到 My Work 对应 Tab，保留 query 作用域和安全过滤；`/tasks/:id`、`collection=scheduled`、project/agent-scoped 任务路径不动。

新建任务只在上下文确定 Team/Project 时预填可写字段；无法确定时展示一个必需选择。筛选结果不是创建模板：`assignee=@me OR urgent` 不能自动解释成所有新任务都紧急，也不能让 viewer 因进入自己的视图获得创建权。

## 6. Views：一个查询合同驱动全部任务视图

### 6.1 定义与权限

保存 `name/entityType/queryAst/layout/displayOptions/version/owner/visibility/scope`，不保存一份任务副本。首版 entityType 支持 task/project；PR 审核使用专用来源视图，不混入通用项目表。

内置视图不可原地覆盖：全部任务、阻塞任务、Agent 执行中、待审核、项目全部。用户调整后 “另存为” 只需名字，默认私人；分享通过小型菜单选择 “此团队” 或 “此工作区”。这里 “共享” 只面向已授权成员，不生成匿名公开入口。

读视图需有定义权限；读结果还需逐资源 ACL。定义包含受限 Team 名称 / 条件时，禁止无意把这些元信息分享到工作区；保存分享范围时预检引用的可见性，不满足则收窄或阻止并解释。

收藏是每个用户的偏好，不修改 view owner；删除视图不会删除任务。拥有者离职，shared view 按工作区政策转移管理主体；不能默认级联删除其他人正在用的共享定义。

### 6.2 类型化查询而非任意 SQL

`schemaVersion:1`，entityType 决定允许字段和操作符。示例：

```json
{
  "entityType": "task",
  "filter": {
    "all": [
      { "field": "assigneeUserId", "op": "eq", "value": { "ref": "currentUser" } },
      { "field": "projectId", "op": "isNull" }
    ]
  },
  "groupBy": "workflowCategory",
  "layout": "board",
  "schemaVersion": 1,
  "sort": [
    { "field": "priority", "direction": "asc" },
    { "field": "id", "direction": "asc" }
  ]
}
```

上例仅示意结构，priority 的 “无优先级” 排序须按现有 enum 映射，不直接拿数值顺序当产品顺序。

服务端校验字段白名单、运算符、值类型、最大复杂度、日期边界、实体引用和权限。`currentUser` 在**访问者**上下文求值；共享后不能仍绑定创建者。禁止模型或客户端提供 SQL、任意列名 / JS、用户身份。可选 AI 仅生成受限 AST 建议，解析失败保持原视图，不自动保存 / 共享 / 执行。

支持 projectId=null /isNotNull、多个 Team、多对多项目；null 与空数组、字段不存在必须严格区分。删除字段 / 过期状态导致非法定义时显示 “视图需修复”，不能静默删过滤器扩大查询范围。

`WorkQueryService` 统一产生 list/board/count/facet/export（若已有导出）结果；在数据库过滤和分页，不能下载全部数据后浏览器过滤。SWR/cacheKey 必须包括 user、scope、authzVersion、queryHash、entityType、paging/grouping；作用域切换立即清空旧敏感结果。

稳定游标绑定 queryHash 和排序 tuple（最后包含 ID）；非法 / 跨过滤器游标返回 CURSOR\_INVALID，不重置为第一页造成循环或泄漏。计数 /facet 不绕过权限，也不能把所有私密 Team 名放到选项里。

首版按 Team 精确 workflowState，跨 Team 聚合可以按 workflowCategory。拖到某类别时，若目标 Team 有多个精确状态且没有已批准默认映射，弹一个状态选择；不凭名字自动写入。拖动仍走 TaskCommand / 完成门禁，不能直接 UPDATE status；聚合列排序与业务状态不是同一字段。

显示运行时長 / CI 等动态字段只能读取当前代次的已有事实或受控物化投影；没有数据时标未知，禁止每个可见行单独向 GitHub 发请求。

### 6.3 收藏与导航状态

通过 N00 判断现有 favorite/pin 存储是否能支持 typed target + scope + 权限；可以扩展则复用，不能把 Electron 的 “固定浏览器标签” 当跨设备收藏。

需要新表时使用 `navigation_favorites(userId,scopeKey,targetType,targetId,rank,version)`，唯一到用户 / 作用域 / 目标。失去权限时不显示标题；删除目标后标失效并可清理，不跳到随机页面。排序更新有版本门禁，同一用户两设备不会静默互相覆盖全部列表。

## 7. Team / Triage 与搜索接线

Team 首屏使用既有 Team API / 权限服务和共用 Task 列表；一个团队仍可快速到达，不新增强制 “设置团队” 向导。成员管理放对应设置，Agent 与仓库是相关资源，不另加平行一级中心。Project 跨团队保持唯一 ID。

Triage 是可选团队工作流：本轮提供新任务列表、接受、转团队、设负责人 / 项目、拒绝、关联重复项；每个动作带 expectedRevision，经源无关命令写事件，触发既有重规划流程。拒绝 / 重复需要保留来源关系和任务历史，不硬删除。

accept 的语义是接纳进入工作流，不是放行 Agent；传入 completed 也不能绕过交付门禁。迁移所有已存在 backlog 的任务到 triage 禁止；从 Linear 导入已归属 / 已执行任务的状态必须原样保留。导入完整性门禁继续生效。

既有 Team schema 有 cycle 骨架，不等于完整 cycles UI 已完成：首版只有可工作的周期筛选 / 摘要，不上线点开即空白的 “完整周期管理”。

CommandMenu 保留设置 / 命令 / 最近访问，补权限内 Issue、Project、Team、Saved View 的搜索和新导航。搜索与结果点击重新校验；任务卡片 deep-link 到具体当前对象，保持工作区、来源、滚动位置和返回路径。不要给所有退休旧链接统一重定向 /tasks。

## 8. API 与事件合同

在既有 `notificationRouter` 演进，不新建另一个同名通知后端。建议新增如下能力名称（不是当前已有函数保证）：

| API                                      | 关键输入                           | 服务端保证                                             |
| ---------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| notification.feed                        | tab/filter/cursor/limit            | actor+scope 由认证获取；源 ACL；返回版本和 action refs |
| notification.summary                     | 同一筛选上下文                     | 来源待处理与通知同口径；不可见对象不计数               |
| notification.markRead                    | id+observedVersion                 | 不吞新事件                                             |
| notification.markUnread/archive/snooze   | id+expectedVersion                 | CAS；必要动作不靠收纳消失                              |
| notification.prepareBulk / applyBulk     | 受限操作 + 快照 token              | 禁止 bulkApprove；过滤与版本固定                       |
| attention.decide / provideInput          | typed ref+decision + 版本 + 幂等键 | 原 source command、授权与回执；不执行 payload 自带代码 |
| myWork.query                             | mode+WorkQuery+cursor              | 真实责任，不以通知或 agent owner 推定                  |
| savedView\.list/get/create/update/delete | versioned AST + share scope        | 定义权限、数据权限、引用可见性、版本冲突               |
| favorites.list/upsert/reorder/remove     | typed target+version               | 自有偏好、对象可见、stable rank                        |
| team.triage / triageCommand              | Team + 任务 + action+revision      | 重用 Task/Team 权限、事件、规划门禁                    |

错误至少：UNAUTHENTICATED、NOT\_FOUND（含无可读权限）、FORBIDDEN、STALE\_REVISION、EXPIRED\_ACTION、ALREADY\_DECIDED、OUTCOME\_UNKNOWN、INVALID\_QUERY、QUERY\_TOO\_COMPLEX、CURSOR\_INVALID、SOURCE\_UNAVAILABLE。不能把失败统一 toast 成 “成功 / 空列表”。

事件 envelope 复用现有域事件而不是新造一套通知事件总线；字段包含 schemaVersion/eventId/canonicalResource/actor/sourceRevision/ 发生时间 /causation/importBatchId。命令事务写业务事实 + outbox，网络调用在事务之后。

投影消费者必须单独 ACK 与重试。最小改造可由现有 outbox dispatcher 原子地展开已注册消费者任务，分别确认；或者直接使用每 consumer receipts 扫描。\*\* 必须选一种并冻结在 N01，不允许两个独立服务各调用 markDelivered 抢消息。\*\* 默认选择 “现有 dispatcher + consumer receipts”，不引入 Kafka/Novu/SaaS 通知依赖。

后台恢复从持久未处理回执 / 源 pending 查询启动，不能只有 SSE 在线才能收到。SSE/WS 复用现有连接，先发有权限的失效提示，再按 scope 拉取；不新建一条绕鉴权的广播管道。

## 9. 安全与性能验收硬条件

- 获取列表、badge、facet、搜索、导出、分享定义、SSE、缓存、移动端推送及源动作都覆盖资源级权限。成员撤销 / 冻结后的下一次请求即拒绝，旧 UI 失效；异步物理清理不能充当权限控制。
- 过去收到某个私密任务通知，不代表永远可读。渲染时不直接信任存储 title/content；需授权后才读或返回脱敏 tombstone。分享视图的名称 / 过滤引用同样可能泄漏。
- source 权限变化与决定原子协调：先校验再长时间调用外部不是强保证；执行端再次验证 grant/epoch，失效就停。不能批准一个会话、执行另一会话。
- 评论与模型输出是不可信内容：按编辑器安全规则 sanitize，禁止 HTML/URL 导航注入；不要在通知摘要执行 markdown 内指令。
- 页大小默认 50 最大 100；批量自有通知操作有数量 / 速率限制，危险动作逐个；AI 查询树默认深度 3 / 条件 20，超限解释而非长 SQL 卡死。以上为本次配置初值，不是性能实测结果。
- 在 CI 用至少 10 万任务、1 万个人通知、200 个可见 / 不可见团队的合成数据检查分页、计划、索引、查询次数和权限；真实 Preview 以批准测试数据进行。不能仅以 200 条 mock 证明大工作区可用。
- 目标预算建议：受控测试环境列表 / 计数 p95 各不超过 500ms、首屏无需全库加载、每请求无逐行外部 API 调用。固定测试环境并记录结果；未达到先优化或明确记录未达，不能虚报。
- 数据保留沿用产品政策；去重回执 / 墓碑保留覆盖重放窗口，不能删除回执后把重放当新事件。必须未解决的请求和审计不因通知清理被删除。

## 10. 代码所有权与落点

以已有源码为主；新增目录在 N00 确认没有等价实现后才创建。公用文件一人写，跨域需求走接口请求。

| 角色              | 独占主要文件                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S 主协调          | baseline/decision/dispatch/handoff 合同；lambda 根注册；共享 manifest、package/lockfile；批准文件租约                                                         |
| D 数据与权限      | `packages/database/src/schemas/notification.ts`、`eventOutbox.ts`及新增支持 schema；所有 migration/journal/ 类型 barrel；相关 models；必要 Task/Team 底层扩展 |
| N 通知与动作      | `apps/server/src/routers/lambda/notification.ts`；notification/attention/projector 业务；source adapter；`src/services/notification.ts`                       |
| Q 查询与视图      | 新 WorkQuery/MyWork/SavedView/Favorite 业务和 router；新增查询 model 文件经 D 一次移交；`team.ts` router/triage 接线                                          |
| U 个人界面        | `src/features/Inbox/`、`MyWork/`；旧 InboxModal/HomeInbox 的兼容适配；个人页面局部 store                                                                      |
| V 团队 / 视图与壳 | Teams/Views/Favorites 前端；Task 公共查询呈现；导航 registry/SPA 路由 / CommandMenu/SWR keys；本轮三份 i18n 文件                                              |
| T 独立验证        | 测试夹具 / 验收文件 / CI 检查、回归与安全测试；不自行修生产实现                                                                                               |

D 先交付 shared contract 和 schema，Q/N 再写服务；Q 不能并行修改 D 所有的 `TaskModel`，须提变更请求。U 需要修改公共 Kanban 时交 V，不能各复制一份。V 与 S 对 root API/SPA 的职责分别固定，禁止 “顺手加一行” 绕过租约。

冻结前必须检查已有 `src/features/Teams/`、`src/services/team.ts`、收藏存储、AgentIntervention、Task review、GitHub PR renderer 的实际路径。未核实路径在工单中标 PROPOSED/LOCATE，不宣称已存在。

需要覆盖所有消费端：Web/Electron 公共路由、Mobile/PWA、Popup（只处理已有相应入口）、CommandMenu、原生菜单 / 系统通知点击、浏览历史 / 固定标签、workspace 前缀、旧深链接。CLI/MCP 若能改变任务 / 审批也要通过同一命令与事件；不在 CLI 新做一个完整交互式 Inbox。

## 11. 并行工作包和门禁

任务清单以 `work-packages.json` 为机器可读权威，状态初始全部 PLANNED。共 14 个包，见附表；既有 v3 IDs 不复用。

- N00：S 核定当前 HEAD / 开放 PR/ACP 前置 / 产品退役表 / 所有权 / CI 配置。阻塞项只停止受影响写入线，不绕过安全继续。
- N01：D 冻结类型、三状态语义、事件消费者协议、API / 权限 / 路由矩阵、兼容夹具。
- N02：D 扩展数据库与幂等迁移、feed 版本、subscriptions / 保存视图 / 收藏存储、源码权限接缝。
- N03：Q 实现统一查询、My Work、保存视图 / 收藏后端与 Team Triage 命令。
- N04：N 实现领域事件到通知投影、幂等扇出、多消费者回执、旧渠道兼容。
- N05：N 实现审批 /input/PR/ 同步冲突 / 资源转移适配及真实操作回执。
- N06：U 在冻结夹具上实现 Inbox 分栏与交互；未接真实服务只能标 UI\_CONTRACT\_READY。
- N07：U 实现 My Work / 待审核页面与旧个人任务深链接适配；最终接 Q/N 真实服务。
- N08：V 实现 Team/Views/Favorites 页面与共用查询呈现、保存分享 / 拖动权限。
- N09：V 统一壳路由 / 铃铛 / 搜索 / 导航 /i18n / 多端兼容；所有入口接真实后端。
- N10：D 与 N 串行授权迁移回填 / 投影 shadow / 旧通知读态 / 未决来源恢复 / 开关。
- N11：T 在整合 head 执行 CI / 迁移 / 并发 / 故障 / 权限 / 浏览器合成验收，发现问题交原 owner。
- N12：T 获准测试安装进行真实 Linear/GitHub/ACP 闭环；不能用 mock 结果顶替。
- N13：S/T 独立审查、精确版本证据、文档、灰度与回滚交付；部署 / 合并另受授权。

建议波次：

```text
N00 → N01 → N02
       └─ U: N06（fixture，可并行）
N02 → Q:N03    + N:N04→N05   + V:N08
随后 → U:N07  + V:N09        + D/N:N10（按文件租约串行）
整合 → T:N11 → T:N12 → S/T:N13
```

任一时刻最多三个写槽。T 测试代码编写占写槽，不能称 “审查” 绕限额；T 的只读结果检查不占。N10 对 N-owned 通知文件只能由 N 本人提交，D 只管理 DB，避免 “共同负责 = 共同乱改”。

## 12. Worktree / PR / CI 运行规程

S 从**新的独立 clone**建立实施根，不复用受保护目录的 Git common-dir。记录研究 SHA 与实际 baseSha 差异、契约版本、work-package、owner、allowedPaths、leaseGeneration、targetBranch、checkoutStartSha、activePR、evidencePaths。

**依赖通过与生产合并不是同一件事。** S 可以在授权范围内建立不会触发生产部署的集成分支：前置包通过契约 / 对应 CI 与 review 后，形成记录明确的不可变集成 SHA 供后继工作树使用。该 SHA 必须列出包含的 PR / 提交；不能以任意 worker 的 WIP head 充当已接受前置。最终仍按目标分支保护审查与合并，不为了解锁并行而提前把半成品合入 canary。如果部署配置对所有 branch 都触发生产，先修隔离或停用这一路径。

每个工作包一个稳定交付分支和主 PR；每个写入 attempt 用独立物理 worktree，初始从已接受契约 base 开始，修复从当前 PR head 开始。CI 失败 / 评论修复继续同一 PR，不另造一串无关 PR。

路径隔离不等于权限沙箱。Git worktree 共享对象 /refs 和默认 config \[S12]；不得并行改全局 Git 配置、跑 gc/prune/clean -fdx、reset 他人分支或删除活跃 wt。远端写凭据最小授权，S 掌握目标分支发布 / 合并权；工作树文件租约不被视为安全隔离保证。

每个 writer 提交 handoff：base/start/head SHA、真实文件清单、合同版本、所完成 AC、未验证项、PR 链接、CI exact-head 证据。没有证据状态就是 NEEDS\_VERIFICATION，不自动 DONE。新的 head / 改变目标 base / 新审查意见须重估受影响测试与审查。

本机不编译测试。CI 运行所属包测试、全仓库 typecheck、实际 migration test、既有 E2E 体系与安全 fixture；需查最新脚本 / 配置，不凭旧文件硬写命令。CI 选择器不可因文件路径迁移而漏跑。duplicate-skipped 汇总不是执行证据；同一 head / 相同组合 tree 的实际成功 run 可复用且明确链接。

真实校验在隔离 Preview，禁止 AGENTS 提及的生产 debug 代理作为本轮测试环境。每个 CI 数据库 / 队列 namespace、object prefix、测试用户、授权回调分别隔离；不复制生产.env。S/T 限制获密钥 CI 的事件 /actor，fork / 不可信 PR 不能拿真凭据；不用 pull\_request\_target 在有 secret 时执行不可信 head。

功能分支串行合并；组合冲突须重测，不以 “各分支绿” 代替组合验证。不能本地伪造独立 GitHub review；批准与 merge 按仓库既有保护。

## 13. 兼容迁移、上线和回滚

### 13.1 Expand → shadow → reconcile → switch

1. 增加可空字段 / 伴随表与索引，不删除已有通知 / Team/Task/ 审批表。冻结 schema 版本，唯一 migration owner 按最新 journal 分配序号。
2. 旧通知保留原 ID/read/archive。回填 `activityVersion=1`，readVersion 由原 isRead 决定；不可解析的 source 保留安全兼容展示。不得把所有历史通知置未读。
3. 现存 pending 来源单独核对：未决且有权处理的请求建立 / 修复一个动作 episode，保留原始创建时间；已决定 / 过期 / 已失权的不重新催办。只读 source 检查与投影恢复有界分页。
4. 旧通知 producer 和新 projector 用同一 canonical key / 迁移标志避免双发。不能先让两个 production writer 并跑再靠 UI 过滤重复。
5. shadow 只计算比较或写隔离影子表，不向用户 /email/push 发送；记录列表 / 计数 / 权限差异与旧 source 覆盖率。双读不双写，权威由明确开关决定。
6. 切换 notification 页面与铃铛到同一 summary/read contract；保留原必要 source UI 作为审批后备入口。旧 HomeInbox 只展示批准保留的摘要，聊天 topic 未读继续是聊天，不自动等于工作通知已读。
7. 用户导航偏好按版本合并新入口，保留既有主页、排序与收藏，不强制清空 localStorage。命令 / 原生菜单 / 收藏 deep links 同一迁移；workspace 内外隔离。
8. 新旧事件消费者切换带 generation，保持未完成回执可接管。过渡期旧客户端 markAll 规则也必须调用新快照语义或明确限制，不保留无界全清路径。

### 13.2 开关和发布

内部开关按 notification projection、action adapters、work navigation、saved views 分域；用户不见开关矩阵。先 CI→测试 Workspace→小范围真实成员→扩大。P0 AC 全部通过才宣称主功能完成。

没有可用 ACP 测试执行者时基础通知 / 视图仍可提交，但整体 “Agent 审批闭环” 必须标 BLOCKED\_EXTERNAL\_VERIFICATION，不得标全量完成。缺真实 GitHub 测试安装同理。需要用户提供权限时只说明具体阻塞，不请求更宽泛生产权限。

### 13.3 回滚

隐藏新入口 / 停新增投影不删除通知、审批、Task、PR 或回执；回到旧兼容 UI 仍能找到未决请求。不能回滚成 “审批卡片都没了但 Agent 等着”。冻结动作写适配后明确保留原 source 入口；停止 / 恢复有 generation 核对，不能重发历史批准。

指标：事件到可见时延、pending 来源与卡片差异、重复 episode、未读误消、无权限标题 / 计数、动作 unknown、旧 deep link 失败、查询 p95、SSE 跨 scope、放弃率、完成一项审批 / 保存视图的交互次数。严重泄漏、重复授权或任务误完成任一出现即关闭受影响动作域并调查。

## 14. 完成定义与交接

`ACCEPTANCE.md` 含必测行为编号与执行层级，非测试结果。T 逐项提供实际 run / 截图 / 日志和 source/preview SHA。至少包含：

- 新事件与批量已读并发；用户 A/B 与两个 Workspace 隔离；私密 Team 撤权后计数和预览不可见。
- 重放 webhook/outbox 后不重复提示，不出现消费者抢 ACK 漏事件。
- 归档 / 已读 /snooze 不消除必要审批，不改变 Task Done；旧 modal 资源转移功能不回归。
- 明确委派归属，不能看到所有 “我的 Agent” 的他人任务；未绑定 Project 的 Task 完整显示。
- 共享 @me 视图按访问者求值；非法过滤不扩权；分页列表 / 看板 / 计数口径一致；不把跨 Team 拖拽变成任意状态更新。
- 真 ACP 发出请求，通知可见，人类拒绝 / 允许到原 request，重复点击和过时代次不重复执行。
- 真 PR 产生检查失败 / 审核请求，Inbox/My Work 可定位准确 head；修复同一 PR 后状态更新，旧 head 审核不让新 head 通过。
- OAuth 来源同步不回写外部私人通知读态；初始大导入仅摘要，无任务 / 模型风暴。
- Web、Electron、Mobile/PWA 及旧路径，键盘 / 触摸 / 窄屏可完成同一业务流程。

交付物：相关 PR（分工清楚）、每 PR 功能文档、完整迁移与回滚 runbook、机器可读 AC 证据索引、精确 head 独立 review、受控真实闭环报告。任何 mock、缺凭据、未跑、跳过均明确记录；不声称零 bug。

本包同时提供 `RESEARCH.md`（来源及采用理由）、角色提示词、任务 DAG / 所有权、决策记录、合同夹具和交接模板。先读 README 再派工；不要把 “所有 AC 编号都有一行” 当作验收通过。

# ADR-0001：Linear 语义统一与工作区联动模型

状态：已冻结（WM-01，contractSha = 本分支 head）\
日期：2026-09-17\
决策者：S（协调）+ A（领域）

## 背景

Orvilo 需要把工作区组织模型与 Linear 语义对齐，同时保留既有 tasks/projects/
TaskDispatch/worktree/ 规划底座。本文冻结数据模型、字段命名、命令边界和错误码，
后续工作包（WM-02…WM-10）不得各自重新解释。

## 决定

### 1. 对象模型

```text
Workspace
├── Teams          长期责任域：workflow states、cycles、默认执行资源、政策
├── Projects       跨 Team 交付目标（复用现有 projects 表，ID 稳定）
├── Issues         复用现有 tasks 表；共享模式必有 Team，Project 可选
└── Repositories   共享代码资源；Checkout 是设备上的授权本地副本

Project ↔ Team         多对多（project_teams）
Project ↔ Repository   多对多（project_repositories）
Issue → Team [1]；Issue → Project [0..1]；Issue → Cycle [0..1]
```

- 不重命名现有 `projects` 表；不复制跨 Team Project。
- `TaskOrchestrationOwner` 增加 `team:<id>`；`TaskPlanningScopeType` 增加 `team`。
- 历史个人模式（`workspace_id IS NULL`）task/project 保持 `team_id = NULL`。

### 2. 冻结字段命名

| 字段                                   | 语义                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `tasks.team_id`                        | 本地 `teams` 行 FK；共享模式必填（应用层），个人模式 NULL                   |
| `tasks.workflow_state_id`              | **保留**：外部 provider state UUID 原文投影（Linear state UUID）            |
| `tasks.workflow_state_ref_id`          | **新增**：本地 `team_workflow_states` 行 FK，内部状态指针                   |
| `tasks.cycle_ref_id`                   | **新增**：本地 `team_cycles` 行 FK                                          |
| `team_workflow_states.remote_state_id` | 该本地状态对应的远端 UUID（round-trip）                                     |
| `projects.migration_class`             | `delivery_project`/`legacy_work_container`/`undetermined`（迁移审查元数据） |
| `projects.user_id`                     | 改 nullable + `onDelete: set null`；安装者退出不删共享项目                  |
| `projects.created_by_subject_*`        | managed 创建主体（同 tasks 模式）                                           |

**理由**：`workflow_state_id` 现存值是外部 UUID，直接加 FK 会让全部旧行违反约束。
两列共存：旧字段继续存外部原文，新字段指向本地状态表；全部调用迁移后才可收缩。

### 3. Team 编号分配

`teams.next_issue_seq` 由事务内 `UPDATE teams SET next_issue_seq = next_issue_seq + 1 … RETURNING`
分配，`<key>-<n>` 为显示编号。禁止 `max(seq)+1` 无锁竞争。远端确认前显示临时本地标识，
`linear_issue_links.alias_identifiers` 保留旧别名；编号不决定 Task 身份（UUID 才是）。

### 4. 新表（WM-02 实施）

`teams`、`team_members`、`team_workflow_states`、`team_cycles`、`project_teams`、
`team_repo_defaults`、`repositories`、`repository_checkouts`、`project_repositories`、
`association_decisions`、`linear_sync_scopes`、`linear_team_links`。

扩展现有表：`tasks`（上述列）、`projects`（created\_by\_subject、migration\_class、user\_id 松弛）、
`linear_project_bindings`（快照 / 确认 / 冲突列，升级为 ProjectLink）、
`linear_issue_links`（alias\_identifiers、linear\_team\_id）、`task_domain_events`（team\_id）。

### 5. 命令与权限边界

所有领域命令使用 `CommandContext`（`@orvilo/types` → `domainCommand.ts`）：
workspaceId 由服务端从认证上下文建立，principal 区分 user/agent/integration/system，
authorizationRevision + expectedRevision 做乐观并发，idempotencyKey 去重。

冻结服务边界（实现者）：

| 边界                                                        | 实现                             |
| ----------------------------------------------------------- | -------------------------------- |
| `createTeam / createProject / createIssue / moveIssue`      | A（领域命令，事务 + 领域事件）   |
| `startWorkspaceImport / readSyncSummary`                    | B（持久导入作业，非浏览器轮询）  |
| `publishProject / resolveExternalProject`                   | B（发布授权 + outcome\_unknown） |
| `resolveRepository / registerAuthorizedCheckout`            | C（身份核验，不授予执行权）      |
| `proposeAssociation / applyAssociation / rejectAssociation` | C（建议，不返回 grant）          |
| `resolveExecutionTarget`                                    | C 供资源信息 + D 做执行门禁      |
| `requestReplan / applyPlan`                                 | D（源无关，含 team scope）       |
| `requestRun / requestStop / reconcileDelivery`              | D（复用 TaskDispatch/Runner）    |

### 6. 错误码（冻结）

`FORBIDDEN_SCOPE`、`STALE_REVISION`、`IDENTITY_CONFLICT`、`PUBLICATION_NOT_APPROVED`、
`RESOURCE_UNRESOLVED`、`SYNC_PENDING`、`OUTCOME_UNKNOWN`、`STOP_UNCONFIRMED`、
`DEPENDENCY_BLOCKED` — 见 `domainCommand.ts` 的 `DOMAIN_ERROR_CODES` 与 `DomainError`。
前端只根据结构化 code 分支，不解析英文文案。

### 7. 权限矩阵（摘要）

| 动作                      | 所需身份                                         |
| ------------------------- | ------------------------------------------------ |
| 创建 / 归档 Team          | workspace 管理员                                 |
| 修改 Team 政策 / 默认资源 | workspace 管理员或 team lead                     |
| Issue 跨 Team 移动        | 源 Team 可读 + 目标 Team 可写                    |
| Project 发布到 Linear     | scope 发布授权 + 项目可写                        |
| 注册 Checkout             | 目录授权主体本人                                 |
| 应用 / 拒绝 / 撤销关联    | 对应源对象可写                                   |
| 执行（run）               | 既有 grants × workspace × team/project/task 交集 |
| 规划（replan）            | scope 所有者；人工锁 / 撤权不被覆盖              |

细则与私密可见性规则见 `PERMISSIONS.md`。

### 8. 不变量（承接规格 §2.1）

1. 相同外部 UUID 只对应一条本地 Task；显示编号不判身份。
2. 导入 / 关联不授予执行、邀请、公开或 push 权限。
3. 人工锁定、权限撤销、未确认停止、未知外部结果不被自动重规划覆盖。
4. 同一 Task 单一调度 owner；同一 DeliveryContext 单一写者。
5. Done 要求：该需求代次全部必要 PR 已按精确 head 合入目标 base + 必要验收。
6. 私密 Team / 历史私密 task 不因导入、关联或模型上下文扩大可见性。

### 9. 显式排除（本轮不做）

完整 Cycle/Milestone 管理、外部自定义字段全量双向、跨 Linear 组织联邦写入、
GitHub Projects 双向视图、GitHub issue 第二条写路、批量重编历史编号。

## 备选方案（已拒绝）

- **把 projects 重命名为 teams**：破坏既有项目 / 任务 / PR 稳定身份。
- **Project 只属于一个 Team**：违反跨团队交付目标语义。
- **沿用 Plane 的 Project→Module 嵌套**：与 Linear 语义和现有 ID 体系不兼容。
- **新写一套派发 / 规划表**：绕过 TaskDispatch 会失去租约、fence 与唯一活跃约束。

## 影响

- schema/migration/journal 仅由 A 写；契约变更走 CR → 新 contractSha。
- 根 API router 由 S 接线；lockfile 由 S 管。
- 灰度 flags：`teamModelEnabled`、`workspaceLinearSyncEnabled`、`projectOutboundEnabled`、
  `associationSuggestionsEnabled`、`sourceIndependentPlanningEnabled`、`managedAutoExecutionEnabled`。

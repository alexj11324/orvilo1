# Issue 溢出菜单后端 (`taskMenu`)

> 本文说明 Issue 详情页 “⋯” 溢出菜单所依赖的后端：tRPC 路由 `taskMenu`、四张新表、
> 以及周期性 Issue 的 sweep。这里只有后端和一个薄的客户端封装，菜单 UI 由后续 PR 接入。
> 迁移规范见 `.agents/skills/db-migrations/SKILL.md`。

## 范围

| 层         | 位置                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| 路由       | `apps/server/src/routers/lambda/taskMenu.ts`，注册为 `lambda.taskMenu`                           |
| 服务       | `apps/server/src/services/taskIssueDefinition`、`apps/server/src/services/taskIssueRecurrence`   |
| 模型       | `packages/database/src/models/{taskResource,taskDescriptionHistory,taskIssueRecurrence}.ts`      |
| 表         | `task_resources`、`task_description_histories`、`task_issue_templates`、`task_issue_recurrences` |
| 迁移       | `packages/database/migrations/0208_issue_resources_history_definitions.sql`                      |
| 共享类型   | `packages/types/src/task/resources.ts`                                                           |
| 客户端封装 | `src/services/taskMenu.ts`                                                                       |
| API Key    | `packages/const/src/apiKeyScope.ts` 中 `taskMenu: rw('agent:read', 'agent:write')`               |

## 过程一览

| 过程                                                     | 类型    | 说明                                                                    |
| -------------------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| `links` / `addLink` / `removeLink`                       | 读 / 写 | Issue 的外部链接与 PR 资源                                              |
| `descriptionHistory` / `restoreDescription`              | 读 / 写 | 描述的历史版本与恢复                                                    |
| `markDuplicate` / `clearDuplicate`                       | 写      | 标记重复：写 `duplicateOfTaskId`、`triageStatus`，并把状态移到 canceled |
| `copyIssue`                                              | 写      | 复制 Issue，可带子 Issue；不复制任何执行态或自动化配置                  |
| `createRelated`                                          | 写      | 新建 related /sub_issue/parent/blocked/blocking 关系的 Issue            |
| `convertToProject`                                       | 写      | 以 Issue 及其子树新建 Project                                           |
| `convertToTemplate` / `templates` / `createFromTemplate` | 写 / 读 | Issue 模板                                                              |
| `convertToRecurring` / `recurrence`                      | 写 / 读 | 把 Issue 设为周期性创建                                                 |
| `setRecurrenceEnabled` / `removeRecurrence`              | 写      | 暂停、恢复、移除周期                                                    |

## 权限与作用域

与 `apps/server/src/routers/lambda/task.ts` 保持同一套做法：

- 所有过程走 `wsCompatProcedure`：必须登录；请求带 workspace 时必须是该 workspace 的有效成员，
  否则 `FORBIDDEN`。
- 写过程额外叠加 `withScopedPermission('agent:update')`，viewer 只能读。
- `userId` 与 `workspaceId` 只取自 tRPC 上下文，输入里没有这两个字段。
- 每个带 `id` 的过程都先经 `TaskModel.resolve` 解析 Issue。它带 workspace 归属和私有团队 ACL，
  读不到的 Issue 一律返回 `NOT_FOUND`，不区分 “不存在” 和 “无权”。
- 会改写源 Issue 自身行的过程 (`restoreDescription`、`markDuplicate`、`clearDuplicate`、
  `convertToProject`、`convertToRecurring`、`createRelated` 的 `parent`) 复用 `task.update`
  的协同编辑锁：别的成员正持有该 Issue 的编辑锁时返回 `CONFLICT`。
- 带 `expectedDomainRevision` 的过程是乐观并发控制，版本不一致返回 `CONFLICT`
  (`TASK_REVISION_CONFLICT`)。
- `addLink` 的 URL 在两处校验：路由 schema 只接受 `http` / `https`；`TaskResourceModel.add`
  再拒绝带用户名密码的 URL 和超过 2048 字符的 URL。`pull_request` 只接受
  `https://github.com/<owner>/<repo>/pull/<n>`。

## 数据模型

- `task_resources`：每个 Issue 手动挂的链接。`(task_id, kind, url)` 唯一，重复添加只更新标题。
  它没有自己的归属列，读写权限完全跟随所属 Issue。
- `task_description_histories`：描述快照。`TaskModel.update` 在同一事务里写入：
  只有 `instruction` 或 `editorData` 真的变了才记录；第一次记录时顺带补一条 `baseline`
  (被替换掉的旧内容)。更早的版本不会被回填。`(task_id, domain_revision)` 唯一。
- `task_issue_templates`：保存的 Issue 定义 (`TaskIssueTemplateDefinition`)，不含执行态。
- `task_issue_recurrences`：一个源 Issue 至多一条 (`source_task_id` 唯一)。记录节奏、时区、
  下一次到期日和下一次创建时刻。

`TaskModel` 的依赖图咨询锁抽到了 `packages/database/src/utils/taskDependencyLock.ts`，
这样 `TaskIssueDefinitionService` 可以按 “先图锁、后行锁” 的同一顺序加锁。

## 周期性 Issue 的 sweep

`runTaskIssueRecurrenceSweep` (`apps/server/src/services/taskIssueRecurrence/sweep.ts`) 接在
已有的两个每分钟调度入口上，与 `runTaskReminderSweep` 并行执行：

- Hatchet 定时任务 `taskReminderSweep` (`apps/server/src/hatchet/tasks.ts`)。
- 本地循环 `startTaskReminderLocalLoop` (`apps/server/src/services/taskReminder/localLoop.ts`)。

每轮用 `FOR UPDATE SKIP LOCKED` 认领至多 100 条到期记录。创建前重新检查源 Issue 是否还在、
创建者是否仍有 `AGENT_UPDATE` 权限；不满足就把该周期停用并写 `last_error`，不会静默重试。
新 Issue 在上一个到期日次日的 00:01 (按周期自己的时区) 创建，错过的多个周期只补一次。

## 迁移

`0208_issue_resources_history_definitions.sql` 由 `bun run db:generate` 生成后按仓库规范加固为
幂等：`CREATE TABLE IF NOT EXISTS`、`DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`、
`CREATE INDEX IF NOT EXISTS`。只新增四张空表，没有改动已有表，也没有数据回填，
属于部署时可直接执行的常规迁移。

## 与原型分支的差异

本后端移植自 `codex/issue-ui-corrections`，以下几点按 canary 的现状做了调整：

- **到期日不提升 `domainRevision`**：原型把 `dueDate` 加进了 `TASK_DOMAIN_COLUMNS`，这会让每次
  改到期日都发领域事件 (规划器、Linear outbox)。这里没有带上，所以 `convertToRecurring`
  写完到期日后，客户端手里的 `expectedDomainRevision` 仍然有效。
- **成员校验在路由层**：原型把 “有效成员” 判断下沉到了模型的读取谓词里。canary 由
  `wsCompatProcedure` 负责，模型层不重复判断，对应的路由级用例在
  `apps/server/src/routers/lambda/__tests__/integration/taskMenu.integration.test.ts`。
- **编辑锁覆盖更多写过程**：原型只在 `restoreDescription` 检查，这里扩展到所有改写源 Issue 的过程。

## 测试

```bash
cd packages/database && bunx vitest run --silent='passed-only' src/models/__tests__/taskResource.test.ts src/models/__tests__/taskDescriptionHistory.test.ts
bunx vitest run --silent='passed-only' apps/server/src/routers/lambda/__tests__/integration/taskMenu.integration.test.ts apps/server/src/services/taskIssueDefinition apps/server/src/services/taskIssueRecurrence
```

# 调研与事实边界

查阅日期：2026-09-18。产品文档描述发布产品；开源文件描述对应commit，两者不保证版本/套餐相同。只借鉴设计模式，不复制受许可限制的实现。

本轮商业产品主要对照 Linear、GitHub；开源产品对照 GitLab、Plane、OpenProject。额外参考了通知组件文档，但不新增任何通知SaaS依赖。官方文档与局部源码足以核对本轮交互及数据分工，不足以宣称这些产品的所有边界都无缺陷。

## 外部来源

- [S1] **Linear Inbox** — 通知与任务操作、优先/普通更新、稍后与预览。
  https://linear.app/docs/inbox

- [S2] **Linear My issues** — 分配/创建/订阅/动态是同一任务的不同个人视角。
  https://linear.app/docs/my-issues

- [S3] **Linear Custom Views** — 保存查询与展示、分享及收藏；链接不等于授权。
  https://linear.app/docs/custom-views

- [S4] **Linear Reviews** — 当前侧栏已包含Reviews；代码访问与个人身份需要授权，审核与PR数据可联动。
  https://linear.app/docs/diffs

- [S5] **Linear Pulse** — 项目/Initiative更新流，可作为摘要进入Inbox；本轮独立页面后置。
  https://linear.app/docs/pulse

- [S6] **GitHub Notifications** — 通知Read/Done/Save/Unsubscribe区分，用于个人组织而非任务完成。
  https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox

- [S7] **GitLab To-Do** — 评审/提及/失败CI等动作来源；不能照抄其普通活动自动完成规则到审批。
  https://docs.gitlab.com/user/todos/

- [S8] **Plane Inbox** — 接收人相关事件与右侧预览，个人通知状态独立。
  https://docs.plane.so/communication-and-collaboration/inbox

- [S9] **Plane Views** — 保存filters/layout/display/sort而不复制工作项。
  https://docs.plane.so/core-concepts/views

- [S10] **OpenProject Work package views** — 内置/私人视图及同一结果的多种布局。
  https://www.openproject.org/docs/user-guide/work-packages/work-package-views/

- [S11] **OpenProject Table configuration** — 过滤、排序、另存为与收藏，不能任意覆盖内置视图。
  https://www.openproject.org/docs/user-guide/work-packages/work-package-table-configuration/

- [S12] **Git worktree 官方手册** — linked worktree共享refs与默认config；不是安全沙箱。
  https://git-scm.com/docs/git-worktree

- [S13] **Linear Triage** — Team级接纳新任务的工作流，不是个人Inbox。
  https://linear.app/docs/triage

## 仓库源码定位

- [R1] `packages/app-config/src/routes/index.ts`
  https://github.com/alexj11324/orvilo1/blob/d2c522fd8bf37448dccd86eacc6442a580d55cbd/packages/app-config/src/routes/index.ts

- [R2] `packages/database/src/schemas/notification.ts`
  https://github.com/alexj11324/orvilo1/blob/d2c522fd8bf37448dccd86eacc6442a580d55cbd/packages/database/src/schemas/notification.ts

- [R3] `packages/database/src/models/notification.ts`
  https://github.com/alexj11324/orvilo1/blob/d2c522fd8bf37448dccd86eacc6442a580d55cbd/packages/database/src/models/notification.ts

- [R4] `apps/server/src/routers/lambda/notification.ts`
  https://github.com/alexj11324/orvilo1/blob/d2c522fd8bf37448dccd86eacc6442a580d55cbd/apps/server/src/routers/lambda/notification.ts

- [R5] `src/features/HomeSidebar/Header/components/InboxModal/index.tsx`
  https://github.com/alexj11324/orvilo1/blob/d2c522fd8bf37448dccd86eacc6442a580d55cbd/src/features/HomeSidebar/Header/components/InboxModal/index.tsx

- [R6] `src/features/HomeInbox/index.tsx`
  https://github.com/alexj11324/orvilo1/blob/d2c522fd8bf37448dccd86eacc6442a580d55cbd/src/features/HomeInbox/index.tsx

- [R7] `packages/database/src/schemas/team.ts`
  https://github.com/alexj11324/orvilo1/blob/d2c522fd8bf37448dccd86eacc6442a580d55cbd/packages/database/src/schemas/team.ts

- [R8] `apps/server/src/routers/lambda/team.ts`
  https://github.com/alexj11324/orvilo1/blob/d2c522fd8bf37448dccd86eacc6442a580d55cbd/apps/server/src/routers/lambda/team.ts

- [R9] `src/features/AgentTasks/AgentTaskList/AgentTasksPage.tsx`
  https://github.com/alexj11324/orvilo1/blob/d2c522fd8bf37448dccd86eacc6442a580d55cbd/src/features/AgentTasks/AgentTaskList/AgentTasksPage.tsx

- [R10] `packages/database/src/schemas/eventOutbox.ts`
  https://github.com/alexj11324/orvilo1/blob/d2c522fd8bf37448dccd86eacc6442a580d55cbd/packages/database/src/schemas/eventOutbox.ts

- [R11] `packages/database/src/schemas/actionApproval.ts`
  https://github.com/alexj11324/orvilo1/blob/d2c522fd8bf37448dccd86eacc6442a580d55cbd/packages/database/src/schemas/actionApproval.ts

- [R13] `AGENTS.md`
  https://github.com/alexj11324/orvilo1/blob/d2c522fd8bf37448dccd86eacc6442a580d55cbd/AGENTS.md

- [R14] `docs/development/product-scope.md`
  https://github.com/alexj11324/orvilo1/blob/d2c522fd8bf37448dccd86eacc6442a580d55cbd/docs/development/product-scope.md

- [R12] Plane 开源 Notification 模型，实际读取 `5f7d92784c403f76284f0f16718f320221dc7fec`，包含receiver/workspace/read_at/snoozed_till/archived_at及对应索引；这是结构参考而不是复制许可。
  https://github.com/makeplane/plane/blob/5f7d92784c403f76284f0f16718f320221dc7fec/apps/api/plane/db/models/notification.py

## 本次需要纠正的历史判断

1. Orvilo有notification表和InboxModal，不是从零缺通知；缺的是完整任务协作事件覆盖、一级可达性和统一动作语义。
2. Team实体、工作流引用和API已经落入本次基线，不能重建v3数据库。
3. Linear当前除了Inbox/My issues还文档化Pulse和Reviews；Reviews工作流本次接入My Work，Pulse独立页面明确后置。
4. 当前通知写入权限依赖message:create不适合作为自有读态整理能力；改动要用否定权限测试验证，不凭命名推断所有viewer都能/不能。
5. 原event_outbox单status不能直接供多个消费者各自markDelivered；采用独立回执扇出，N01冻结后才并行开发。
6. 原resource-transfer待处理计数已处理部分“已读但未办完”问题，迁移不得退化。
7. 截图或真实线上点击未在本次执行；这是基于源码和官方文档的实施规格，而非视觉像素对齐认证。

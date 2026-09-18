# 决策记录（主协调者唯一修改，语义变化需要版本升级）

- D01：演进既有 notifications 与 InboxModal，HomeInbox 保留有效摘要；不重建第三套通知。
- D02：待处理权威仍在原 approval/input/review/transfer 服务；归档与已读不能消除必要动作。
- D03：新增 Inbox/My Work/Views；本次保留 Tasks/Projects/Automation 一级位置与有效路由，不自动移除 Tasks。
- D04：Team 已实现，不重造；以当前权限 / 团队查询接入导航；Triage 不自动执行。
- D05：Views 保存 queryAst + 展示配置；任务 / 项目类型分别校验；不复制任务；首版不做跨 Workspace 结果。
- D06：Reviews 核心队列放 My Work / 任务详情；没有成熟 diff 服务就明确打开原 PR，完整 diff 编辑器后置；不是空 tab。
- D07：Pulse/Initiatives/Customers/ 完整 Cycles 等不新增主界面；差异公开而非遗忘。
- D08：source 动作必须 CAS / 参数摘要 /epoch 与回执；unsafe generic execute (actionUrl) 禁止。
- D09：outbox 选择现有 dispatcher + 独立 consumer receipts；不允许消费者竞争一个 delivered flag。
- D10：按 user/scope 事务性 feed 版本 + observedVersion 处理读取；不用 global sequence 最大值当提交水位。
- D11：本地通知 read/archive 不回写 Linear/GitHub 个人通知；业务 issue 同步继续原通道。
- D12：AI 只辅助分类 / 摘要 / 受限 query，不是通知路由 / 授权的必需条件；使用批准 ACP，不恢复 BYOK。
- D13：所有 view / 通知结果及其 counts/facets/search/export/cache/SSE 受同一资源权限约束。
- D14：权限内 viewer 能整理自己通知；任务编辑 / 审批权限不随之扩大。
- D15：受保护目录不碰；最多 3writer；所有编译 / 测试走 GitHub CI。旧 v3 相关命令建议被本次覆盖。
- D16：不创建自动合并 / 生产部署授权；每个功能 PR 按当前门禁提供真实文档与 exact-head 证据。

任何变更写：变更理由→影响工作包 / AC→合同新版本→暂停受影响 writer→owner 确认→重新派单。不要口头改变而让并行 Agent 读不同版本。

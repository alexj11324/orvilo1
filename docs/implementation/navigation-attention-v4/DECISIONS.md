# 决策记录（主协调者唯一修改，语义变化需要版本升级）

- D01：演进既有notifications与InboxModal，HomeInbox保留有效摘要；不重建第三套通知。
- D02：待处理权威仍在原approval/input/review/transfer服务；归档与已读不能消除必要动作。
- D03：新增Inbox/My Work/Views；本次保留Tasks/Projects/Automation一级位置与有效路由，不自动移除Tasks。
- D04：Team已实现，不重造；以当前权限/团队查询接入导航；Triage不自动执行。
- D05：Views保存queryAst+展示配置；任务/项目类型分别校验；不复制任务；首版不做跨Workspace结果。
- D06：Reviews核心队列放My Work/任务详情；没有成熟diff服务就明确打开原PR，完整diff编辑器后置；不是空tab。
- D07：Pulse/Initiatives/Customers/完整Cycles等不新增主界面；差异公开而非遗忘。
- D08：source动作必须CAS/参数摘要/epoch与回执；unsafe generic execute(actionUrl)禁止。
- D09：outbox选择现有dispatcher+独立consumer receipts；不允许消费者竞争一个delivered flag。
- D10：按user/scope事务性feed版本+observedVersion处理读取；不用global sequence最大值当提交水位。
- D11：本地通知read/archive不回写Linear/GitHub个人通知；业务issue同步继续原通道。
- D12：AI只辅助分类/摘要/受限query，不是通知路由/授权的必需条件；使用批准ACP，不恢复BYOK。
- D13：所有view/通知结果及其counts/facets/search/export/cache/SSE受同一资源权限约束。
- D14：权限内viewer能整理自己通知；任务编辑/审批权限不随之扩大。
- D15：受保护目录不碰；最多3writer；所有编译/测试走GitHub CI。旧v3相关命令建议被本次覆盖。
- D16：不创建自动合并/生产部署授权；每个功能PR按当前门禁提供真实文档与exact-head证据。

任何变更写：变更理由→影响工作包/AC→合同新版本→暂停受影响writer→owner确认→重新派单。不要口头改变而让并行Agent读不同版本。

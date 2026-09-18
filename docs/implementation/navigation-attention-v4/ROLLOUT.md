# 切换与回滚运行清单

完整规则见 IMPLEMENTATION\_SPEC 第 13 节。负责：S 协调，D migration，N 投影 / 动作适配，V 界面，T 证据。此文件不授予实际部署或生产迁移权限。

## 上线前

确认研究 SHA 与当前 HEAD 差异；开放 PR 已合解 / 冻结契约；migration 编号无冲突；新旧 schema 兼容；notification 旧生产者清单齐全；所有 source adapter 已读过实际权限与状态机；Task 完成门禁保留；退休入口不可达；用户现有主页 / 导航不重置。

## 分批

先 CI 升级旧 DBfixture 和重复回填→受控 Preview shadow→单个测试 Workspace 切 live→邀请获准测试成员→扩大。每批观察源 pending 与 Inbox 差异、读态误清、重复 episode、失权后标题 / 计数、action unknown、查询时延。禁止 shadow 发邮件 / 通知，禁止两个 live projector 同时投递。

## 熔断

任一越权信息泄露 / 重复批准 / 误标 Task Done / 源请求失踪：关闭对应动作 adapter 写入口，保留查看及原 source 处理入口；记录 eventId/requestId/generation 精确证据，不在报告输出 secrets。受控停止相关 worker，保留回执以便核对。

## 回滚

不删除通知 / Task / 审批 / PR / 回执；恢复旧兼容路由及原 source 动作入口；保持新读态可解释；outbox 交接核对 consumer/generation，不重放已消费批准。数据库优先向前修复，不对已部署 migration 改历史内容。最终发布决定由被授权主体按仓库规则执行。

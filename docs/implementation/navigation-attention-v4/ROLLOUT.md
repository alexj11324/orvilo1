# 切换与回滚运行清单

完整规则见IMPLEMENTATION_SPEC第13节。负责：S协调，D migration，N投影/动作适配，V界面，T证据。此文件不授予实际部署或生产迁移权限。

## 上线前
确认研究SHA与当前HEAD差异；开放PR已合解/冻结契约；migration编号无冲突；新旧schema兼容；notification旧生产者清单齐全；所有source adapter已读过实际权限与状态机；Task完成门禁保留；退休入口不可达；用户现有主页/导航不重置。

## 分批
先CI升级旧DBfixture和重复回填→受控Preview shadow→单个测试Workspace切live→邀请获准测试成员→扩大。每批观察源pending与Inbox差异、读态误清、重复episode、失权后标题/计数、action unknown、查询时延。禁止shadow发邮件/通知，禁止两个live projector同时投递。

## 熔断
任一越权信息泄露/重复批准/误标Task Done/源请求失踪：关闭对应动作adapter写入口，保留查看及原source处理入口；记录eventId/requestId/generation精确证据，不在报告输出secrets。受控停止相关worker，保留回执以便核对。

## 回滚
不删除通知/Task/审批/PR/回执；恢复旧兼容路由及原source动作入口；保持新读态可解释；outbox交接核对consumer/generation，不重放已消费批准。数据库优先向前修复，不对已部署migration改历史内容。最终发布决定由被授权主体按仓库规则执行。

# Orvilo v4 Codex 执行包：导航与注意事项闭环

本包是v3实施包的增量补充，不重做已落地Team/Linear/仓库/ACP。研究基线：`canary@d2c522fd8bf37448dccd86eacc6442a580d55cbd`，2026-09-18。14个工作包、7个角色、64项行为验收，状态全部PLANNED/NOT_RUN。

## 阅读入口
先读IMPLEMENTATION_SPEC.md与DECISIONS.md，再读RESEARCH.md；主Agent按agents/S.md执行N00，然后用work-packages.json和ownership.json派工。agents/下为角色独立提示词，ACCEPTANCE.md是必须提供证据的结果合同。

## 直接交给Codex的启动文字

请在当前仓库按本包完成navigation-attention-v4增量改造。首先读取全部合同并重新核对canary实际HEAD/开放PR/已落地代码，不要倒退到研究SHA。不要访问或修改 /Users/alexjiang/Desktop/vibe/orvilo1；建立独立实施clone与worktrees。全局最多3个写Agent，所有编译/测试通过GitHub CI和获准隔离Preview，不在本机运行或伪造CI环境。先冻结N01并由D唯一推进schema/类型/migration，再按依赖并行；共用文件按owner租约修改。复用notifications/InboxModal/Team/actionApproval/eventOutbox及现有ACP。补齐Inbox、My Work、Teams/Triage、Saved Views、Favorites/搜索与审核工作流，保留Tasks/Projects/Automation和已退役边界。每个包在同一主PR上完成修复/文档/真实证据，不把mock或跳过当通过；不自行合并或部署生产。依据handoff模板逐次回报已做、未验证及阻塞。

## 文件说明
- IMPLEMENTATION_SPEC.md：完整产品、架构、API、UI、权限、并行、迁移规格。
- RESEARCH.md：官方产品与固定commit源码来源、哪些借鉴哪些不做。
- DECISIONS.md：冻结决策，不允许各Agent各自改语义。
- work-packages.json / ownership.json：DAG与文件所有权候选；N00填实际路径及租约。
- agents/*.md：7份角色提示词。
- ACCEPTANCE.md：64项验收合同，未执行。
- ROLLOUT.md：灰度、熔断、回滚，未授权自动部署。
- contracts/：人工构造的数据/接口样本，不是已运行SDK。
- baseline.template.json / handoff.template.json：执行前/交接记录模板。
- evidence/packet-validation.json：仅本包结构校验，不是产品测试。
- SHA256SUMS：文件完整性摘要。

本包没有业务实现、可运行迁移、真实OAuth凭据或已通过产品测试；不能将文件完整性校验解释为“方案保证没有错误”。真实功能是否完成由准确head的CI/审查/外部闭环证据决定。

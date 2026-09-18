# Orvilo v4 Codex 执行包：导航与注意事项闭环

本包是 v3 实施包的增量补充，不重做已落地 Team/Linear/ 仓库 / ACP。研究基线：`canary@d2c522fd8bf37448dccd86eacc6442a580d55cbd`，2026-09-18。14 个工作包、7 个角色、64 项行为验收，状态全部 PLANNED/NOT\_RUN。

## 阅读入口

先读 IMPLEMENTATION\_SPEC.md 与 DECISIONS.md，再读 RESEARCH.md；主 Agent 按 agents/S.md 执行 N00，然后用 work-packages.json 和 ownership.json 派工。agents / 下为角色独立提示词，ACCEPTANCE.md 是必须提供证据的结果合同。

## 直接交给 Codex 的启动文字

请在当前仓库按本包完成 navigation-attention-v4 增量改造。首先读取全部合同并重新核对 canary 实际 HEAD / 开放 PR / 已落地代码，不要倒退到研究 SHA。不要访问或修改 /Users/alexjiang/Desktop/vibe/orvilo1；建立独立实施 clone 与 worktrees。全局最多 3 个写 Agent，所有编译 / 测试通过 GitHub CI 和获准隔离 Preview，不在本机运行或伪造 CI 环境。先冻结 N01 并由 D 唯一推进 schema / 类型 /migration，再按依赖并行；共用文件按 owner 租约修改。复用 notifications/InboxModal/Team/actionApproval/eventOutbox 及现有 ACP。补齐 Inbox、My Work、Teams/Triage、Saved Views、Favorites / 搜索与审核工作流，保留 Tasks/Projects/Automation 和已退役边界。每个包在同一主 PR 上完成修复 / 文档 / 真实证据，不把 mock 或跳过当通过；不自行合并或部署生产。依据 handoff 模板逐次回报已做、未验证及阻塞。

## 文件说明

- IMPLEMENTATION\_SPEC.md：完整产品、架构、API、UI、权限、并行、迁移规格。
- RESEARCH.md：官方产品与固定 commit 源码来源、哪些借鉴哪些不做。
- DECISIONS.md：冻结决策，不允许各 Agent 各自改语义。
- work-packages.json/ownership.json：DAG 与文件所有权候选；N00 填实际路径及租约。
- agents/\*.md：7 份角色提示词。
- ACCEPTANCE.md：64 项验收合同，未执行。
- ROLLOUT.md：灰度、熔断、回滚，未授权自动部署。
- contracts/：人工构造的数据 / 接口样本，不是已运行 SDK。
- baseline.template.json/handoff.template.json：执行前 / 交接记录模板。
- evidence/packet-validation.json：仅本包结构校验，不是产品测试。
- SHA256SUMS：文件完整性摘要。

本包没有业务实现、可运行迁移、真实 OAuth 凭据或已通过产品测试；不能将文件完整性校验解释为 “方案保证没有错误”。真实功能是否完成由准确 head 的 CI / 审查 / 外部闭环证据决定。

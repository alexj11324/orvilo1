# Agent T — 独立验证与发布证据

你参与 Orvilo navigation-attention-v4。写行为回归与权限 / 迁移 / 并发测试，GitHub CI 和授权 Preview 验收；只读 review 不能悄悄修生产代码。

## 开始前必须读取

README.md、IMPLEMENTATION\_SPEC.md、DECISIONS.md、ownership.json、work-packages.json、ACCEPTANCE.md、自己的 handoff 与当前仓库 AGENTS / 适用 skills。全部，重点 ACCEPTANCE 和准确 head / 真人权限 / 未决请求回滚。
只执行 S 明确分配的工作包，默认关联：N11,N12,N13。JSON 定义所有依赖，不能把别人的 WIP 当已接受前置。

## 共同硬限制

- 不碰 `/Users/alexjiang/Desktop/vibe/orvilo1`，不用其 common-dir；新实施 clone + 独立 wt。
- 全局最多 3 个 writer，本机不编译 / 测试 / 起 dev server；CI / 获准 Preview 验证。不得用 CI=true 绕过。
- 不新增或恢复 Provider/BYOK/ 旧 Lobe 模型循环 / 退役工作台。所有 Agent 执行沿现有 ACP 合同。
- 保留 Tasks、Projects、Automation 入口与任务 ID / 已完成审核证据。UI 读取通知与审批 / 任务完成严格分离。
- 只改 allowedPaths；需要公共文件时给 owner 提具体 schema/API/test 需求，不自行 patch。索引 /journal/ 类型由 D 唯一写。
- 功能代码和必要文档在同一 PR，失败 / 未验证 / 缺授权如实写；不得修改测试去掩盖失败。
- 一个包一个主 PR，修复继续同 PR 当前 head；一个交付分支只有一个 active writer，不强推抹他人提交。

## 必须交回

按 handoff.template.json 记录：workPackage、baseSha、checkoutStartSha、headSha、contractVersion、files、完成的行为、CI/preview 证据链接、缺口、风险和后续 owner。
未实际执行的测试一律 NOT\_RUN；夹具 UI 不等于真实接线；external 不可用标 BLOCKED\_EXTERNAL\_VERIFICATION。不要主动 merge/deploy。

## 独立性

测试发现错误，提交最小可复现场景 / 原代码失败证据给实现 owner；不要在 review 分支修实现然后宣称独立通过。对自己的测试代码也记录 SHA，不将同一账号的多 Agent 意见冒充人类 GitHub 审批。

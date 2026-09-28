# Agent S — 主协调与集成

你参与 Orvilo navigation-attention-v4。核定基线与开放PR、派单、租约、依赖和公共接线；不代替领域owner乱改。

## 开始前必须读取
README.md、IMPLEMENTATION_SPEC.md、DECISIONS.md、ownership.json、work-packages.json、ACCEPTANCE.md、自己的handoff与当前仓库AGENTS/适用skills。阅读全部，重点0/10—14节；先核current HEAD再派单。
只执行S明确分配的工作包，默认关联：N00,N01,N13。JSON定义所有依赖，不能把别人的WIP当已接受前置。

## 共同硬限制
- 不碰 `/Users/alexjiang/Desktop/vibe/orvilo1`，不用其common-dir；新实施clone+独立wt。
- 全局最多3个writer，本机不编译/测试/起dev server；CI/获准Preview验证。不得用CI=true绕过。
- 不新增或恢复Provider/BYOK/旧Lobe模型循环/退役工作台。所有Agent执行沿现有ACP合同。
- 保留Tasks、Projects、Automation入口与任务ID/已完成审核证据。UI读取通知与审批/任务完成严格分离。
- 只改allowedPaths；需要公共文件时给owner提具体schema/API/test需求，不自行patch。索引/journal/类型由D唯一写。
- 功能代码和必要文档在同一PR，失败/未验证/缺授权如实写；不得修改测试去掩盖失败。
- 一个包一个主PR，修复继续同PR当前head；一个交付分支只有一个active writer，不强推抹他人提交。

## 必须交回
按handoff.template.json记录：workPackage、baseSha、checkoutStartSha、headSha、contractVersion、files、完成的行为、CI/preview证据链接、缺口、风险和后续owner。
未实际执行的测试一律NOT_RUN；夹具UI不等于真实接线；external不可用标BLOCKED_EXTERNAL_VERIFICATION。不要主动merge/deploy。

## 调度
先完成N00并冻结写槽/文件租约，D的N01-N02为短串行主线；其余按DAG放行。实时检查并行ACP/协作/数据库PR碰撞；未解决安全前置只停受影响线路。你写lambda根与依赖；V写导航/SPA；D写schema/type/journal。验收不足时交付partial+明确缺口，不写“全部完成”。

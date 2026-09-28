# 技能分发退役

服务端「可拉取技能包」分发通道与独立的 Acceptance/Verify 平台表面已整体退役。本文记录退役范围与各入口的当前行为。

## 退役范围

- `verify.ts` 中的 `PULLABLE_SKILLS` 清单、`AcceptanceSkill` 类型与 `getSkillBundle` 过程已整体删除 —— 残留调用方在契约层得到「procedure not found」，不会拿到空结果或静默降级。
- `lh acceptance …` 顶层命令组与 `lh verify` 下的 run/result/evidence/install 子命令整体移除：CLI 不再能凭空创建无任务归属的验收轮次。`apps/cli/src/commands/acceptanceRetired.test.ts` 是这层退役的回归护栏。
- onboarding UI（`AcceptanceOnboarding.tsx`）、公开 guide（`public/acceptance/skill.md`）、任务 prompt 中的工具链分支与相关 i18n 文案随组件一并删除；验收技能本体以 vendored 形式随仓库分发（`.agents/`），不再经服务端下发。

## 理由

技能分发与独立验收平台让 acceptance 流程脱离任务上下文在线下发技能包、自建轮次；审计要求退役面真正不可用而不是「留着但没人调」。整面删除让残留调用方立刻显形。

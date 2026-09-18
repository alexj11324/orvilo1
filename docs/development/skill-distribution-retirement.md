# 技能分发退役

服务端「可拉取技能包」分发通道已退役。本文记录退役范围与各入口的新行为。

## 退役范围

- `verify.ts` 中的 `PULLABLE_SKILLS` 清单与 `AcceptanceSkill` 类型已删除。
- `getSkillBundle` 不再返回技能包，统一抛出明确的退役错误——调用方得到的是可诊断的失败而不是空结果或静默降级。

## CLI 入口

- `lh acceptance install` 与 `lh acceptance update` 退役：两个命令现在直接报告退役错误，不再尝试下载或安装技能包。相关死代码与无用 import 一并清理。
- 引用旧命令的入口（onboarding UI、任务 prompt、公开 guide、i18n 文案）已同步改为退役表述；en-US 与 zh-CN 文案保持一致。

## 理由

技能分发曾经让 acceptance 流程在线下发技能包；审计要求退役面真正不可用而不是「留着但没人调」。统一抛退役错误可以让残留调用方立刻显形，而不是悄悄拿到空数据继续跑。

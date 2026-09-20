# P20 — 切流 / 灰度 / 回滚 Runbook 与证据索引

> 编号：P20 ｜ 依赖：P19
> 范围：真实 ACP/CAID 验收执行计划、灰度切流步骤、回滚底线、证据索引格式。
> 纪律（来自 P00 acceptance.md）：真实 ACP/Preview 用例必须真机执行；环境缺位记 `BLOCKED`，不用 mock 顶替。

## 1. 发布前置（gate，全部满足才可切流）

| 条件                                         | 验证方式                | 责任人    |
| -------------------------------------------- | ----------------------- | --------- |
| P00–P21 全部合入 `canary`，栈内无 open draft | `git log` 链 + PR 状态  | 协调器    |
| 固定整合 SHA 上 Required Quality Gate 全绿   | CI run 链接记入证据索引 | 发布者    |
| 接受矩阵 §7 硬条件逐条有证据                 | 本文档 §4 索引          | Q0 验收者 |
| `@hugeicons` 上游坏包修复或锁定可构建版本    | `Test Web App` 绿       | C0        |
| 发布产物扫描（E22）：无旧引擎、无退役出站    | build + `dist` 扫描     | 发布者    |

## 2. 灰度切流

**原则：CAID-only 灰度**。旧执行体系已不可执行（无回退目标），灰度只控制「新 CAID 编排面」的暴露。

1. **阶段 0 — 金丝雀环境**：在内部 / 预览环境部署固定 SHA；用真实 ACP harness 跑验收矩阵 §2–§5 必需场景。
2. **阶段 1 — CAID 限量**：允许 CAID Goal 创建；监控 dispatch/operation 错误率、verify 队列深度、integration 序列化冲突率。
3. **阶段 2 — 全量**：矩阵全绿 + 灰度期无 P0 缺陷后放开。

**失败处置（不清空、不回滚旧体系）**：

- 停止新调度：暂停受影响 Goal（人类暂停语义 P16：`goal.pause`/stop fences，Manager/scheduler 无法推翻），或对 Goal 创建入口做权限收敛。
- 已运行生命周期与交付保留：P10 的 server-persisted bridge（callback/result 落库）+ P16 bounded poll 保证已派发任务继续可结算 / 交付 —— 关调度不清空在途工作。
- 已知限制：当前没有「CAID 调度总开关」feature flag；停止新调度走 goal 级 pause + 部署回滚（见 §3）。如灰度需求长期存在，另开工作项加 `caid_dispatch` flag（FeatureFlag schema 已支持 per-user 灰度）。

## 3. 回滚

- **回滚目标**：最近一个 ACP-only 版本（deploy 级回滚 = redeploy 固定 SHA）。**永不以复活 Lobe engine 为回滚** —— 该代码已物理删除（P21 前为不可执行残留）。
- **数据**：本栈唯一迁移为 `0176_task_topics_contract`（`task_topics.contract` jsonb，ADD COLUMN IF NOT EXISTS）—— 纯 additive、nullable，回滚安全无需 down-migration。
- **凭据 /schema 的不可逆删除**：另需授权，不在本 runbook 内（P21 边界）。
- **回滚后历史可读性**：历史 trace/operation 记录由 decoder-only 注册表保证可读（P07 拆分的 live/historical 双注册表在回滚目标版本同样成立）。

## 4. 证据索引（Q0 验收用 — 每行必填）

| 字段        | 说明                                                  |
| ----------- | ----------------------------------------------------- |
| `sha`       | 固定整合 SHA（PR head，合并后 merge SHA）             |
| `env`       | 执行环境：本机 dev /preview/prod；Postgres/Redis 版本 |
| `rows`      | 覆盖的 acceptance.md 行 ID                            |
| `artifacts` | 链接：CI run、录屏、HTTP transcript、DB 快照行        |
| `verdict`   | PASS / FAIL / BLOCKED（含缺什么）                     |

**本机基线执行（2026-09-19，见 acceptance.md 各行证据列）**：

- 栈：`postgres@17` (Homebrew) + Redis 8 + s3rver :29000 + Next :37620 + Vite :26570；pg\_search 迁移（0090/0093）按 marker 规则跳过 —— FTS 能力缺席，不覆盖依赖搜索的行。
- 身份：seeded `agent-testing@orvilo.aspectlylabs.com`（better-auth session）/ `sk-ov-agenttesting0001`。
- 关键 transcript：退役 OpenAPI 路径 404；退役 quota procedures `No procedure found`；`listAccounts`/`getWindows`/`getLatestReadings`/`listSnapshots` 存活；`startExecution` 对不存在 op 显式报错；`goal.create`→graph 持久化→`goal.advance`=`waiting_external`（非阻塞交棒）；dispatched operation 以 `No bound device for hetero agent` 显式落 error —— 无静默执行、无隐藏回退。

## 5. 剩余 BLOCKED 环境清单（Q0 前必须补齐）

| 缺什么                                                                     | 影响行                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------- |
| 真实 ACP harness CLI + 凭据（claude-agent-acp 等）                         | E01/E02/E03/E05–E08/E09/E13、C01–C04、CAID-1..4 真机执行 |
| 已绑定可达 device（device-gateway wss 在本机不可达，注册设备保持 offline） | E01/E02/E03、C03、P06a 完整链路                          |
| LLM provider key（内嵌 agent runtime 模型调用）                            | C01、E12、CAID manager planning 闭环                     |
| 发布构建产物（`bun run build` / desktop bundle）                           | E22 产物扫描、E18 安装 / 升级面                          |
| Hatchet worker（可选调度后端）                                             | E11、CAID 延迟调度路径                                   |

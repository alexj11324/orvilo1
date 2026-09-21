# P00 — 验收矩阵（acceptance）

> 初始状态全部为 `NOT_RUN`；缺环境 / 凭据 / 真机的记 `BLOCKED`，不得用 mock/skip 冒充通过。
> 证据须含：确切 source SHA、host/agent 版本、执行设备归属、失败注入项、CI run 链接。
> 单元测试 stub 到 dispatch 只证明参数传递，不证明真实 ACP 可用。

## 状态词汇

`NOT_RUN` 未执行・`BLOCKED` 缺前置（记原因）・`PASS`（附证据链接）・`FAIL`（附缺陷）

## 1. 退役与准入（旧体系不可复活）

| ID    | 场景                                           | 通过标准                                                  | 状态     | 证据 |
| ----- | ---------------------------------------------- | --------------------------------------------------------- | -------- | ---- |
| E15   | 旧 Lobe engine/Provider 配置导入               | 历史可读；新执行拒绝并要求 ACP binding                    | NOT\_RUN |      |
| E16   | SDK/CLI/Labs/env 绕过                          | 不能恢复旧 LLM loop 或 Provider 凭据注入                  | NOT\_RUN |      |
| E21   | 退役隐藏路由 / 旧客户端                        | 任意认证方式返回一致退役错误；任务验收 /automation 仍工作 | NOT\_RUN |      |
| E22   | 发布 bundle 与默认出站                         | 产物不含旧引擎；不请求退役 Lobe 服务                      | NOT\_RUN |      |
| RB01a | 全入口拒绝旧 engine ID / 未知 runtime / 无绑定 | UI/API/CLI/import/cron/webhook 一致                       | NOT\_RUN |      |
| E14   | `autoStart:false` 旧调用                       | 明确 queued intent 或明确拒绝；不无声提前启动             | NOT\_RUN |      |

## 2. ACP 真实执行边界

| ID  | 场景                        | 通过标准                                                              | 状态     | 证据 |
| --- | --------------------------- | --------------------------------------------------------------------- | -------- | ---- |
| E01 | Web 控制设备 B 普通任务     | 真实握手→prompt→事件→终态；归属 B                                     | NOT\_RUN |      |
| E02 | Desktop 控制同一设备 B      | 与 E01 业务结果 / 权限一致，无原生旁路                                | NOT\_RUN |      |
| E03 | Desktop 本机运行            | 同一 ACP 宿主语义，不启动旧引擎                                       | NOT\_RUN |      |
| E13 | 非流式 / 流式 Agent API     | 本 operation 输出正确；无旧 executeSync、无无穷轮询；topic 级串扰修复 | NOT\_RUN |      |
| E09 | 服务端 / 宿主 / 网络重连    | 订阅重建不重复 prompt；session 恢复按协商能力                         | NOT\_RUN |      |
| E20 | 第二 runtime / 节点 fixture | 不改 Chat/Task/CAID 核心即可接入；fixture 不进生产 registry           | NOT\_RUN |      |

## 3. 聊天闭环（保留能力）

| ID  | 场景                               | 通过标准                                                              | 状态     | 证据 |
| --- | ---------------------------------- | --------------------------------------------------------------------- | -------- | ---- |
| C01 | 多轮 / 流式 / 持久化 / 错误 / 终态 | 消息归属与终态正确；断线≠完成                                         | NOT\_RUN |      |
| C02 | 内置工具 + 外部 MCP+Connector      | 每工具 mounted/unsupported/unauthorized/failed 显式；必需失败禁止执行 | NOT\_RUN |      |
| C03 | 图片 / 多附件到执行目标            | 真到设备；不仅文件名                                                  | NOT\_RUN |      |
| E10 | 审批 / 拒绝 / 撤权                 | 单次授权、作用域 + generation 绑定；观察者不可批准                    | NOT\_RUN |      |
| E08 | 取消 / 设备失联                    | requested/confirmed/unknown 可区分；未确认不重启                      | NOT\_RUN |      |
| C04 | 重连 / 重新生成 / 线程 / 旧聊天    | 读历史不损坏；旧配置需显式 ACP 重绑定                                 | NOT\_RUN |      |

## 4. 异步与群聊

| ID  | 场景                        | 通过标准                                             | 状态     | 证据 |
| --- | --------------------------- | ---------------------------------------------------- | -------- | ---- |
| E05 | 两个改码 child 并行         | thread+worktree 双隔离；parent 按明确 child 结果收口 | NOT\_RUN |      |
| E06 | child 不结束 / 仍发心跳     | per-child 与 parent deadline 生效，不永久等待        | NOT\_RUN |      |
| E07 | callback 重复 / 乱序 / 迟到 | 去重；旧 generation 不回写；barrier 不提前完成       | NOT\_RUN |      |
| E11 | automation 关页后启动       | 不依赖 renderer；启动重验设备与权限                  | NOT\_RUN |      |
| E04 | 重复点击 / ACK 丢失         | 同一 intent 单运行；unknown 不重发 writer            | NOT\_RUN |      |

## 5. CAID 调度与集成

| ID     | 场景                                  | 通过标准                                               | 状态     | 证据 |
| ------ | ------------------------------------- | ------------------------------------------------------ | -------- | ---- |
| CAID-1 | A/B/C/D 非屏障闭环                    | A 集成后 C 启动，B 仍运行；ready = 空≠Goal 完成        | NOT\_RUN |      |
| CAID-2 | exact-head / 集成证据                 | 陈旧 head/base/PR/run 不解锁；skipped-only CI 不算通过 | NOT\_RUN |      |
| CAID-3 | 崩溃 / 重复事件 / ACK 丢失 / 租约过期 | 唯一活跃 owner；不双写                                 | NOT\_RUN |      |
| E12    | Verify/repair 与完成门控              | Agent 自报完成≠Done；CI/review/ 证据门保留             | NOT\_RUN |      |
| CAID-4 | 人类 Pause/Cancel/Reject              | 不被 Manager/scheduler 推翻；已集成不暗 revert         | NOT\_RUN |      |

## 6. Provider/Quota/ 品牌 / 数据

| ID   | 场景                 | 通过标准                                                                                                 | 状态     | 证据 |
| ---- | -------------------- | -------------------------------------------------------------------------------------------------------- | -------- | ---- |
| P06a | Quota 观测           | 绑定所选执行设备；unknown≠0 / 满；无切号 / 托管 OAuth                                                    | NOT\_RUN |      |
| P06b | 无 quota 服务时聊天  | 授权 ACP 运行仍按策略启动                                                                                | NOT\_RUN |      |
| E17  | 账号管理面退役       | create/bind/switch/select/loads 入口全部不可用                                                           | NOT\_RUN |      |
| E18  | 品牌全表面           | 新装 / 升级、Web/Desktop、通知 / 分享 / 导出 / CLI 均 Orvilo；第三方归属不误伤                           | NOT\_RUN |      |
| E19  | 数据升级与回滚       | 迁移幂等可重复；不触碰外部官方应用 / CLI 数据                                                            | NOT\_RUN |      |
| P05a | 非主聊天模型调用审计 | 标题 / 摘要 / 规划 / Verify/AgentSignal 逐消费者：ACP 绑定、确定性替代或退役；无隐藏 generateObject 后门 | NOT\_RUN |      |

## 7. 发布判定硬条件（Q0 前置）

```text
旧 Lobe engine 可执行入口 = 0
旧模型循环生产可达路径 = 0（源码 + 发布产物 + 条件注册均查）
生产 registry 未实现/未验证能力 = 0
第一方品牌表面旧品牌残留 = 0（登记的第三方/归属/历史例外除外）
Provider/account-pool 控制入口 = 0
异步路径无丢失证据/取消/超时保障
保护功能有真实成功与拒绝用例
固定整合 SHA 的全部必需 CI 与 Q0 通过
```

## 8. 验收纪律

- 真实 ACP/Preview 用例必须真机执行；环境缺位记 `BLOCKED` 并写明缺什么（设备、登录、runner、Vercel 限流等）。
- `Q0` 为只读独立验收，对固定组合 SHA 出证据矩阵，不接受 “测试全绿” 叙述代替行为证据。
- 回滚底线：退到最近 ACP-only 版本或暂停 CAID 新调度；**不以复活 Lobe engine 为回滚**。

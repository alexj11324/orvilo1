# Web/Desktop 统一迁移策略（W0 冻结）

> 基线：`canary @ 24d035c2`。原则：向后兼容先行；不删历史数据；不强制全员重走
> onboarding；迁移幂等、可重入。

## 1. 执行目标字段迁移

`OrviloAgentAgencyConfig` 现有字段已够用，**不新增** targetId/runId 体系：

| 旧状态                             | 迁移结果                                                                  | 说明                                      |
| ---------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| `executionTarget` 缺省 + 非 hetero | 解析为 `'none'`（纯对话）                                                 | 查看端默认值取消；需工具时由用户显式选择  |
| `executionTarget` 缺省 + hetero    | 待选态（`none` → UI 提示选设备）                                          | 不再桌面隐式 `local` / Web 隐式 `sandbox` |
| `local` + `boundDeviceId`          | 语义等价于 "绑定到该设备的本地 / 远程执行"；在非本机查看端展示为 `device` | 真实设备不变                              |
| `local` 无 `boundDeviceId`         | Desktop 本机（显式 local 保留）；其他查看端 → 待选 `none`                 | 不把 "查看页面的机器" 偷换成执行机        |
| `sandbox`                          | 保留（provider 支持时）                                                   | 历史配置；不作新任务回退                  |
| `auto`                             | 保留（仅已保存的明确策略）                                                | 离线不私换设备                            |
| workspace `fixed` + 成员 override  | 优先级不变                                                                | `requestedDeviceId` 在 fixed 下无效       |

无需 schema 变更；解析层（`resolveExecutionTarget`/`resolveExecutionPlan`）一次性
生效，存储值原样保留 → 回滚 = 还原解析逻辑。

## 2. Onboarding 状态迁移

| 旧标记                                                    | 新角色                                          |
| --------------------------------------------------------- | ----------------------------------------------- |
| `user.onboarding.finishedAt`（服务端）                    | **唯一权威完成态**                              |
| sessionStorage `orvilo:desktop:onboarding:completed:v1`   | 会话内 "外壳完成" 信号（auto-OIDC 门控）        |
| localStorage `orvilo:desktop:onboarding:everCompleted:v1` | 迁移提示 + auto-OIDC 门控                       |
| localStorage `…:screen:v3`                                | 废弃（不再恢复向导位置；兼容入口忽略）          |
| main-store `desktopOnboardingCompleted`                   | 启动路径信号：统一流程完成 / 兼容入口自愈时写入 |

迁移规则：

- 统一 `/onboarding` 在 Desktop 完成时写入全部外壳标记（含主进程
  `setDesktopOnboardingCompleted(true)`）—— 下次启动走主路径，不再回 onboarding。
- 已认证 + 服务端已完成但标记缺失（如 Web 完成过的账号首登 Desktop）：兼容入口检测后
  补写标记并跳 `/`，不重复引导。
- 受邀 / 已有 workspace 成员：由服务端成员关系决定，不强迫再建工作区。
- 不删除任何本地标记（回滚安全）。

## 3. 工作区创建幂等（本轮：客户端恢复）

- `workspace.create` 无服务端 intent key（stub 实现按 slug 唯一约束报 CONFLICT）。
- 本轮：`OnboardingPage.handleComplete` 捕获 slug-CONFLICT → `workspace.list`
  找回同 slug 工作区复用 → 后续邀请 /setup 照常（覆盖 T20 刷新重试）。
- 待办（服务端）：`create` 增加 onboarding intent key / `get-or-create` 语义。

## 4. 认证恢复迁移

- `sessionAuthEvents` 为统一失效事件；Web/Desktop 适配器行为不变，仅事件源统一。
- 退出登录语义不变：Desktop 清主进程加密 token（`clearRemoteServerConfig`）+
  store logout + 连接面；不隐式撤销设备 / 取消他人运行。
- 401 单飞去重沿用 5s 窗口。

## 5. 兼容顺序与回滚

本轮只做 "解析层 + 服务边界 + 入口路由" 改动，无 schema / 数据迁移：

1. 契约解析生效（纯函数，单测覆盖）。
2. 服务边界显式化（Web 无设备 → 类型化错误；Desktop local 显式保留）。
3. `/desktop-onboarding` → 兼容入口（旧链接、退出登录、`?screen=login` 深链）。
4. OS 权限面板迁入 `Settings/devices`。

回滚：全部改动为纯前端逻辑与路由，回滚 commit 即还原；无写入新存储格式，
无不可回滚数据操作。

## 6. 明确不做（与方案 §6.3/§11 对齐）

- 不加云电脑入口 / 云 provisioner / 计费 / 镜像。
- 不恢复 Provider/BYOK/Skill 等已退役面。
- 不强制历史用户重走 onboarding；不清空本地数据库。
- 不实现新系统常驻服务；renderer / 浏览器关闭不承诺任务继续（设备宿主退出如实显示）。

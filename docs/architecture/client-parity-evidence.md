# Web/Desktop 统一实施证据（滚动更新）

> 基线：`canary @ 24d035c2fdeb77b4cc82b2f027d6698e9a96e52d`。
> 本文件记录实际执行的检查命令、退出码与未运行项。未运行 / 受阻项目明确标注，
> 不写 PASS。

## 0. W0 核实记录（2026-09-18，工作树 orvilo1-parity，分支 fix/web-desktop-parity）

已核实的真实调用链（E01–E12 复核结论）：

- E04/E05：`/desktop-onboarding` 独立状态机属实 ——`DesktopOnboarding/index.tsx`
  驱动 Welcome→Permissions→DataMode→Login，完成态写 sessionStorage `completed`、
  localStorage `everCompleted`、main-store `desktopOnboardingCompleted`；
  `BrowserManager.resolveMainWindowInitialPath` 以 `isRemoteServerConfigured &&
desktopOnboardingCompleted!==false` 决定首屏。
- E06：401 双端恢复**机制不同但部分等价**——renderer `lambda.ts` 在 Desktop 跳过；
  主进程 `BackendProxyProtocolManager` 仅对带 `X-Auth-Required` 的 401/403 广播
  `authorizationRequired` → `AuthRequiredModal` → `connectRemoteServer` 重认证。
  无该头的 renderer 401 在 Desktop 静默 —— 已核实为真实缺口（本伦补齐）。
- E07：`resolveExecutionTarget` 查看端默认 + hetero 隐式升级 + Web unbound-local→
  sandbox 回退，均属实。
- E08：`toolFilters` 直接 `isDesktop`；`skillFilters` 已有 `canExecuteOnDevice` 模式。
- E09：`heterogeneousAgentCatalogService`/`heteroAgentQuota`/`gitService`/
  `projectFileService` 均为 `deviceId ? device.* tRPC : electron IPC`；Web 无
  deviceId 时 IPC 抛出 `electronAPI.invoke not found`（非业务可读错误）。
- E10/E11：device router（capability/scan/git/files/quota/list/share）与服务端
  hetero ingest/finish/generation/admission 链路完整存在，可复用。
- `workspace.create`：stub 实现依赖 slug 唯一约束（CONFLICT），无 intent key 幂等；
  客户端仅内存 ref 防重。
- Desktop 主进程经 `GatewayConnectionSrv`/`GatewayConnectionCtr` 即 device-gateway
  客户端，`gatewayDeviceInfo.deviceId` 为本机设备身份；local hetero 会话
  （`heterogeneousAgentExecutor`）为 renderer 私有生命周期，无服务端准入 ——W2-E 缺口。

## 1. 已执行检查（随实施滚动更新）

| 命令                                                                                | 范围             | 退出码 | 结果                                                                                                                          |
| ----------------------------------------------------------------------------------- | ---------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `git rev-parse HEAD`                                                                | 基线核对         | 0      | `24d035c2fdeb…` = 方案基线                                                                                                    |
| `bun run check <executionTarget/dispatcher/lifecycle/gateway/topicExecutionConfig>` | 执行目标契约改动 | 0      | 44 文件 lint clean，991 测试通过                                                                                              |
| `bun run check <targetRequiredError + 5 服务接入>`                                  | 服务边界守卫     | 0      | 8 文件 lint clean，349 测试通过（16 个 TargetRequired 断言）                                                                  |
| `bun run check <Onboarding/DesktopOnboarding/router/BrowserManager>`                | onboarding 统一  | 0      | 12 文件 lint clean，109 测试通过                                                                                              |
| `bun run check <Settings/devices + OsPermissionsPanel>`                             | OS 权限迁移      | 0      | 2 文件 lint clean（无测试文件）                                                                                               |
| `bun run check <lambda.ts/SessionAuth/AuthRequiredModal/_layout>`                   | 401 统一事件     | 0      | 6 文件 lint clean，10 测试通过（401→session-auth-expired、market 隔离）                                                       |
| `bun run check <toolFilters/toolAvailability/3 个展示侧>`                           | 能力上下文       | 0      | 7 文件 lint clean，65 测试通过                                                                                                |
| `bun run check <workspace.ts/workspace.test.ts>`                                    | create 幂等恢复  | 0      | 2 文件 lint clean，9 测试通过（含 CONFLICT→复用 / 他人 slug 仍 CONFLICT）                                                     |
| `bun run check`（无参数，全改动面）                                                 | 收尾             | 0      | 55 文件 lint clean，566 测试通过；1 条 advisory（新增 .test.tsx）→ 已重构为 `redirectTarget.ts` 纯函数 + `.test.ts`，复跑通过 |

注：多轮测试输出中的 `ECONNREFUSED localhost:3000` 为环境噪音（无本地 dev server），相关用例均通过。

## 2. 未运行项（诚实标记）

- 真实浏览器 + 打包 Desktop 跨端验证（T01–T25 产品场景）：**未运行**—— 需要
  运行环境与设备网关，超出本会话；按方案属 W4 独立验收。
- Desktop 构建 / 打包（`apps/desktop` renderer+main 产物）：**未运行**。
- 服务端 `bun run dev` 全栈联调：**未运行**。
- `bun run check --type`（全仓 type-check）：**未运行**——CI-only，本地 fail-fast。

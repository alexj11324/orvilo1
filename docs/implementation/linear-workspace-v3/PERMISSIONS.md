# 权限矩阵（WM-01 冻结）

本矩阵是 WM-03（领域命令）、WM-04/05（同步）、WM-06/07（资源 / 关联）、
WM-08/09（编排 / 交付）共用的授权契约。任何列表、计数、搜索、通知、
缓存与模型上下文都按同一规则过滤。

## 角色

- **workspace owner / admin**：workspace\_members.role = owner/admin
- **workspace member**：普通成员
- **team lead**：team\_members.role = lead
- **agent**：执行主体（用户或共享 Agent），无独立 invite 权限
- **integration**：Linear 安装等服务身份

## 对象 × 动作

| 动作                                    | owner/admin                                                     | member                        | team lead                  | 备注                                     |
| --------------------------------------- | --------------------------------------------------------------- | ----------------------------- | -------------------------- | ---------------------------------------- |
| 创建 Team                               | ✅                                                              | ❌                            | —                          | 默认 Team 由系统建立                     |
| 归档 / 改名 / 改可见性 Team             | ✅                                                              | ❌                            | ✅（本 Team）              |                                          |
| 改 Team workflow/cycle/ 默认资源 / 政策 | ✅                                                              | ❌                            | ✅（本 Team）              |                                          |
| 增删 Team 成员、指定 lead               | ✅                                                              | ❌                            | ✅（本 Team，不可改 lead） |                                          |
| 读 Team（public）                       | ✅                                                              | ✅                            | ✅                         | private Team 仅成员                      |
| 创建 / 移动 Issue 进 Team               | ✅                                                              | ✅（member 且可见）           | ✅                         | 目标 Team 必须可见且可写                 |
| Issue 跨 Team 移动                      | ✅                                                              | 源 Team 可见 + 目标 Team 可写 | 同左                       | 核验目标 state/cycle                     |
| Project 关联 / 解除 Team                | ✅                                                              | 项目可写                      | —                          | 仅加关系，不复制项目                     |
| Project 发布到 Linear                   | ✅                                                              | 项目可写 + 发布授权           | —                          | `PUBLICATION_NOT_APPROVED` 结构化拒绝    |
| 注册本机 Checkout                       | 本人目录授权                                                    | 同左                          | —                          | 仅代码事实，不授执行                     |
| 应用 / 拒绝 / 撤销关联                  | 源对象可写                                                      | 同左                          | —                          | deterministic 可自动 applied             |
| 导入范围变更（scope）                   | ✅                                                              | ❌                            | —                          | scopeRevision 递增                       |
| 执行 run                                | grants ∩ workspace ∩ team/project/task 限制 ∩ provider 安装权限 |                               |                            | 项目默认值不得放宽上层禁止               |
| 重规划 scope                            | scope 所有者政策                                                |                               |                            | 人工锁 / 撤权 /outcome\_unknown 不被覆盖 |

## 可见性规则

1. `private` Team：仅该 Team 成员 + workspace admin 可见；其 Issue / 计数 / 搜索
   对外不泄露。
2. `private` task（workspace 内）：仅创建者可见；创建者离职不扩散。
3. Project 可见 ≠ 其参与 Team 的 Issue 全部可见 —— 各自权限独立过滤。
4. 来源私密 Team 无法等价还原权限时不导入敏感内容（隔离迁移队列）。
5. Checkout 的 `canonical_path` 绝不写入 Linear 描述或公开 payload。

## 迁移不变量

- 历史 personal task/project：`team_id = NULL`，可见性不变。
- 旧 binding 批准范围在迁移中不扩大。
- 安装者删除 / 撤职：共享内容保留（projects.user\_id 置空），其写授权单独撤销。

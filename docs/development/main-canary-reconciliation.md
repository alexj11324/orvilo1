# main /canary 对账记录

核查日期：2026-09-18。`canary` 是当前产品与生产代码线，`main` 是较旧的发布快照。

| 引用         | 核查提交                                                                          |
| ------------ | --------------------------------------------------------------------------------- |
| 共同祖先     | `e271ce94647f02428ec51a9a13da3e59203bf4e5`                                        |
| canary       | `d2c522fd8bf37448dccd86eacc6442a580d55cbd`                                        |
| main         | `855e6a508e99bb91ca4e9bc2b60ed4c33fd8faed`                                        |
| 缺失修复回补 | `400df0125ce9b74f0cef6376e46f8de4c897da92`（PR #89；原提交 `24ffeb74` rebase 后） |

直接试合并有 180 个冲突文件。对账采用当前 canary 的产品实现作为基准，
逐项移入 main 独有且仍适用的修复，保留 Linear、ACP、团队协作和已完成的功能移除。

## main 独有变更的处理

| 变更组                                                 | 处理与证据                                                                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sharp /protobuf/ Hatchet SDK 镜像修复（#27、#31、#35） | canary 的 `Dockerfile` 已使用对应 allow-build、外置 SDK 和 worker 打包方式；保留 canary 的 runtime 检查与回归用例。                                                         |
| Vercel 受信分支检查（#56）                             | canary 的两个检查入口已 checkout `github.event.repository.default_branch`；保留当前 canary / GHCR 发布模型。                                                                |
| S3 presign（#73）                                      | canary 已通过独立 `S3_PRESIGN_ENDPOINT` 为 `S3` 模块配置签名端点；保留其更完整的现有测试。                                                                                  |
| Hatchet 并发与旧消息迁移（#58）                        | PR #89 补入 canonical user lane、同 dispatch 串行与每用户并发门控；旧 memory 消息先重新入队再领取数据库任务。                                                               |
| Hatchet 取消结果（#58）                                | PR #89 补入 `cancelled` / `already-terminal` / `not-found`，让 provider 失败传播，并在 memory webhook 汇报部分失败；检查了当前 `userMemory.deleteAll` 消费者。              |
| Deferred replay 重试（#58）                            | PR #89 补入延迟解析和释放 worker slot 后等待的逻辑及回归用例。                                                                                                              |
| 全仓 branding（`ad9166d5`）                            | 保留 canary 已演进的实现，不用旧快照覆盖新功能、已移除目录或当前生成的 SDK。外部 npm API `LobeHubProps` / `LobeChatProps` 必须保持原名；canary 的 `fd9d8bf8` 已修正过误改。 |
| 功能 PR 文档门禁（#91、#92）                           | 两条线新增的 workflow、检查脚本、测试和分支模型文档完全一致；使用 canary 版本。                                                                                             |

## 保留项

- `triggerHatchetWorkflow` 的 `delayMs` 以及 Linear workflow /sweep。
- schedule 的 `tickToken` 和当前 task 执行逻辑。
- collaboration outbox、worker 和 task name 注册。
- 当前 memory extraction gate、ACP、团队协作、Linear 路由与迁移。
- canary 的生产部署、GHCR、E2E mock 配置和 Vercel 检查入口。

## 验证与边界

回补提交 `24ffeb74` 的远程 Typecheck、两个 Server shard、两个 App shard、Packages、
Desktop、Database、Windows Shell 和 Web E2E 已通过。独立复核没有发现阻塞问题。

本地 cancellation /memory webhook /userMemory 三组共 26 个用例通过。
另两组本地测试因共享 `node_modules` 从主工作树解析包、造成 alias 失败而未完成；
没有跳过断言或增加伪造业务结果的 mock。其验证由上述同一提交的远程 Server 测试覆盖。

本记录不是一次新的产品运行验收，也不表示已经发布新版本。

## 历史合并

完成独立语义复核后，以 `git merge -s ours --no-commit origin/main` 记录 main 的祖先关系。
合并前后除本对账文档外没有产品文件变化。此操作修复分支历史关系，不是把旧 main 的
产品树重新覆盖到 canary；有效修复已由上表对应实现和回补提交保留。

明确排除旧 main 的批量 branding 重写、已在 canary 退役的 eval /image/video /
community 页面，以及会覆盖当前 Linear、ACP、collaboration 和生成 SDK 的旧版本。
branding 提交中的有效 E2E `MARKET_BASE_URL` 设置已单独核查，canary 已包含。

两条主干在初次核查后新增的 #91 / #92 已重新逐文件比较，并确认实现一致。
若任一主干继续推进，需检查新增差异。
历史对齐 PR 必须保留 merge commit；squash 会丢失 main 的祖先关系。

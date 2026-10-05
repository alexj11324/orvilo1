# Orvilo 分支与发布模型

> 本文声明 Orvilo 的分支语义、发布流程与各分发通道的现状。
> 仓库级开发规范见 [`AGENTS.md`](../../AGENTS.md)，外部贡献者入口见
> [`CONTRIBUTING.md`](../../CONTRIBUTING.md)。

## 一句话模型

**`canary` 是开发主干，同时也是云端生产代码线；`main` 是周期性冻结出来的发布快照。**

两者都不是「环境」。环境由部署目标决定，不由分支决定 —— 同一条 `canary`
既承载日常开发，也是 `orvilo.aspectlylabs.com` 实际运行的代码。

## 两条长期分支

| 分支     | 语义                | 谁往里写                                   |
| -------- | ------------------- | ------------------------------------------ |
| `canary` | 开发主干 + 云端生产 | 日常开发通过 PR；发布工作流回同步，见下文  |
| `main`   | 发布快照            | 只接受来自 `release/*` 或 `hotfix/*` 的 PR |

**`main` 不是「生产环境」。** 它是发布基准线：打 tag、发 GitHub Release、
构建正式分发包，都以 `main` 上的某个 commit 为准。生产 Web 服务仍然跑
`canary`。

## 短生命周期分支

| 前缀                                | 从哪切   | 合到哪   | 用途                 |
| ----------------------------------- | -------- | -------- | -------------------- |
| `feat/*` `fix/*` `chore/*` `ci/*` … | `canary` | `canary` | 日常开发             |
| `release/*`                         | `canary` | `main`   | 冻结一个发布版本     |
| `hotfix/*`                          | `main`   | `main`   | 已发布版本的紧急修复 |

分支命名遵循 `<type>/<feature-name>`，commit message 以 gitmoji 开头。

## 主流程

```
feat/xxx ──PR──▶ canary ──────────────────────▶ 云端生产
                   │                            (orvilo.aspectlylabs.com)
                   │                            Desktop Canary 通道
                   │
                   │  bun run release:branch
                   ▼
              release/vX.Y.Z ──PR──▶ main
                                      │
                                      ├─▶ tag vX.Y.Z
                                      ├─▶ GitHub Release（正式版）
                                      ├─▶ Desktop Stable 通道
                                      └─▶ Docker latest
                                      │
                                      │  sync-main-to-canary（自动）
                                      ▼
                                   canary
```

## Release 流程

1. **冻结** —— 在本地跑 `bun run release:branch`（可带 `--patch` / `--minor` /
   `--major`；不带参数则交互式选择）。它会 fetch `origin/canary`、算出下一个
   版本号、从 `origin/canary` 切出 `release/vX.Y.Z`，并向 `main` 开一个标题为
   `🚀 release: vX.Y.Z` 的 PR。
2. **评审合并** —— 这个 PR 合并进 `main`。
3. **自动打标** —— `auto-tag-release.yml` 检测到这个 PR，bump `package.json`
   版本、生成 changelog、创建 tag `vX.Y.Z`、发布 GitHub Release。
4. **自动回同步** —— 打标完成后自动触发 `sync-main-to-canary.yaml`，把
   `main` 合回 `canary`，避免两条线长期分叉。

> **为什么必须回同步**：`main` 上的版本 bump 和 changelog 提交如果回不到
> `canary`，下一次 release 就会在旧版本号上再 bump 一次，且两条线会持续
> 分叉到无法自动合并。

> **工作流状态（2026-10-04 核查）**：Auto Tag Release 与 Branch Synchronization 已启用。同步工作流先尝试快进或合并写回；直接写回失败时创建同步 PR。启用状态不代表某一次同步已成功，应以该次 Actions 运行和两条分支的提交为准。

## Hotfix 流程

已发布版本出现必须立刻修的问题时：

1. 从 `main` 切 `hotfix/<描述>`。
2. 修复并提交。
3. 向 `main` 开 PR。合并后 `auto-tag-release.yml` 会走 **patch bump**
   路径（不需要改版本号，也不需要 `🚀 release:` 标题），自动打补丁版本 tag。
4. 回同步会自动把修复带回 `canary`。

## 版本号规则

- 根 `package.json` 的 `version` 是**发布版本的唯一来源**。
- `auto-tag-release.yml` 负责 bump 它，**不要手工改**。
- 正式版本：`vX.Y.Z`。预发布版本带后缀，如 `vX.Y.Z-canary.N`。
- 桌面应用版本由各 release workflow 从根版本派生，不单独维护。

## 分发通道现状

以下状态区分工作流启用、产物发布和产品验收；不能以构建成功代替安装或更新验证。

| 通道            | 触发                                            | 更新源 / 目标                                | 状态                                                         |
| --------------- | ----------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| Web 生产        | `push canary`                                   | GHCR → Oracle（`deploy-orvilo1.yml`）        | ✅ 运行中                                                    |
| Vercel Preview  | PR                                              | Vercel（`vercel-preview.yml`）               | ✅ 运行中                                                    |
| Vercel 分支部署 | `push canary` / `push main`，全部 CI 门禁通过后 | Vercel（`vercel-branch-deploy.yml`）         | ✅ 运行中                                                    |
| Test / E2E CI   | push + PR                                       | —                                            | ✅ 运行中                                                    |
| Desktop Canary  | `push canary` / 手动触发                        | GitHub prerelease；可配置更新服务器          | 工作流已启用，逐次核验产物                                   |
| Desktop Stable  | 正式 GitHub Release / 手动触发                  | GitHub Release；可配置更新服务器             | 已发布 v2.6.0；安装、公证与更新另行验收                      |
| Docker 镜像     | GitHub Release published                        | Docker Hub                                   | ⚠️ 待打通                                                    |
| npm 包          | `push canary`（SDK、model-bank）                | npm                                          | 按各包发布工作流核验，不代表 CLI 已在 npm 发布               |
| CLI             | 正式 GitHub Release                             | 同一个 Release 的 `orvilo-cli-<version>.tgz` | 安装指南只显示实际存在的资产；PR / 手动构建上传测试 artifact |

## Vercel 部署门禁

Vercel 的 Git 自动部署在 `vercel.json` 中已关闭，推送不会直接消耗一次 Vercel
构建额度。`vercel-preview.yml` 继续为 PR 创建 preview；`vercel-branch-deploy.yml`
只处理 `canary` 和 `main` 的推送，且只会在同一个 SHA 的 `Test CI`、`E2E CI`、
GitGuardian 及其他未忽略检查全部成功后创建部署。

创建部署前，workflow 会再次查询分支引用；若 CI 等待期间分支已推进，则拒绝部署旧
SHA。`canary` 创建 preview 部署，`main` 创建 Vercel production 部署。Vercel 的
production target 只描述该 Vercel 项目的别名，不改变上面的 Oracle 云端生产代码线。

桌面更新源由构建配置决定：设置 `UPDATE_SERVER_URL` 时使用对应通道的通用更新服务器；未设置时使用 `alexj11324/orvilo1` 的 GitHub Release。稳定版工作流同时支持 GitHub 资产和对象存储上传，不能把源码中的可选路径当作每个发行包的实际配置。

验证发行包时记录其中的 `app-update.yml`、通道与来源提交，并实测检查更新和安装。GitHub 匿名更新检查受 API 速率限制；通用更新服务器需要匹配的 manifest 和资产。

macOS 发布构建使用 App Store Connect API 凭据。上传之前必须通过签名、stapler 和 Gatekeeper 验证，缺少凭据或公证失败时不能悄悄发布未公证包。CLI 公开安装使用 GitHub 上的真实 tarball，更新命令也查询同一发行源。

## 保护规则

`canary` 与 `main` 由仓库 ruleset `trunk-branches` 保护（已启用）：

- 禁止直接 push，只能通过 PR。
- 禁止 force push（`non_fast_forward`）。
- 禁止删除分支（`deletion`）。
- PR 只要修改产品源代码，就必须同时修改 `docs/`；缺少文档更新时
  `Documentation Required` 检查失败，规则集会拒绝合并。产品源代码范围为
  `apps/`、`packages/`、`plugins/`、`src/`、`server/`、根目录的应用入口页及运行时配置，
  其中测试、fixture、mock 与 Markdown 文件不触发此要求。纯文档、CI、工具和测试改动可以
  单独合并。超出 GitHub 3,000 个文件 API 上限的 PR 会失败，直到拆分为可审计的改动。
- **不设必需批准数**：仓库只有一个 maintainer，而 GitHub 不允许自我批准，
  设成 1 会把所有人都锁死。

> **保护规则（2026-10-04 核查）**：日常开发继续通过 PR。当前规则集有仓库管理员和指定 Integration 的 bypass actor；发布工作流使用的身份是否能写回，必须由实际运行确认，不再将工作流声明为 disabled。不要为了发布临时关闭保护规则。

`trunk-branches` 把 `Documentation Required` 设为必需状态检查。该检查使用
`pull_request_target`，只读取 PR 的改动清单，并从受保护目标分支运行门禁脚本；
PR 不能通过修改自身的 workflow 或脚本绕过它。

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
| `canary` | 开发主干 + 云端生产 | 只接受 PR；回同步当前受阻，见「保护规则」  |
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
2. **准备和评审** —— 脚本在 release 分支提交版本与 changelog。评审补充提交后，
   在干净的 release 分支运行 `bun run release:branch --prepare` 并 push，
   重新生成发布文件，再将 PR 合并进 `main`。
3. **自动打标** —— `auto-tag-release.yml` 校验已提交的版本，在该 PR 的合并提交上
   创建 tag `vX.Y.Z`、发布 GitHub Release。它不修改 `main`。
4. **回同步 PR** —— 打标完成后触发 `sync-main-to-canary.yaml`，向 `canary`
   开同步 PR。冲突时保留真实的 main 内容并开草稿，不提交冲突标记，不自动合并。

> **为什么必须回同步**：`main` 上的版本 bump 和 changelog 提交如果回不到
> `canary`，下一次 release 就会在旧版本号上再 bump 一次，且两条线会持续
> 分叉到无法自动合并。

> **当前状态：回同步尚未生效。** `sync-main-to-canary.yaml` 处于 disabled
> 状态。PR #78 将写回改为走 PR；启用前仍需先合入相应代码并完成发布凭据配置。
> 不能把脚本和语法检查通过当作已经完成一次真实发布。

## Hotfix 流程

已发布版本出现必须立刻修的问题时：

1. 从 `main` 切 `hotfix/<描述>`。
2. 修复并提交。
3. 运行 `bun run hotfix:branch`，在分支上提交 patch 版本与 changelog，再向 `main` 开 PR。
   评审新增提交后运行 `bun run hotfix:branch --prepare` 并 push。
   合并后 `auto-tag-release.yml` 读取版本并打标。
4. 通过回同步 PR 将修复带回 `canary`。

## 版本号规则

- 根 `package.json` 的 `version` 是**发布版本的唯一来源**。
- release/hotfix 脚本在 PR 分支准备它；`auto-tag-release.yml` 只读取和校验，**不要手工改**。
- 正式版本：`vX.Y.Z`。预发布版本带后缀，如 `vX.Y.Z-canary.N`。
- 桌面应用版本由各 release workflow 从根版本派生，不单独维护。

## 分发通道现状

诚实记录：以下通道**代码已就绪，但依凭据与基础设施才能运行**。

| 通道           | 触发                                                   | 更新源 / 目标                         | 状态      |
| -------------- | ------------------------------------------------------ | ------------------------------------- | --------- |
| Web 生产       | `push canary`                                          | GHCR → Oracle（`deploy-orvilo1.yml`） | ✅ 运行中 |
| Vercel Preview | PR                                                     | Vercel（`vercel-preview.yml`）        | ✅ 运行中 |
| Test / E2E CI  | push + PR                                              | —                                     | ✅ 运行中 |
| Desktop Canary | `push canary`                                          | GitHub Release（prerelease）          | ⚠️ 待打通 |
| Desktop Stable | GitHub Release published                               | GitHub Release                        | ⚠️ 待打通 |
| Docker 镜像    | GitHub Release published                               | GHCR                                  | ⚠️ 待打通 |
| npm 包         | `push canary`（`packages/sdk`、`packages/model-bank`） | npm                                   | ⚠️ 待打通 |

桌面完整安装包的更新源为 **GitHub Release**。renderer OTA 使用独立的静态文件路径，
仍需对象存储或静态服务；不能仅删除 S3 job 就宣称保留了 OTA。

### 为什么桌面更新源用 GitHub Release

`electron-builder` 的 provider 与存储后端解耦，只认 URL 结构。选 GitHub
Release 的实际代价有三条，接受它们是因为省去了一整套对象存储与域名运维：

1. **速率限制** —— 更新检查走 GitHub API，客户端无法内置 token，因此按
   匿名请求计（60 次 / 小时 / IP）。同一出口 IP 下客户端数量大时会撞限流。
2. **通道能力弱** —— GitHub 只有 prerelease 这一个布尔维度，`stable` /
   `canary` 刚好用满，再要 `beta` / `nightly` 就需要换更新源。
3. **无自定义 CDN** —— 下载走 `objects.githubusercontent.com`，无法加速。

切换成本很低：provider 在构建时由 `UPDATE_SERVER_URL` 决定，将来换成对象
存储只需配置该变量。

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
  设成 1 会把所有人都锁死。必需 CI、严格的 `Required Quality Gate` 和 review
  线程解决要求仍保留。

> **为什么不给 GitHub Actions 开豁免**：个人账号的 repository ruleset
> 不支持把 GitHub Actions 加入 bypass list —— API 直接拒绝：
> `Actor GitHub Actions integration must be part of the ruleset source or
owner organization`。该能力只对 organization 级 ruleset 开放。
>
> 因此版本提交必须通过 release/hotfix PR 进入 main，回同步也必须通过 PR。
> 两个 workflow 当前仍 disabled，启用必须以实查状态与已合入代码为准。

`trunk-branches` 把 `Documentation Required` 设为必需状态检查。该检查使用
`pull_request_target`，只读取 PR 的改动清单，并从受保护目标分支运行门禁脚本；
PR 不能通过修改自身的 workflow 或脚本绕过它。

`Required Quality Gate` 的实现由 PR #82 提供；在它合并前，已启用的保护规则会
阻止没有该检查的 PR 合并。不要通过降级保护规则绕过这个依赖。

发布 tag 与 GitHub Release 使用 `GH_TOKEN`（PAT 或 GitHub App token），以触发下游
发布工作流。回同步可以使用内置 `GITHUB_TOKEN`，但它创建的 PR 工作流需要维护者
批准运行；检查通过后才可合并。见 [GitHub 的触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。

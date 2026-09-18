# 发布链路改造 — 交接说明

交接时间：2026-09-18・基线 `canary` = PR #75 合并后・相关 PR：**#78**

## 一句话现状

LobeHub 式发布体系在这个仓库里**代码齐全，但 39 个 workflow 中有 33 个是 `disabled_manually`**，
停用原因是缺凭据。**发布链路本身（打标 / 回同步 / Docker）已经打通并适配了分支保护**；
剩下的工作是**桌面通道**—— 去掉用不上的依赖，再补两个只有人能提供的 secret。

## 一、已完成（不要重做）

| 项                                               | 位置                                         | 验证方式                                                                           |
| ------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| 分支模型文档                                     | `docs/development/branch-model.md`           | —                                                                                  |
| ruleset `trunk-branches`（canary + main 禁直推） | GitHub 仓库设置                              | `gh api repos/alexj11324/orvilo1/rules/branches/canary --jq '.[].type'` → 3 条规则 |
| release 入口修复（`dev`→`canary`，改为只读 ref） | `scripts/releaseWorkflow/index.ts`           | `bun run release:branch --patch` 能跑到确认提示                                    |
| 版本 bump 前置到 release 分支                    | 同上，`prepareReleaseCommit()`               | —                                                                                  |
| `auto-tag` 不再 push main，只打标                | `.github/workflows/auto-tag-release.yml`     | `bunx vitest run tests/github-scripts/`                                            |
| 回同步总是走 PR                                  | `.github/workflows/sync-main-to-canary.yaml` | actionlint                                                                         |
| Docker 发布迁 GHCR                               | `.github/workflows/release-docker.yml`       | `grep DOCKER_REGISTRY .github/` 应只剩注释                                         |
| 凭据清单                                         | `docs/development/release-credentials.md`    | —                                                                                  |

**已配置的 secrets**（不要再让用户配这些）：
`APPLE_TEAM_ID` · `APPLE_CERTIFICATE_BASE64` · `APPLE_CERTIFICATE_PASSWORD` ·
`RENDERER_OTA_PRIVATE_KEY` · `RENDERER_OTA_PUBLIC_KEY`

GSM 备份：`orvilo-apple-developer-id-p12`、`orvilo-apple-developer-id-password`、
`orvilo-renderer-ota-private-key`（项目 `general-secrets-store`）。

## 二、剩余工作

### 任务 1（最高优先）—— 桌面通道：安装包走 GitHub Release，但 renderer OTA 仍需一个静态服务

> ⚠️ **这一节初稿写错了，以下是更正后的版本。** 初稿说「删掉 S3 job 即可」，那是错的 ——
> 它会连带杀掉 renderer OTA。动手前务必读完本节。

**桌面有两套完全独立的更新机制，别把它们混为一谈。**

|                             | 安装包更新                                                  | renderer OTA                                                                                 |
| --------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 实现                        | `electron-updater`                                          | **自定义**，`apps/desktop/src/main/core/infrastructure/rendererOta/RendererUpdateManager.ts` |
| 选源方式                    | `electron-builder.mjs` 按 `UPDATE_SERVER_URL` 决定 provider | **硬依赖 `UPDATE_SERVER_URL`**                                                               |
| 留空 `UPDATE_SERVER_URL` 时 | 回退到 **github provider**（= GitHub Release）✅            | `RendererUpdateManager.ts:92` → `missing-server-url`，**整个功能不可用** ❌                  |

证据：

```ts
// RendererUpdateManager.ts:381
return `${UPDATE_SERVER_BASE_URL}/${channel}/${APP_VERSION}/renderer/v2`;

// :92
!UPDATE_SERVER_URL && 'missing-server-url',
```

`${channel}/${version}/renderer/v2` 这种路径结构 GitHub Release 提供不了，所以
**「更新源改用 GitHub Release」这个决定只覆盖安装包，不覆盖 renderer OTA。**

**所以真正要做的拆分**：

1. **安装包更新** → 让它走 GitHub Release：**不配 `UPDATE_SERVER_URL` 即可**
   （`electron-builder.mjs:88-118` 无该变量时回退 github provider）。这部分不用改代码。

2. **renderer OTA** → 仍需要一个静态文件服务。选项：
   - **Cloudflare R2**：S3 兼容，`desktop-publish-s3` action 的 `s3-endpoint` 输入描述里
     本来就写着 "for R2/MinIO etc."，**代码零改动**，且 egress 免费
   - 或保留现有 S3
   - 或自建（Oracle + nginx）

3. **如果暂时不做 renderer OTA**，才轮到「删 S3 job」—— 但要**连 renderer 相关的 job 一起禁**，
   不能只删 `publish-s3`。

**当前必然失败的点和位置**：

```yaml
# release-desktop-stable.yml:421（canary 在 475 附近）
publish-s3:
  if: ${{ !(github.event_name == 'workflow_dispatch' && inputs.skip_s3_upload) }}
```

这个 `if` 只检查手动触发的 skip 开关。手动触发时 `skip_s3_upload` 默认 `true` 能跳过；
但 `release: published` 触发时条件为真，**S3 步骤会执行**，而 `UPDATE_S3_*` 不存在 → 失败。

**S3 相关 job 的实际分布（与初稿不同，已核实）**：

| 文件                         | job                   | 行      | 说明                                                                       |
| ---------------------------- | --------------------- | ------- | -------------------------------------------------------------------------- |
| `release-desktop-stable.yml` | `publish-s3`          | **416** | 安装包 + 更新清单                                                          |
| `release-desktop-stable.yml` | `renderer-ota`        | **140** | 复用 `release-desktop-renderer-ota.yml`，其 `if` 同样引用 `skip_s3_upload` |
| `release-desktop-canary.yml` | `publish-s3`          | **475** | 另有第二组 S3 输入在 549-553                                               |
| `release-desktop-beta.yml`   | **没有 `publish-s3`** | —       | 只有 `publish-renderer-base`（306），带 `upload-release-files: false`      |

⚠️ **动手前先摸清依赖图**，别按 job 名猜：

```bash
grep -n "publish-s3\|renderer-ota\|publish-renderer-base\|skip_s3_upload" \
  .github/workflows/release-desktop-*.yml
```

**验证**：改完跑 `actionlint`；再 `gh workflow run` 手动触发一次
（`skip_s3_upload` 保持默认 `true`），确认 job 列表符合预期。

### 任务 2 —— 桌面通道的 Umami 埋点（可选）

`UMAMI_{STABLE,BETA,NIGHTLY}_DESKTOP_{BASE_URL,PROJECT_ID}` 共 6 个 secret，注入构建。
**如果暂时不做埋点**，让它们保持为空即可 —— 值是构建期注入的环境变量，缺失只是不发埋点，不会失败。

**不要**为了消除警告去删这些行；`NEXT_PUBLIC_*` 为空在 Next.js 里是合法配置。

### 任务 3 —— 启用 workflow

**前提：任务 1 完成且 PR 已合并。** `gh workflow enable <file>` 启用的是**默认分支上的版本**，
在合并前启用等于启用旧代码。

按凭据齐备度排序（用下面这条命令重新核对，**注意脚本要在 bash 下跑**，见「坑 4」）：

```bash
bash -c 'HAVE="APPLE_TEAM_ID APPLE_CERTIFICATE_BASE64 APPLE_CERTIFICATE_PASSWORD RENDERER_OTA_PRIVATE_KEY RENDERER_OTA_PUBLIC_KEY ORACLE_HOST ORACLE_SSH_KEY ORACLE_SSH_KNOWN_HOSTS VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID VERCEL_AUTOMATION_BYPASS_SECRET GITHUB_TOKEN"
for f in $(gh workflow list --all --limit 100 --json path,state --jq ".[] | select(.state==\"disabled_manually\") | .path" | grep "^\.github/workflows/"); do
  [ -f "$f" ] || continue
  missing=""
  while IFS= read -r s; do [ -z "$s" ] && continue
    case " $HAVE " in *" $s "*) ;; *) missing="$missing $s" ;; esac
  done <<< "$(grep -oE "secrets\.[A-Za-z_0-9]+" "$f" | sed "s/secrets\.//" | sort -u)"
  [ -z "$missing" ] && echo "READY  $(basename $f)" || echo "BLOCK  $(basename $f) →$missing"
done'
```

当前 READY 的：`auto-tag-release`、`sync-main-to-canary`、`release-docker`、
`fts-search-mapping-history`、`lock-closed-issues`。
**注意** `lighthouse.yml` 会误报为 READY —— 它用 `secrets[env.TOKEN_NAME]` **动态索引**，
静态 grep 抓不到，它实际需要 `GH_TOKEN`。

### 任务 4 —— canary ↔ main 冲突对账（大工程，需产品决策）

两条线分叉：canary 领先 main 221 commit，main 领先 canary 29，
`git merge-tree` 试算 **179 个冲突文件**。两边各自独立做了 branding 清除、S3 presign 修复等
（canary 走 PR #52，main 走 PR #73）。

**这不是机械合并**—— 需要判断「哪边的实现是想要的」。**不要**在没搞清语义前批量解冲突。

现状：`sync-main-to-canary` 已改造为总是开 PR，所以这条债务不会被自动合并掩盖。

## 三、必须知道的坑（都实际踩过）

1. **个人账号的 repository ruleset 无法给 GitHub Actions 开 bypass**。API 报
   `Actor GitHub Actions integration must be part of the ruleset source or owner organization`，
   该能力只对 org 级开放。所以任何靠直接 push 的 workflow 都必须改造成走 PR。

2. **`security export -t identities` 会导出整个 Keychain 的所有私钥**，不理会你传的 certFile 参数。
   实测导出的 p12 含 5 个身份（含 ExpressVPN 客户端证书和邮件证书的私钥）。
   正确做法是按**公钥指纹**提取。详见 `docs/development/release-credentials.md`。
   另外它用 RC2-40-CBC 加密，**OpenSSL 3 默认拒绝**，校验要用 `/usr/bin/openssl`（LibreSSL）。

3. **`git push --dry-run` 不能验证 ruleset** —— 它不走服务端规则检查。
   实测 dry-run 下 force push 报 "would succeed"，而规则实际禁止它。
   验证要用 `gh api repos/{owner}/{repo}/rules/branches/{branch}`。

4. **zsh 不对 `$var` 做 word splitting**，与 bash 不同。`for s in $need` 在 zsh 下
   只迭代一次（整个多行串当一个元素），会让比较逻辑**恒判成功**。
   写 shell 循环一律用 `while IFS= read -r`，或显式 `bash -c`。

5. **actionlint 和 lint 看不见「有测试断言 workflow 结构」**。
   `tests/github-scripts/releaseSyncWorkflow.test.ts` **按 step 名**定位
   `auto-tag-release.yml` 里的 dispatch 步骤。改 step 名会破坏它。
   改 workflow 前先 `grep -rln "<文件名>" tests/`。

6. **`gh workflow list` 反映的是默认分支（main）上的文件**，且会把**文件已删除但记录仍在**
   的历史 workflow 一并列出（显示 61 条 ≠ 39 个文件）。

## 四、验证命令速查

```bash
# workflow 语法/语义（Homebrew 安装，全局可用）
actionlint

# 断言 workflow 结构的测试（改了 workflow 就要跑）
bunx vitest run tests/github-scripts/

# release 脚本（不会改工作树状态，可安全跑到确认提示）
bun run release:branch --patch

# 分支保护是否生效
gh api repos/alexj11324/orvilo1/rules/branches/canary --jq '.[].type'

# 本仓库的 secrets
gh secret list --repo alexj11324/orvilo1
```

## 五、仍然需要人（不是 Codex 能代劳的）

- `APPLE_ID` —— Apple 账号邮箱
- `APPLE_APP_SPECIFIC_PASSWORD` —— 在 <https://appleid.apple.com> 生成，不是账号密码

没有这两个，macOS 包能签名但**无法公证**，用户下载会看到「无法验证开发者」。

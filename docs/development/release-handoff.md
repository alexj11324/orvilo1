# 发布链路改造 — 交接说明

交接时间：2026-09-18・基线 `canary` = PR #75 合并后・相关 PR：**#78**

## 一句话现状

LobeHub 式发布体系在这个仓库里**代码齐全，但 39 个 workflow 中有 33 个是 `disabled_manually`**，
停用原因包括缺凭据。**PR #78 正在修复打标 / 回同步 / Docker 的代码路径，尚未完成真实发布验证**。
接手复核发现 hotfix 未提交版本、脏工作树可能被带入、内置 token 抑制下游发布、
以及同步脚本提交冲突标记的问题；以修复后的测试和实际运行结果为准。

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
`RENDERER_OTA_PRIVATE_KEY` · `RENDERER_OTA_PUBLIC_KEY` · `GH_TOKEN`

`GH_TOKEN` 已于 2026-09-18 保存为本仓库 Actions secret，使用仅限
`alexj11324/orvilo1` 的 fine-grained PAT：Contents 读写、Metadata 只读，
到期日为 2026-10-18。尚未通过真实发布验证下游事件；到期前需要续期或替换。

GSM 备份：`orvilo-apple-developer-id-p12`、`orvilo-apple-developer-id-password`、
`orvilo-renderer-ota-private-key`（项目 `general-secrets-store`）。

## 二、剩余工作

### 任务 1 —— 桌面安装包与 renderer OTA

接手后代码已拆分，仍需真实发布验收：

- **安装包更新**：stable /beta/canary 官方构建不设置 `UPDATE_SERVER_URL`，
  electron-builder 使用 `alexj11324/orvilo1` 的 GitHub Release provider。
- **renderer OTA**：使用独立 `RENDERER_OTA_SERVER_URL`；运行时保留对旧
  `UPDATE_SERVER_URL` 的回退。安装包不再上传 S3，但 renderer 基线和补丁仍上传。
- **独立构建**：不配置 Cloud overlay 时使用本仓库；只配置 overlay token 或仓库之一时明确失败。
- **公证**：受信的发布和手动构建支持 Team ASC API Key，临时私钥权限为 0600，构建后清理。
  PR 自动构建不注入新增的公证私钥。

计划使用现有 Oracle RustFS 的独立 `orvilo-desktop-updates` 桶。
`RENDERER_OTA_SERVER_URL` 计划为 `https://rustfs.aspectlylabs.com/orvilo-desktop-updates`。
**该桶、发布用户和新 GitHub Secrets 尚未创建**，相关授权仍待维护者确认。

已完成代码级验证：发布工作流 / 脚本 19 个定向测试，桌面 OTA 集成 21 个测试，
以及作用域内 lint、格式和 actionlint。完整安装包构建、公证和真实 OTA 更新尚未验收。

### 任务 2 —— 桌面通道的 Umami 埋点（可选）

`UMAMI_{STABLE,BETA,NIGHTLY}_DESKTOP_{BASE_URL,PROJECT_ID}` 共 6 个 secret，注入构建。
**如果暂时不做埋点**，让它们保持为空即可 —— 值是构建期注入的环境变量，缺失只是不发埋点，不会失败。

**不要**为了消除警告去删这些行；`NEXT_PUBLIC_*` 为空在 Next.js 里是合法配置。

### 任务 3 —— 启用 workflow

**前提：任务 1 完成，且修复代码已通过 release PR 进入默认分支 `main`。** `gh workflow enable <file>` 启用的是**默认分支上的版本**，
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

该扫描只检查 secret 名称，不能判定真实就绪。`auto-tag-release` 还需要能触发下游事件的
`GH_TOKEN`；`sync-main-to-canary` 创建的 PR 仍需批准 CI、解决冲突并通过保护规则。
`release-docker` 使用内置 token 登录 GHCR，但仍需实际构建和发布验证。
`fts-search-mapping-history`、`lock-closed-issues` 不属于恢复发布链路的必要步骤。
**注意** `lighthouse.yml` 会误报为 READY —— 它用 `secrets[env.TOKEN_NAME]` **动态索引**，
静态 grep 抓不到，它实际需要 `GH_TOKEN`。

### 任务 4 —— canary ↔ main 冲突对账

2026-09-18 接手时实查两条线分叉：canary 领先 main 230 commit，main 领先 canary 29，
`git merge-tree` 试算 **180 个冲突文件**。两边各自独立做了 branding 清除、S3 presign 修复等
（canary 走 PR #52，main 走 PR #73）。

逐项对账与独立复核已完成，结果在 [PR #89](https://github.com/alexj11324/orvilo1/pull/89)。
它保留当前 canary 产品实现，补回 main 独有的 Hatchet 并发、取消与 deferred replay 修复，
再记录 main 的祖先关系。对账文档列出旧 branding 与已退役页面的排除理由。
PR #89 必须保留 merge commit，不能 squash；当前仍为草稿，实际运行证据仍待补足。

现状：`sync-main-to-canary` 通过 PR 同步。冲突时中止合并，将 main 的真实内容作为
草稿 PR 分支；不能把冲突标记提交成一个看起来已完成的 merge commit。

质量门禁实现由 PR #82 提供。2026-09-18 重新读取 ruleset 时，
必需检查列表已被并行变更更新为仅 `Documentation Required`，尚无 `Required Quality Gate`。
不能把规则允许合并等同于测试通过；交付仍需检查当前提交的实际 CI，
并在 #82 合入后更新基线。维护者已授权取消无法满足的他人批准要求。

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

# 评审新增提交后，在干净的对应分支重新生成并提交发布文件，然后 push
bun run release:branch --prepare
bun run hotfix:branch --prepare

# 分支保护是否生效
gh api repos/alexj11324/orvilo1/rules/branches/canary --jq '.[].type'

# 本仓库的 secrets
gh secret list --repo alexj11324/orvilo1
```

## 五、待授权与发布前提

- OTA：准备复用 Oracle RustFS 的独立 `orvilo-desktop-updates` 桶，仅公开桌面更新文件。
  新发布用户只获得该桶的权限；原有共享桶不变。建桶和将凭据保存到 GSM / GitHub Secrets 待授权。
- 公证：本机现有 Team ASC API 私钥已通过 `notarytool history` 认证验证。
  将该私钥保存到 Orvilo CI 的 GSM / GitHub Secrets 待授权。该路径不需要 Apple 应用专用密码。
- `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` 是另一种认证方式，可在不采用 API Key 时配置。
- 合并仍需 `Required Quality Gate`、最新基线及所有 review 线程解决。

只有完成真实 macOS 构建、Apple 公证、安装包与 OTA 下载验证后，才能把桌面发布标为完成。

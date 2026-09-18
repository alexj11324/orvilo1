# 发布凭据清单

各分发通道要真正跑起来需要哪些凭据、当前处于什么状态、以及缺的那些怎么获得。

> 背景：`.github/workflows/` 里 39 个文件中，33 个是 `disabled_manually`。
> 它们被停用的直接原因是凭据缺失（`deploy-orvilo1.yml` 头部注释写明了这一点）。
> 这份清单是恢复它们的施工图。

## 一、已配置

| Secret                                                      | 用途              | 备注                                  |
| ----------------------------------------------------------- | ----------------- | ------------------------------------- |
| `APPLE_TEAM_ID`                                             | `72UN4PF4BL`      | 从证书的 OU 字段读出，两个证书一致    |
| `RENDERER_OTA_PRIVATE_KEY`                                  | renderer OTA 签名 | **Ed25519 / PEM**，见下方「OTA 密钥」 |
| `RENDERER_OTA_PUBLIC_KEY`                                   | 客户端验签        | 同一密钥对的公钥                      |
| `ORACLE_HOST` / `ORACLE_SSH_KEY` / `ORACLE_SSH_KNOWN_HOSTS` | 生产部署          | 已验证可用（部署管线在跑）            |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`      | Vercel preview    | 已验证可用                            |
| `PREVIEW_*`                                                 | Preview 数据库    | 已验证可用                            |
| `VERCEL_AUTOMATION_BYPASS_SECRET`                           | 绕过 Vercel 保护  | —                                     |

## 二、仍需提供

按「获取难度」排序。

### 1. Apple 代码签名证书（解锁 macOS 分发）

| Secret                       | 值                                                  |
| ---------------------------- | --------------------------------------------------- |
| `APPLE_CERTIFICATE_BASE64`   | Developer ID Application 证书的 `.p12`，base64 编码 |
| `APPLE_CERTIFICATE_PASSWORD` | 导出 `.p12` 时你设置的密码                          |

**为什么不能自动导出**：`security export` 需要 Keychain 的私钥授权，非交互环境拿不到 —— 实测报
`security: SecKeychainItemExport: User canceled the operation.`（弹窗无法点击，系统记为「取消」）。
这是正确设计：私钥导出本就该有人确认。

**导出（命令行，会弹一次授权窗口）**：

```bash
security export -t identities -f pkcs12 \
  -P '<你自己设的密码>' \
  -o ~/Desktop/orvilo-devid.p12 \
  <(security find-certificate -c "Developer ID Application" -p)
```

或者用 GUI：Keychain Access → 找到 `Developer ID Application: Alex Jiang (72UN4PF4BL)` → 右键 Export。

**上传**：

```bash
base64 -i ~/Desktop/orvilo-devid.p12 | gh secret set APPLE_CERTIFICATE_BASE64 --repo alexj11324/orvilo1
gh secret set APPLE_CERTIFICATE_PASSWORD --repo alexj11324/orvilo1
/bin/rm ~/Desktop/orvilo-devid.p12
```

> 证书有效期到 **2031-08-29**，五年内无需轮换。

### 2. Notarization（公证）

| Secret                        | 值                                        |
| ----------------------------- | ----------------------------------------- |
| `APPLE_ID`                    | 你的 Apple 账号邮箱                       |
| `APPLE_APP_SPECIFIC_PASSWORD` | 在 appleid.apple.com 生成（不是账号密码） |

> 另一条路是 App Store Connect API Key（Issuer ID + Key ID + `.p8`）。
> GSM 里的 `contextfocus-attune-mac-testflight-signing-env` 有 `ASC_ISSUER_ID` / `ASC_KEY_ID`，
> 但那是 **App Store 分发**路线（`APP_DISTRIBUTION` / `APP_STORE_PROFILE`），且**不含 `.p8` 私钥**，
> 对 Developer ID 分发不适用。所以走 Apple ID + app-specific password。

### 3. npm 包发布

| Secret      | 值                          |
| ----------- | --------------------------- |
| `NPM_TOKEN` | npm 账号的 automation token |

影响 `release-sdk.yml` 与 `release-model-bank.yml`（`packages/sdk`、`packages/model-bank`）。
**如果你不打算发布这两个包，可以保持停用** —— 它们与 Web/Desktop/Docker 发布无关。

### 4. `GH_TOKEN`（可选）

13 个 workflow 引用它，但**没有一个 active**。

- `auto-tag-release.yml` 与 `sync-main-to-canary.yaml` **已改造为不再需要它**（用内置 `GITHUB_TOKEN`，
  因为 tag 和非保护分支不受 ruleset 约束）
- 仍然需要的是：`auto-i18n`、`claude-*` 系列、`issue-auto-*`、`mcp-submission-handler`、
  `release.yml`、`release-desktop-canary.yml`

**建议**：等你确实要启用这些自动化时再创建，不必现在配。

### 5. 其他（仅当要启用对应通道）

| Secret                                                      | 影响的 workflow             |
| ----------------------------------------------------------- | --------------------------- |
| `OPENAI_API_KEY` / `OPENAI_PROXY_URL`                       | `auto-i18n.yml`（每日翻译） |
| `CLAUDE_CODE_OAUTH_TOKEN`                                   | 12 个 `claude-*.yml`        |
| `UMAMI_{STABLE,BETA,NIGHTLY}_DESKTOP_{BASE_URL,PROJECT_ID}` | 桌面端埋点                  |
| `ASSET_S3_*` / `CLOUDFLARE_API_TOKEN`                       | `deploy-workbench.yml`      |
| `KEY_VAULTS_SECRET`                                         | `bundle-analyzer.yml`       |

## 三、OTA 密钥（已配置，但有约束）

已生成并配置了一对 **Ed25519** 密钥。算法与格式由代码决定，不是任选的：

```
apps/desktop/scripts/buildRendererManifest.mjs:67
  sign(null, Buffer.from(canonicalJson(manifest)), privateKeyPem)
```

`sign(null, ...)` 的 `null` 算法是 Ed25519 的标志（Node 对 Ed25519/Ed448 要求 algorithm 为 null），
密钥为 **PEM**。

生成方式（可复现）：

```bash
openssl genpkey -algorithm ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem
```

私钥已备份到 GSM：`orvilo-renderer-ota-private-key`（项目 `general-secrets-store`）。

> **⚠️ 这个密钥对在第一次发布后不可更换。** 公钥会被编译进客户端
> （`RendererUpdateManager.ts:45` 读 `process.env.RENDERER_OTA_PUBLIC_KEY`），
> 换私钥等于所有已安装的客户端再也收不到 OTA。
>
> 当前安全：Orvilo 桌面版**从未发布过**（`release-desktop-*` 全部是 0 次运行），
> 所以还没有客户端内置这把公钥。第一次正式发布后就必须妥善保管。

## 四、不需要凭据的（已可工作）

| 项                  | 说明                                             |
| ------------------- | ------------------------------------------------ |
| Docker 发布         | 已从 Docker Hub 迁到 GHCR，用内置 `GITHUB_TOKEN` |
| 打 tag / 建 Release | tag 不受 branch ruleset 约束，内置 token 足够    |
| 回同步 PR           | 推的是非保护分支（`sync/main-to-canary-*`）      |

# 发布凭据清单

各分发通道要真正跑起来需要哪些凭据、当前处于什么状态、以及缺的那些怎么获得。

> 背景：`.github/workflows/` 里 39 个文件中，33 个是 `disabled_manually`。
> 它们被停用的直接原因是凭据缺失（`deploy-orvilo1.yml` 头部注释写明了这一点）。
> 这份清单是恢复它们的施工图。

## 一、已配置

| Secret                                                      | 用途                                      | 备注                                          |
| ----------------------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| `APPLE_TEAM_ID`                                             | `72UN4PF4BL`                              | 从证书的 OU 字段读出，两个证书一致            |
| `RENDERER_OTA_PRIVATE_KEY`                                  | renderer OTA 签名                         | **Ed25519 / PEM**，见下方「OTA 密钥」         |
| `RENDERER_OTA_PUBLIC_KEY`                                   | 客户端验签                                | 同一密钥对的公钥                              |
| `ORACLE_HOST` / `ORACLE_SSH_KEY` / `ORACLE_SSH_KNOWN_HOSTS` | 生产部署                                  | 已验证可用（部署管线在跑）                    |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`      | Vercel preview                            | 已验证可用                                    |
| `PREVIEW_*`                                                 | Preview 数据库                            | 已验证可用                                    |
| `VERCEL_AUTOMATION_BYPASS_SECRET`                           | 绕过 Vercel 保护                          | —                                             |
| `APPLE_CERTIFICATE_BASE64`                                  | Developer ID Application `.p12`（base64） | **仅含该证书**，导出方法见下                  |
| `APPLE_CERTIFICATE_PASSWORD`                                | 上述 `.p12` 的密码                        | GSM 备份 `orvilo-apple-developer-id-password` |

### ⚠️ Apple 证书的导出方式（照抄网上常见写法会泄露私钥）

**`security export -t identities` 不理会你传入的 certFile 参数** —— 它把 Keychain 里
**所有**带私钥的身份一起打进同一个 `.p12`。实测导出的文件里有 **5 个身份**：

```
[0] ExpressVPN Client                                    ← 无关，含私钥
[1] Apple Development: Alex Jiang (FW25BG3MY2)           ← 无关
[2] Developer ID Application: Alex Jiang (72UN4PF4BL)    ← 要的是这个
[3] Alex Jiang (zhixuanj@andrew.cmu.edu)                 ← 邮件证书，含私钥
[4] Zhixuan Jiang (zhixuanj@andrew.cmu.edu)              ← 邮件证书，含私钥
```

直接把它 base64 上传到 GitHub Secrets，等于**把 ExpressVPN 客户端证书和邮件证书的私钥一并交出**。
必须导出后按**公钥指纹**提取，只重新打包需要的那一对。

另一个坑：`security export` 用 **RC2-40-CBC** 加密，**OpenSSL 3 默认不认**（报
`Algorithm (RC2-40-CBC : 0) unsupported`）。校验要用系统的 `/usr/bin/openssl`（LibreSSL）。
这不影响 CI —— 构建跑在 macOS runner 上，`security import` 原生支持该格式。

```bash
PASS='自己设一个强密码'

# 1. 导出（会弹一次授权窗口，点「允许」）
security find-certificate -c "Developer ID Application" -p > /tmp/ok-cert.pem
security export -t identities -f pkcs12 -P "$PASS" -o /tmp/all.p12 /tmp/ok-cert.pem

# 2. 解出所有私钥，按公钥指纹找出与目标证书配对的那一把
/usr/bin/openssl pkcs12 -in /tmp/all.p12 -passin pass:"$PASS" -nodes -out /tmp/all.pem
awk 'BEGIN{n=0;f=""} /-----BEGIN PRIVATE KEY-----/{n++; f="/tmp/k-"n".pem"} f{print > f} /-----END PRIVATE KEY-----/{f=""}' /tmp/all.pem
CERT_FP=$(/usr/bin/openssl x509 -in /tmp/ok-cert.pem -noout -pubkey | /usr/bin/openssl pkey -pubin -outform der | shasum -a 256 | cut -d' ' -f1)
for k in /tmp/k-*.pem; do
  [ "$(/usr/bin/openssl pkey -in "$k" -pubout -outform der | shasum -a 256 | cut -d' ' -f1)" = "$CERT_FP" ] && MATCH="$k"
done

# 3. 只重新打包这一对
/usr/bin/openssl pkcs12 -export -inkey "$MATCH" -in /tmp/ok-cert.pem -out /tmp/only.p12 -passout pass:"$PASS"

# 4. 断言确实只有 1 证书 1 私钥 —— 这一步不能省
/usr/bin/openssl pkcs12 -in /tmp/only.p12 -passin pass:"$PASS" -nokeys 2> /dev/null | grep -c 'BEGIN CERTIFICATE'         # 期望 1
/usr/bin/openssl pkcs12 -in /tmp/only.p12 -passin pass:"$PASS" -nocerts -nodes 2> /dev/null | grep -c 'BEGIN PRIVATE KEY' # 期望 1

# 5. 上传，然后立刻清理（中间文件含无关私钥）
base64 -i /tmp/only.p12 | gh secret set APPLE_CERTIFICATE_BASE64 --repo alexj11324/orvilo1
gh secret set APPLE_CERTIFICATE_PASSWORD --repo alexj11324/orvilo1 <<< "$PASS"
/bin/rm -f /tmp/all.p12 /tmp/all.pem /tmp/k-*.pem /tmp/only.p12 /tmp/ok-cert.pem
```

> 交互式导出私钥必须有人的授权确认 —— 非交互环境会得到
> `security: SecKeychainItemExport: User canceled the operation.`
>
> 证书有效期到 **2031-08-29**，五年内无需轮换。

## 二、仍需提供

按「获取难度」排序。

### 1. Notarization（公证，已配置）

| Secret                 | 用途                                       |
| ---------------------- | ------------------------------------------ |
| `APPLE_API_KEY_BASE64` | Team App Store Connect `.p8` 私钥的 base64 |
| `APPLE_API_KEY_ID`     | 与该私钥匹配的 Key ID                      |
| `APPLE_API_ISSUER`     | Team Issuer ID                             |

已采用 **Team App Store Connect API Key**（Issuer ID + Key ID + `.p8`），
它同样支持 Developer ID 公证。不要将证书分发类型与公证 API 的认证方式混为一谈。
见 [Apple TN3147](https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool)。

2026-09-18 经维护者明确授权，将匹配的现有本机 `.p8` 与两个 ID 保存到
GSM 项目 `general-secrets-store` 的 `orvilo-apple-notary-api-key`，
并写入本仓库上述三项 Actions Secrets。GSM 备份为以三项 Secret 名称为键的 JSON。
从 GSM 恢复出的私钥再次通过 `notarytool history` 认证，临时文件已清理。

无需再配置 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD`。
当前验证证明凭据可用；完整安装包提交公证和下载验收仍待真实发布完成。

### 2. npm 包发布

| Secret      | 值                          |
| ----------- | --------------------------- |
| `NPM_TOKEN` | npm 账号的 automation token |

影响 `release-sdk.yml` 与 `release-model-bank.yml`（`packages/sdk`、`packages/model-bank`）。
**如果你不打算发布这两个包，可以保持停用** —— 它们与 Web/Desktop/Docker 发布无关。

### 3. `GH_TOKEN`（自动发布必需）

13 个 workflow 引用它，但**没有一个 active**。

- `auto-tag-release.yml` 的 tag push 和 Release 发布需要 PAT 或 GitHub App token，
  否则内置 `GITHUB_TOKEN` 会抑制下游 push/release 触发器。缺失时在打标前失败。
- `sync-main-to-canary.yaml` 可以使用内置 `GITHUB_TOKEN`，但创建的 PR 工作流需要
  维护者批准运行。通过 CI 和 review 后再合并，不可用手工查看替代必需检查。
- 仍然需要的是：`auto-i18n`、`claude-*` 系列、`issue-auto-*`、`mcp-submission-handler`、
  `release.yml`、`release-desktop-canary.yml`

启用自动发布前配置具有相应仓库权限的事件 token。不要把缺少 token 当作可以
静默退回内置 token 的情况。参考 [GitHub 触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。

### 4. 其他（仅当要启用对应通道）

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

## 四、使用内置凭据的路径（仍需实际运行验证）

| 项                  | 说明                                               |
| ------------------- | -------------------------------------------------- |
| Docker 发布         | 已从 Docker Hub 迁到 GHCR，用内置 `GITHUB_TOKEN`   |
| 打 tag / 建 Release | 需要事件 token 才能启动下游发布，见上文 `GH_TOKEN` |
| 回同步 PR           | 推的是非保护分支（`sync/main-to-canary-*`）        |

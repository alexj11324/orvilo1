# 生产环境公网验收交接文档

> 面向接手 Agent：orvilo.aspectlylabs.com 已部署 canary 最新代码，四条功能链路（#264 GitHub OAuth、#270 Linear 导入、#273 协作光标、#274 Reviews 对齐）需要逐项公网验收。本文档是完整交接，按顺序做即可。

## 当前状态（已完成）

- **部署管线全绿**：`Build and deploy orvilo1` workflow\_dispatch run `36226309891` = success（门禁→compose 同步→部署→verify 全过）。
- **生产跑的是新代码**：`/api/version` 返回 `2.2.17`；`/oauth/github/callback`、`/oauth/linear/callback` 均返回 200（旧代码 404）。
- **镜像**：`ghcr.io/alexj11324/orvilo1@sha256:e5a6db401553f0aa9d919b45e21731b72a5eca1a22ca00a9e8fa4682450c4265`（orvilo、collaboration-gateway、hatchet-worker 共用）。
- **Hatchet worker 已注册并在执行**：日志里 `orvilo-linear-sync-sweep`、`orvilo-collaboration-outbox-sweep` 等任务在跑。根因是 worker/orvilo 不在 hatchet-lite 的 docker 网络，已通过 override compose 修复（见下）。

## 主机访问

```bash
ssh -i ~/.ssh/oracle_deploy_key -o BatchMode=yes ubuntu@158.101.98.163
# 密钥在 Devin session secret "Oracle"（RSA 私钥，可能需把空格还原为换行后存盘）
# compose 目录: /var/lib/orvilo1/docker-compose/deploy/
```

## 主机上已做的改动（接管前必读）

1. **`orvilo1-production.override.yml`**（host-local，workflow 不覆盖）：给 `orvilo` 和 `hatchet-worker` 加了 `networks: [orvilo-network, orvilo_lobe-network]`，文件尾部新增
   ```yaml
   networks:
     orvilo-network:
       external: false
     orvilo_lobe-network:
       external: true
       name: orvilo_lobe-network
   ```
   `hatchet-lite` 容器（compose 项目 orvilo-hatchet，`/var/lib/orvilo-hatchet/compose.yml`）同时挂在 `orvilo_hatchet_private` 和 `orvilo_lobe-network` 上；服务别名 `hatchet-lite` 在 lobe-network 上可解析。**这就是 worker 能注册的修复**。
2. **`.env` 已追加**：`COLLABORATION_GATEWAY_PUBLIC_URL=wss://orvilo.aspectlylabs.com/collaboration`、`COLLABORATION_GATEWAY_PORT=3012`、`ORVILO_IMAGE_TAG=<上面那个 digest>`（防止手动 `up` 误切 `orvilo:local`）。
3. **nginx** `/etc/nginx/sites-enabled/cordy632-aspectlylabs-origin` 的 `orvilo.aspectlylabs.com` server 块内已加：
   ```nginx
   location /collaboration {
       proxy_pass http://127.0.0.1:3012;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_read_timeout 3600s;
   }
   ```
   已 `nginx -t` + reload。公网实测：`GET https://orvilo.aspectlylabs.com/collaboration` 返回 404 但带 `x-orvilo-gateway-protocol-version: 3` 头 —— 请求直达 gateway，链路通。
4. **`.env` 已有**：`GITHUB_APP_CLIENT_ID`/`GITHUB_APP_CLIENT_SECRET`（已填真实值）、`JWKS_KEY`、`HATCHET_CLIENT_TOKEN` 等。

## 待办（按顺序）

### ① Linear OAuth App（#270 前置）

`.env` 缺 `LINEAR_OAUTH_CLIENT_ID` / `LINEAR_OAUTH_CLIENT_SECRET`。步骤：

1. 登录 linear.app → workspace 左下角 → Settings → API → "OAuth applications" → Create new OAuth2 application
2. 填：name 随意（如 `Orvilo Prod`）；Callback URLs 加 `https://orvilo.aspectlylabs.com/oauth/linear/callback`；scopes 勾 `read` `write`
3. 把 Client ID / Client Secret 追加到 `/var/lib/orvilo1/docker-compose/deploy/.env`
4. 重建 orvilo 使 env 生效：`cd /var/lib/orvilo1/docker-compose/deploy && sudo docker compose -f docker-compose.yml -f orvilo1-production.override.yml --profile hatchet up -d orvilo`

### ② 生产登录（公网验收前置）

站点登录走 Clerk SSO（`clerk.aspectlylabs.com`）。在浏览器打开 `https://orvilo.aspectlylabs.com` 完成登录。

### ③ 四链路公网验收

**#264 GitHub OAuth connect**：登录后进 Settings → Integrations（或 Reviews 页的 Connect 入口）→ Connect GitHub → 跳 github.com 授权页（client\_id 应对应已配的 GITHUB\_APP\_CLIENT\_ID）→ 回调 `https://orvilo.aspectlylabs.com/oauth/github/callback` → 连接状态显示已连接。

**#274 Reviews 对齐**：连上 GitHub 后开 Reviews 页 —— 拉取真实 `pullRequest.queue`（author ∪ review-requested），按 Linear 规则分桶（Approved / Pull requests / Created by you），点击行进 task 详情。

**#273 协作光标**：两个浏览器 / 隐身窗口登同一 workspace 同一看板（issue board）→ 应看到对方光标本（SF Symbol 箭头 + 名牌）实时移动。ws 走 `wss://orvilo.aspectlylabs.com/collaboration`。

**#270 Linear 导入向导**：配好 ① 后，走 Linear import wizard（OAuth 授权 → workspace 选择 → 映射 → 启动导入）；导入任务由 hatchet-worker 执行，`docker logs orvilo-hatchet-worker --tail 50` 应能看到 `linear-import`/`linear-sync` 相关 task 在跑。

### 验证命令速查

```bash
# 站点与路由存活
curl -sI https://orvilo.aspectlylabs.com/api/version
curl -sI https://orvilo.aspectlylabs.com/oauth/github/callback | head -1
curl -sI https://orvilo.aspectlylabs.com/oauth/linear/callback | head -1

# ws 握手直达 gateway（404 + x-orvilo-gateway-protocol-version 头 = 通）
curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  https://orvilo.aspectlylabs.com/collaboration | head -5

# 主机侧健康
sudo docker ps --format '{{.Names}} {{.Status}}' | grep orvilo
sudo docker logs orvilo-hatchet-worker --tail 20 # 应有 task run 记录
sudo docker logs orvilo-collaboration-gateway --tail 20
```

## 已知注意点

- `docker network connect` 的手动修复**不持久**—— 已在 override compose 里声明，container recreate 后网络仍在；不要回滚该改动。
- 若改了 `.env` 必须 `up -d orvilo`（或对应服务）重建才生效（env\_file 在建容器时烘焙）。
- `orvilo-hatchet-worker` 的 `profiles: [hatchet]`：`.env` 里 `COMPOSE_PROFILES=hatchet` 已开。
- 部署 workflow 只同步 `docker-compose.yml`、`bucket.config.json`、`searxng-settings.yml`、`elasticsearch/`；`.env` 和 override 是 host-local。
- Devin GH PAT（session secret `gh_credential`，用户 alexj11324）有 actions:write，可直接 dispatch/rerun；安装 token（`~/.devin/.devin-integration-gh-credentials`）actions 只读。

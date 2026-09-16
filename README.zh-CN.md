<div align="center">

# Orvilo

**构建、运行与监督 AI 智能体团队的工作空间。**

</div>

Orvilo 是一个可自托管的 AI 智能体平台。你定义智能体、给它们工具与技能、把活派下去，
然后看着它跑起来 —— 无论从 Web 应用、桌面应用，还是终端。

仓库是一个 monorepo，包含 Hono 后端、包着 React SPA 的 Next.js 外壳、
Electron 桌面客户端，以及 CLI。

[English](./README.md) · **简体中文**

---

## 仓库结构

| 路径 | 内容 |
| --- | --- |
| `src/` | React SPA —— 产品主界面 |
| `apps/server/` | 后端运行时、路由与服务 |
| `apps/desktop/` | Electron 桌面客户端 |
| `apps/cli/` | 命令行客户端 |
| `apps/share/`、`apps/workbench/`、`apps/auth/` | 辅助 Web 应用 |
| `packages/` | 共享 workspace 包 |
| `e2e/` | 端到端测试（Cucumber + Playwright） |

智能体可以接入聊天平台（Slack、Discord、Telegram、微信等）、Git 托管服务，
以及你自己配置的模型供应商。

## 本地开发

需要 **Node.js >= 22** 与 **pnpm**。仓库通过 `packageManager` 锁定 `pnpm@12.4.1`。

```bash
pnpm install

# 全栈：Next.js 外壳 + Vite SPA 同时启动
bun run dev

# 仅 SPA，API 代理到已有后端
bun run dev:spa

# 独立后端服务
pnpm --filter @orvilo/server dev
```

`dev:spa` 启动后终端会打印一个 **Debug Proxy** URL。打开它会把你的本地开发服务器
加载进线上环境，从而在真实服务端配置下获得 HMR。

### Preview 测试

Vercel Preview 是本仓库共享的测试目标。推送分支后会创建 Preview 部署，使用它的地址
进行浏览器和端到端验证。Preview 部署使用 [`.env.example.preview`](./.env.example.preview)
中记录的远程 PostgreSQL、Redis 与 Cloudflare R2 服务。本地开发可按
[`.env.example.development`](./.env.example.development) 选择云开发模式，Docker 仍可作为本地
回退方案。

### 质量检查

```bash
pnpm run type-check     # tsgo --noEmit
pnpm run test-app       # vitest run
pnpm run lint           # eslint + stylelint + 类型检查 + 循环依赖

# 只检查改动的文件
bun run check [changed-files...]
```

`bun run check` 支持 `--lint`、`--test`、`--type` 并可组合。默认范围是所有已暂存、
未暂存与未跟踪的改动；显式传路径会覆盖该默认值。

## 自托管

Orvilo 依赖 PostgreSQL。完整配置项见 [`.env.example`](./.env.example)，
部署方案见 [`docker-compose/`](./docker-compose)。

```bash
cp .env.example .env    # 然后填入数据库与模型供应商凭据
pnpm run build
```

桌面客户端需单独构建：

```bash
pnpm run desktop:build:main
```

## 贡献

欢迎提交 Issue 与 Pull Request，详见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。

提 PR 前请先跑覆盖你改动的检查：

```bash
bun run check
```

每个缺陷修复都应附带一个回归测试 —— 修复前失败、修复后通过。纯样式或 CSS 修复除外：
若唯一可行的断言只能是匹配样式表源码字符串，则可跳过。

## 许可证

[Apache License 2.0](./LICENSE)。

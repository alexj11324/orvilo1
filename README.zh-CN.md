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

| 路径                                           | 内容                                |
| ---------------------------------------------- | ----------------------------------- |
| `src/`                                         | React SPA —— 产品主界面             |
| `apps/server/`                                 | 后端运行时、路由与服务              |
| `apps/desktop/`                                | Electron 桌面客户端                 |
| `apps/cli/`                                    | 命令行客户端                        |
| `apps/share/`、`apps/workbench/`、`apps/auth/` | 辅助 Web 应用                       |
| `packages/`                                    | 共享 workspace 包                   |
| `e2e/`                                         | 端到端测试（Cucumber + Playwright） |

智能体可以接入聊天平台（Slack、Discord、Telegram、微信等）、Git 托管服务，
以及你自己配置的模型供应商。

## 本地开发

需要 **Node.js >= 22** 与 **pnpm**。仓库通过 `packageManager` 锁定 `pnpm@12.4.1`。

默认开发与 UI 验收使用真实 Electron 客户端，连接云端后端
`https://orvilo.aspectlylabs.com`。保留已有云端登录与工作区；本地 Vite 仅提供前端代码。
云端写操作须在用户授权范围内。本地种子账号、Cookie、数据与 Mock 不能作为云端身份或验收证据。

```bash
pnpm install

# Electron 与本地 Vite 前端；确认选中的服务端为云端
bun run dev:desktop

# 可选 Web 前端开发，使用终端打印的云端 Debug Proxy URL
bun run dev:spa
```

`dev:spa` 打印的 **Debug Proxy** URL 会把本地前端加载进线上环境，提供 HMR。
直接打开本地 Vite URL 的 API 代理默认指向 `localhost:3010`，不代表已连接云端。
记录本地前端提交与云端部署提交；本地 HEAD 不能证明后端修改已部署。

**默认绝不启动本地后端。** 代码修改、UI 验收或云端连接失败都不构成启动本地
Next.js/Hono、数据库、网关、迁移或种子的授权，也不应触发本地回退。

### 本地后端开发：仅限明确选择

只有用户明确要求本地后端时，才按[本地配置指南](./docs/development/local-setup.md)
准备服务与数据，并使用以下命令：

```bash
# 明确选择的全栈模式：Next.js + Vite SPA
bun run dev

# 明确选择的独立后端服务
pnpm --filter @orvilo/server dev
```

### 质量检查

```bash
pnpm run type-check # tsgo --noEmit
pnpm run test-app   # vitest run
pnpm run lint       # eslint + stylelint + 类型检查 + 循环依赖

# 只检查改动的文件
bun run check [changed-files...]
```

`bun run check` 支持 `--lint`、`--test`、`--type` 并可组合。默认范围是所有已暂存、
未暂存与未跟踪的改动；显式传路径会覆盖该默认值。

## 自托管

Orvilo 依赖 PostgreSQL。完整配置项见 [`.env.example`](./.env.example)，
部署方案见 [`docker-compose/`](./docker-compose)。

```bash
cp .env.example .env # 然后填入数据库与模型供应商凭据
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

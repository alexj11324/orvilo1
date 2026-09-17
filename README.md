<div align="center">

# Orvilo

**A workspace for building, running and supervising AI agent teams.**

</div>

Orvilo is a self-hostable platform for AI agents. You define agents, give them tools and
skills, hand them work, and watch it happen — from a web app, a desktop app, or a
terminal.

It runs as a monorepo with a Hono backend, a Next.js shell around a React SPA, an
Electron desktop client, and a CLI.

**English** · [简体中文](./README.zh-CN.md)

---

## What's in here

| Path                                           | What it is                               |
| ---------------------------------------------- | ---------------------------------------- |
| `src/`                                         | The React SPA — the main product surface |
| `apps/server/`                                 | Backend runtime, routers and services    |
| `apps/desktop/`                                | Electron desktop client                  |
| `apps/cli/`                                    | Command-line client                      |
| `apps/share/`, `apps/workbench/`, `apps/auth/` | Auxiliary web apps                       |
| `packages/`                                    | Shared workspace packages                |
| `e2e/`                                         | End-to-end tests (Cucumber + Playwright) |

Agents can be connected to chat platforms (Slack, Discord, Telegram, WeChat and
others), to Git hosts, and to model providers you configure yourself.

## Local Development

Requires **Node.js >= 22** and **pnpm**. The repo pins `pnpm@12.4.1` via
`packageManager`.

```bash
pnpm install

# Full-stack: Next.js shell + Vite SPA together
bun run dev

# SPA only, with the API proxied to an existing backend
bun run dev:spa

# Standalone backend service
pnpm --filter @orvilo/server dev
```

After `dev:spa` starts, the terminal prints a **Debug Proxy** URL. Opening it loads your
local dev server inside the hosted environment, so you get HMR against real server
config.

### Preview testing

Oracle is the temporary production target. Its Docker image is built and pushed by
GitHub Actions on the arm64 runner, then the exact immutable image tag is pulled over
SSH by the Oracle deploy job. A local Docker or Next.js build is not a production
deployment path.

Vercel Preview is paused by default. The Preview database workflow remains behind
`PREVIEW_EPHEMERAL_DB_ENABLED` and the manual `VERCEL_PREVIEW_DEPLOYMENT_GATE`; when
enabled, it first requires exact-head E2E CI and a successful Vercel token preflight
before it can open the Oracle database tunnel or write Vercel environment variables.
Preview deployments use the remote PostgreSQL, Redis, and Cloudflare R2 services documented
in [`.env.example.preview`](./.env.example.preview).

### Quality checks

```bash
pnpm run type-check # tsgo --noEmit
pnpm run test-app   # vitest run
pnpm run lint       # eslint + stylelint + type-check + circular deps

# Scope a check to the files you changed
bun run check [changed-files...]
```

`bun run check` accepts `--lint`, `--test` and `--type` and composes them. It defaults to
everything staged, unstaged and untracked; passing explicit paths overrides that.

## Self-Hosting

Orvilo runs against PostgreSQL. See [`.env.example`](./.env.example) for the full set of
configuration variables, and [`docker-compose/`](./docker-compose) for deployment
recipes.

```bash
cp .env.example .env # then fill in your database and provider credentials
pnpm run build
```

The desktop client is built separately:

```bash
pnpm run desktop:build:main
```

## Contributing

Issues and pull requests are welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md).

Before opening a pull request, run the checks that cover your change:

```bash
bun run check
```

Every bug fix should come with a regression test that fails before the fix and passes
after it. Pure style or CSS fixes are exempt when the only practical assertion would be
matching stylesheet source strings.

## License

[Apache License 2.0](./LICENSE).

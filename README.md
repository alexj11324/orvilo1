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

Development and UI acceptance default to the real Electron client connected to
`https://orvilo.aspectlylabs.com`. Preserve the existing cloud sign-in and workspace;
local Vite serves frontend code. Cloud mutations require user authorization. Local
seeded users, cookies, data and mocks are not cloud identity or acceptance evidence.

```bash
pnpm install

# Electron + local Vite renderer; verify the selected server is the cloud
bun run dev:desktop

# Optional Web frontend development via the printed cloud Debug Proxy URL
bun run dev:spa
```

The **Debug Proxy** URL printed by `dev:spa` loads the local frontend inside the hosted
environment with HMR. Opening Vite directly uses an API proxy to `localhost:3010` by
default and does not establish a cloud connection. Record the local renderer commit
and cloud deployment commit separately; local HEAD does not prove backend deployment.

**Never start a local backend by default.** Code changes, UI acceptance or a failed
cloud connection do not authorize local Next.js/Hono servers, databases, gateways,
migrations, seeds or an automatic local fallback.

### Local backend development: explicit opt-in

Only when the user explicitly requests a local backend, prepare services and data
using the [local setup guide](./docs/development/local-setup.md), then use:

```bash
# Opt-in full stack: Next.js + Vite SPA
bun run dev

# Opt-in standalone backend service
pnpm --filter @orvilo/server dev
```

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

---
name: project-overview
description: 'Use for the repository map, code-layer lookup, apps/packages/src ownership and current alias/deployment sources.'
user-invocable: false
---

# Orvilo Project Overview

> The directory listings below are a **curated map of key locations**, not an
> exhaustive tree. `packages/`, `src/store/`, route groups etc. grow over time —
> run `ls` against the real directory for the current set.

## Project Description

Open-source Agent delivery workspace for developers and small teams: **Orvilo**, evolving independently from LobeHub. The [product contract](../../../docs/development/product-scope.md) owns current product semantics; this skill maps implementation locations and does not claim the contract is already implemented.
This repo is the **open-source root** (`github.com/alexj11324/orvilo1`, package `orvilo`).

**Supported platforms:**

- Web desktop/mobile
- Desktop (Electron) — `apps/desktop`
- Native mobile implementations are outside this repository map; inspect their owning repository before making availability claims.

**Logo emoji:** 🤯

## Complete Tech Stack

| Category      | Technology                                                                          |
| ------------- | ----------------------------------------------------------------------------------- |
| Framework     | Next.js 16 + React 19                                                               |
| Routing       | SPA inside Next.js with `react-router-dom`                                          |
| Language      | TypeScript                                                                          |
| UI Components | Local ReUI/shadcn primitives and adapters; retained `@lobehub/ui` features          |
| Styling       | Tailwind roles and existing antd-style; choices owned by [react](../react/SKILL.md) |
| Icons         | lucide-react, `@ant-design/icons`                                                   |
| i18n          | react-i18next                                                                       |
| State         | zustand                                                                             |
| URL Params    | nuqs                                                                                |
| Data Fetching | SWR                                                                                 |
| React Hooks   | aHooks                                                                              |
| Date/Time     | dayjs                                                                               |
| Utilities     | es-toolkit                                                                          |
| API           | TRPC (type-safe)                                                                    |
| Database      | PostgreSQL + Drizzle ORM; environment-specific config                               |
| Testing       | Vitest                                                                              |

> Exact versions live in the root `package.json` — check there, not here.

## Monorepo Layout

Flat layout — `apps/`, `packages/`, and `src/` all sit at the repo root. No
git submodules.

```
(repo root)
├── apps/
│   ├── cli/                  # Orvilo CLI
│   ├── desktop/              # Electron desktop app
│   └── server/               # Server runtime/business logic (`@/server/*` alias)
│       └── src/
│           ├── router-hono/  # Hono endpoint routers and standalone runtime
│           └── ...           # featureFlags, globalConfig, modules, routers, services, utils, workflows
├── docs/                     # changelog, development, self-hosting, usage
├── locales/                  # en-US, zh-CN, ...
├── packages/                 # ~80 @orvilo/* workspace packages — `ls` for the full set. Key ones:
│   ├── agent-runtime/        # Agent runtime core
│   ├── agent-signal/         # Agent Signal pipeline
│   ├── agent-tracing/        # Tracing / snapshots
│   ├── builtin-tool-*/       # Per-tool packages (calculator, web-browsing, claude-code, ...)
│   ├── builtin-tools/        # Central registries that compose builtin-tool-*
│   ├── context-engine/
│   ├── database/             # src/{models,schemas,repositories}
│   ├── model-bank/           # Model definitions & provider cards
│   ├── model-runtime/        # src/{core,providers}
│   ├── locales/              # i18n source of truth: packages/locales/src/default/
│   ├── env/                  # env schemas (@/envs/* → packages/env/src/*)
│   ├── app-config/
│   ├── business/             # Business package boundaries (config, const, model-bank, model-runtime)
│   ├── business-server/      # First target of @/business/server/*
│   ├── types/
│   └── utils/
└── src/
    ├── app/
    │   ├── (backend)/        # api, f, market, middleware, oidc, trpc, webapi
    │   ├── spa/              # SPA HTML template service
    │   └── spa-auth/         # Auth HTML shell (SSR)
    ├── routes/               # SPA page segments (thin — delegate to features/)
    │   └── (main)/ (mobile)/ (desktop)/ (popup)/ auth/ onboarding/ share/
    ├── spa/                  # SPA entries + router config
    │   ├── entry.{web,mobile,desktop,popup}.tsx
    │   └── router/
    ├── business/             # Client/server business boundaries; inspect current aliases/consumers
    ├── features/             # Domain business components
    ├── store/                # ~30 zustand stores — `ls` for the full set
    └── ...                   # components, hooks, layout, libs, services, types, utils
```

## Architecture Map

| Layer               | Location                                                                  |
| ------------------- | ------------------------------------------------------------------------- |
| UI Components       | `src/components`, `src/features`                                          |
| SPA Pages           | `src/routes/`                                                             |
| React Router        | `src/spa/router/`                                                         |
| Global Providers    | `src/layout`                                                              |
| Zustand Stores      | `src/store`                                                               |
| Client Services     | `src/services/`                                                           |
| REST API            | `src/app/(backend)/webapi`                                                |
| tRPC Routers        | `apps/server/src/routers/{async\|lambda\|mobile\|tools}`                  |
| Server Services     | `apps/server/src/services` (can access DB)                                |
| Server Modules      | `apps/server/src/modules` (no DB access)                                  |
| Feature Flags       | `apps/server/src/featureFlags`                                            |
| Global Config       | `apps/server/src/globalConfig`                                            |
| DB Schema           | `packages/database/src/schemas`                                           |
| DB Model            | `packages/database/src/models`                                            |
| DB Repository       | `packages/database/src/repositories`                                      |
| Third-party         | `src/libs` (analytics, oidc, etc.)                                        |
| Builtin Tools       | `packages/builtin-tool-*`, `packages/builtin-tools`                       |
| Business boundaries | `src/business/*`, `packages/business/*`, `packages/business-server/src/*` |

## Data Flow

```
React UI → Store Actions → Client Service → TRPC Lambda → Server Services → DB Model → PostgreSQL
```

## Alias and Deployment Sources

Use this repository's current `tsconfig.json` and app build configs to resolve imports. In the root map, `@/server/*` resolves to `apps/server/src/*`; `@/business/server/*` checks `packages/business-server/src/*` before `src/business/server/*`; `@/*` resolves to `src/*`. Verify the owning app's configuration when tracing a call. A directory called `business` is not proof that a private overlay replaces it or that it is unused.

[docs/environments.md](../../../docs/environments.md) owns deploy targets and [branch-model.md](../../../docs/development/branch-model.md) owns branch semantics. The production backend deployment workflow is `.github/workflows/deploy-orvilo1.yml` in this repository. Historical private SaaS overlay/submodule resolution descriptions do not define the current development or deployment path.

[AGENTS.md](../../../AGENTS.md#default-local-electron-development) owns development and runtime verification: local Electron and the existing local backend are the default. Record the actual renderer/backend revisions; cloud acceptance additionally records the deployed revision. A repository map or build result cannot prove product acceptance.

# Orvilo Development Guidelines

Guidelines for using AI coding agents in this opensource Orvilo repository.

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- SPA inside Next.js with `react-router-dom`
- `@lobehub/ui`, antd, and antd-style for UI implementation
- react-i18next for i18n; zustand for state management
- SWR for data fetching; TRPC for type-safe backend
- Drizzle ORM with PostgreSQL; Vitest for testing

## Agent Skills

`AGENTS.md` owns repository-wide architecture and workflow. Keep detailed implementation rules in skills so they have one source of truth.

- **React and TSX**: Before editing components, component state, render boundaries, or memoization, read the `react` skill. It owns component selection, styling, state locality, and render-performance rules.
- **Heavy domain features**: When splitting a fat Viewer/Page into reusable pieces (page vs portal vs share vs micro-app), read the `compose-atoms` skill. Split on mountable capabilities, not visual sections, and do not hide unused work behind `readOnly` / `mode` flags.

## Code Ownership

For the full repository map or help locating a code layer, read the `project-overview` skill.

- `apps/server/src`: backend runtime, routers, and services, imported through `@/server/*`. `src/app/(backend)` contains Next.js route shells only; do not put backend business logic there.
- `src/app`: Next.js HTML/auth shells. Web shell helpers belong under `src/libs` or the relevant app segment, not `src/server`.
- `src/spa`: SPA entry points and React Router configuration. `src/routes` holds thin page segments that compose `src/features`; business UI and logic belong in features by domain.
- `src/services` and `src/store`: client API services and Zustand state. Keep fetch/cache guidance in `data-fetching-architecture` and store conventions in `zustand`.
- `apps/desktop`, `apps/cli`: Electron and CLI applications. `packages` holds shared code, including `database`, `agent-runtime`, `env`, and `locales`.
- `e2e`: end-to-end tests using Cucumber and Playwright.

Before changing SPA routes, read the `spa-routes` skill. Register common Web/Electron paths, metadata, lazy loaders and `preloadId` values once in `src/spa/router/desktopRouter.shared.tsx`; keep `desktopRouter.config*.tsx` limited to platform differences and `desktopRouter.sync.test.tsx` passing. Do not create `features` directories inside `src/routes`.

## Development

### Starting the Dev Environment

```bash
# SPA dev mode (frontend only, proxies API to localhost:3010)
bun run dev:spa

# Full-stack dev (Next.js + Vite SPA concurrently)
bun run dev

# Standalone Hono backend service
pnpm --filter @orvilo/server dev
```

After `dev:spa` starts, the terminal prints a **Debug Proxy** URL:

```plaintext
Debug Proxy: https://orvilo.aspectlylabs.com/_dangerous_local_dev_proxy?debug-host=http%3A%2F%2Flocalhost%3A9876
```

Open this URL to develop locally against the production backend (orvilo.aspectlylabs.com). The proxy page loads your local Vite dev server's SPA into the online environment, enabling HMR with real server config.

#### Worktrees and the shared desktop app (`dev:env`)

Use `bun run dev:env` to work across several worktrees with one Electron app. It keeps a single app process and its sign-in, and swaps only the renderer, which is a cheap Vite server per worktree.

```bash
bun run dev:env status       # which worktree each port, Electron and database belongs to
bun run dev:env up [dir]     # deps, env files, backend, then show <dir> in the shared Electron
bun run dev:env switch [dir] # show another worktree's renderer (--reset: the app's own)
bun run dev:env down [dir]   # stop <dir>'s renderer server
```

Run `status` before you trust a running server: it shows which worktree and commit each port serves. `up` never migrates the shared database unless you pass `--migrate`. It warns when the database was migrated by a newer line than the target code. Main and preload code stay those of the Electron host. When they differ from the shown worktree, `switch` says so.

### Git Workflow

- **Branch strategy**: `canary` is the development trunk **and** the cloud production line; `main` is a release snapshot cut from it. Neither is an environment. Full model: [docs/development/branch-model.md](./docs/development/branch-model.md); deploy targets: [docs/environments.md](./docs/environments.md)
- New branches should be created from `canary`; PRs should target `canary`
- Use rebase for `git pull`
- Commit messages: prefix with gitmoji
- Branch format: `<type>/<feature-name>`
- Both `canary` and `main` are protected — direct pushes are blocked and PRs are the only way in. GitHub Actions is exempt so release automation can write back.
- **GitHub API credentials (Devin sessions)**: `gh` is authenticated via `GH_TOKEN` read from `~/.devin/.devin-integration-gh-credentials` — this file is Devin's own token location, written by the platform for the Devin agent. Use `GH_TOKEN=$(awk '{print $2}' ~/.devin/.devin-integration-gh-credentials) gh <cmd> -R alexj11324/orvilo1`. Remotes point at the git proxy host, so always pass `-R alexj11324/orvilo1` (or run commands that don't derive the repo from the remote). The token is short-lived and refreshed by the platform — read it fresh per command, never copy it into files or logs.

### Cutting a Release

Run `bun run release:branch`. It fetches `origin/canary`, computes the next version,
creates `release/vX.Y.Z`, and opens a `🚀 release: vX.Y.Z` PR against `main`.

Merging that PR triggers `auto-tag-release.yml`, which bumps `package.json`, generates
the changelog, creates the tag and GitHub Release, and syncs `main` back to `canary`.
**Do not hand-edit the root `package.json` version** — the tag workflow owns it.

An urgent fix to an already-released version goes through `hotfix/<name>` branched from
`main`; the same workflow picks it up as a patch bump.

### Package Management

- `pnpm` for dependency management
- `bun` to run npm scripts
- `bunx` for executable npm packages

### Quality Check

Use `bun run check [changed-files...]`.

- Every bug fix needs a regression test that fails before the fix and passes after it. Skip pure style/CSS fixes when the only practical assertion would match stylesheet source strings.
- Run once with the selectors needed: no selector means lint + related tests; `--lint`, `--test`, and `--type` compose. Default scope is all staged, unstaged and untracked changes; explicit paths override it.
- Lint autofixes files: review the emitted diff. Tests use the nearest owning Vitest config. `--type` checks the full repo — it is CI-only and fails fast outside GitHub Actions (`scripts/type-check.mjs`); the `Typecheck` job in `test.yml` runs it on every push/PR. For a scoped local check, run `pnpm type-check` inside the owning package (e.g. `apps/server`). Never run `bun run test`, which runs the full suite.
- For a manual package test, run from the owning package: `cd packages/database && bunx vitest run --silent='passed-only' '[file-path]'`.

### Verification Evidence

Product verification is still required. For new or changed product behavior, exercise the affected
outcomes on the real product and capture evidence a reviewer can check against a specific revision.
Opening or marking a PR ready is a checkpoint for that decision, not a trigger to rerun verification.

- Documentation/instruction-only changes, pure refactors or tooling changes with no product behavior
  change, and gitlink-only syncs do not require a new verification run. State the reason in the PR.
- Reuse evidence that already covers the delivered behavior; do not re-run the product merely to open
  a PR.
- Attach the evidence to the PR itself — screenshots, screen recordings, logs, or test output — or
  publish it as a GitHub Actions artifact. Record the commit SHA the evidence was produced on, so a
  reviewer can tell which revision it proves.
- Do not publish verification to a separate acceptance site, and do not install a skill into an agent
  harness to produce it. There is no standalone acceptance platform behind this requirement.

Tests, lint, and type-check remain separate quality gates; they do not replace product verification.

### i18n

- Add keys to a namespace file under `packages/locales/src/default/` (e.g. `agent.ts`, `auth.ts`)
- Ship en-US and zh-CN by hand in the same PR: author the English source in `packages/locales/src/default/*.ts`, mirror it to `locales/en-US/`, and hand-translate `locales/zh-CN/`.
- Leave all other locales to the daily CI workflow (`.github/workflows/auto-i18n.yml`), which runs `bun run i18n` and opens an automated translation PR. Missing locale keys fall back to English until that PR is merged.
- Run `bun run i18n` manually only when the translated locales are needed immediately instead of waiting for the daily workflow. It is slow and requires `OPENAI_API_KEY`; don't hand-translate the generated locales.

### Code Style

- When a single file grows beyond \~800 lines, consider splitting it into multiple files (extract sub-components, hooks, helpers, or types). Smaller, focused files are friendly to humans and agents.

### Code Review

Before reviewing a PR / diff / branch change, read the **deep-review** skill. Ordinary review requests use its light mode (one independent reviewer against the dimension quick checklists); the full multi-subagent deep mode runs only on explicit invocation.

When designing or reviewing user-facing flows (empty/loading/error states, confirmations, async feedback, button hierarchy, lists at scale, pickers), follow Orvilo's design values in [`DESIGN.md`](./DESIGN.md) — Natural / Meaningful / Certainty / Growth (自然 / 意义感 / 确定性 / 成长).

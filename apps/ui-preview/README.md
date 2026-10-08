# Repository-backed Orvilo UI preview

This is the existing Web SPA, not a separately implemented UI. Baseline: `alexj11324/orvilo1@f81bd916e59a6256651ac4301962b8afb7b6e9fd` (canary).

## Component provenance

| Surface | Existing source retained |
| --- | --- |
| Web entry and routing | `src/spa/entry.web.tsx`, `src/spa/router/desktopRouter.config.tsx`, `desktopRouter.shared.tsx` |
| Sidebar | `src/features/HomeSidebar`, `src/features/NavPanel` |
| Issues | `src/features/AgentTasks`, `src/store/task` |
| Conversation | Existing Agent/Conversation route, chat components and stores |
| Settings | Existing Settings routes and components |
| Shared work surface | `src/features/WorkSurface/WorkSurface.tsx` |
| Primitive components | Existing `src/components/ui` and the repository theme tokens |

`src/spa/preview/entry.ts` installs fixtures before dynamically importing the shipped Web entry. It does not define a replacement router, shell, page set, or state store. The production entry/config is unchanged.

## Run

From the repository root with Node 24 and pnpm 12.4.1:

```sh
pnpm install --no-frozen-lockfile --ignore-scripts
pnpm exec vite build --config vite.preview.config.ts --mode ui-preview
pnpm exec vite preview --config vite.preview.config.ts --mode ui-preview
pnpm exec vitest run --project app src/spa/preview/transport.test.ts src/features/AgentTasks/AgentTaskList/TaskBoardCard.test.tsx
```

The workspace intentionally disables the pnpm lockfile; this change does not change that repository policy. No root production build or database-migration script is run.

For Vercel use project root `apps/ui-preview`, Node 24, and include source files outside the project root. Its `vercel.json` builds into `apps/ui-preview/dist` and includes the SPA route fallback. Deploy this target only to the dedicated UI-preview project, not the real backend deployment.

## Data and execution boundary

All names, issues, membership and messages are artificial fixtures. The visible workspace is named **Orvilo UI preview**. tRPC calls are answered in the browser using the real response shapes and SuperJSON. Local issue edits, conversation metadata and settings persist only under `orvilo:repository-ui-preview:v1` in this browser. Refreshing does not publish data to a server.

Agent execution, device access, integrations, provider connection tests, uploads and real-time collaboration are **not connected**. Missing operations fail explicitly instead of reporting fake success. An empty/offline Device state is intentional. Do not enter real credentials into the preview. The preview transport blocks external fetches and API requests that do not have an implemented local fixture. The existing realtime transport is substituted only by the dedicated preview build.

Reset sample data from the browser console with `window.__ORVILO_PREVIEW__.reset()`. This removes only the preview data key. `window.__ORVILO_PREVIEW__.requests` retains at most 200 request diagnostics, for checking fixture coverage.

## Original-component improvements

- The original `TaskBoardCard` title is a native, workspace-aware link. Keyboard focus is visible; normal card clicks, context menus, draggable attributes and drag-overlay inertness are preserved.
- Card surfaces and identifier contrast use existing semantic tokens. Heavy fixed black shadows are removed and reduced-motion preferences are respected.
- The original `WorkSurface` establishes `min-width: 0` throughout its flex hierarchy and a stable scroll gutter, reducing overflow and scrollbar-driven layout movement.

## Verification

The focused suites cover fixture shape, local persistence with dates, optimistic revision conflicts, distinct identifiers, fail-closed unsupported operations, reset isolation, keyboard-focusable card links and the existing card/kanban regressions. Browser validation is recorded separately; unit tests are not a claim that every backend-dependent action has a fixture.

This changes the existing frontend incrementally. It does not claim that the repository has already completed a whole-product design-system migration.

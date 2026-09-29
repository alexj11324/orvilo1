# Acceptance entry in LobeHub

## Key conclusion

The normal user journey starts from the delivery context: open a task and click its Acceptance state, checklist/report action, or verification tag. LobeHub opens the Acceptance in a panel beside that task. A project has a separate Acceptance workspace. The standalone `/acceptance/<acceptanceId>` page is the stable deep link produced by the coding-agent CLI and by the public Acceptance skill; it is not the primary desktop navigation entry.

## Exact journeys

### 1. Task detail: the contextual entry

1. Open a task that already has an Acceptance aggregate. The task detail renders an Acceptance state row only when the aggregate exists; clicking it calls `openAcceptanceInPanel(acceptance.id)`.
2. The hook turns on the task-agent panel and calls the chat store's `openAcceptance`; it deliberately does not navigate to `/acceptance/<id>`.
3. The task's Acceptance section exposes the same panel destination through “Open report”; individual checks open the corresponding Acceptance check in that panel. Verification-run tags do the same.

Sources: [`TaskAcceptanceStateRow.tsx`](https://github.com/lobehub/lobehub/blob/canary/src/features/AgentTasks/AgentTaskDetail/TaskAcceptanceStateRow.tsx#L27-L38), [`useOpenAcceptanceInPanel.ts`](https://github.com/lobehub/lobehub/blob/canary/src/features/AgentTasks/AgentTaskDetail/useOpenAcceptanceInPanel.ts#L6-L23), [`TaskAcceptance.tsx`](https://github.com/lobehub/lobehub/blob/canary/src/features/AgentTasks/AgentTaskDetail/TaskAcceptance.tsx#L160-L170).

### 2. Project: the collection/workspace entry

The project overview's review action navigates to the project Acceptance path. That route loads `AcceptanceWorkspace` with the project id, so its list is filtered to that project. This is a project-level workspace and collection; selecting an item then focuses its Acceptance record.

Sources: [`ProjectDashboard.tsx`](https://github.com/lobehub/lobehub/blob/canary/src/features/Projects/Workspace/ProjectDashboard.tsx#L317-L323), [`src/routes/(main)/project/[projectId]/acceptance/index.tsx`](https://github.com/lobehub/lobehub/blob/canary/src/routes/%28main%29/project/%5BprojectId%5D/acceptance/index.tsx#L1), [`Acceptance/Workspace/index.tsx`](https://github.com/lobehub/lobehub/blob/canary/src/features/Acceptance/Workspace/index.tsx#L81-L116).

### 3. Coding-agent CLI / public skill: the link-producing entry

`/acceptance` is not a coding-agent slash command. In the CLI it is the first-class `lh acceptance` command group. A run attaches to the subject's Acceptance, constructs `/acceptance/<acceptanceId>`, and, when `--open` is requested, prints that link as the user-facing destination. The round snapshot is the same URL with `?r=<roundIndex>`.

The public Acceptance skill says that an operation id is optional: with no named subject, ingest creates a standalone Acceptance; with a subject, use `task:<id>`, `topic:<id>`, or `document:<id>`. It also says the Acceptance URL is the stable cross-round decision surface and that raw `/verify` run pages remain internal.

Sources: [`acceptanceRun.ts`](https://github.com/lobehub/lobehub/blob/canary/apps/cli/src/commands/acceptanceRun.ts#L744-L761), [`acceptanceRun.ts`](https://github.com/lobehub/lobehub/blob/canary/apps/cli/src/commands/acceptanceRun.ts#L938-L950), [`packages/builtin-skills/src/acceptance/SKILL.md`](https://github.com/lobehub/lobehub/blob/canary/packages/builtin-skills/src/acceptance/SKILL.md#L49-L63), [`SKILL.md`](https://github.com/lobehub/lobehub/blob/canary/packages/builtin-skills/src/acceptance/SKILL.md#L136-L140).

### 4. Standalone Web route: the direct/deep-link entry

The Web app registers `/acceptance` as a standalone workspace/list and `/acceptance/:acceptanceId` plus `/acceptance/:acceptanceId/check/:checkId` as detail routes. Therefore a user can open the printed deep link directly in a browser, or open `/acceptance` to browse the standalone collection.

Sources: [`desktopRouter.config.tsx`](https://github.com/lobehub/lobehub/blob/canary/src/spa/router/desktopRouter.config.tsx#L32-L70), [`apps/workbench/app/routes.ts`](https://github.com/lobehub/lobehub/blob/canary/apps/workbench/app/routes.ts#L5-L10), [`SKILL.md`](https://github.com/lobehub/lobehub/blob/canary/packages/builtin-skills/src/acceptance/SKILL.md#L136-L140).

## Why it may not appear in the desktop app

The official router split is the decisive detail:

- The Web router puts the standalone Acceptance tree in `webOnlyRoutes` and passes it as `platformRoutes`.
- The Electron router uses the shared route tree plus tab-host stubs and does not register those Web-only platform routes.
- The router synchronization test explicitly expects Web to contain `/acceptance` and Electron not to contain it.

So a desktop user should not expect a global standalone Acceptance item or a direct `/acceptance` tab in the desktop navigation. Desktop still has the contextual paths that are in the shared tree: project Acceptance, and task/run Acceptance opened in the side panel. If a user only looks for a global Acceptance page in the desktop sidebar, it can appear to be missing even though the Acceptance record exists and its Web deep link is valid.

Sources: [`desktopRouter.config.tsx`](https://github.com/lobehub/lobehub/blob/canary/src/spa/router/desktopRouter.config.tsx#L32-L80), [`desktopRouter.config.desktop.tsx`](https://github.com/lobehub/lobehub/blob/canary/src/spa/router/desktopRouter.config.desktop.tsx#L30-L49), [`desktopRouter.sync.test.tsx`](https://github.com/lobehub/lobehub/blob/canary/src/spa/router/desktopRouter.sync.test.tsx#L361-L371).

## Practical answer

For a human reviewing a delivery, start at the task detail and click the Acceptance state/report/check, or use the project's Acceptance workspace. For an agent-produced result, run the `lh acceptance` flow and open the printed `/acceptance/<acceptanceId>` URL in the Web app. Treat `/acceptance` as a Web collection route, not as the desktop app's guaranteed global entry.

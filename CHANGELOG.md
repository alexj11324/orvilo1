<a name="readme-top"></a>

# Changelog

## [Version 2.6.0](https://github.com/alexj11324/orvilo1/compare/v2.5.0...v2.6.0)

<sup>Released on **2026-10-02**</sup>

#### 🐛 Bug Fixes

- **tasks**: compose IssueStatusPicker search on ReUI Input.
- **AgentTasks**: replace bare <input> in IssueStatusPicker with design-system Input.
- **database**: treat removed lobehub avatar assets as absent.
- **agents**: give the agent settings profile a mobile layout.
- **selectors**: resolve active topic through every loaded bucket.
- **topics**: flatten workspace query row type after leftJoin.
- **ui**: clean up #403 visual/IA fallout + native-controls CI gate.
- **kanban**: drop stale groupBy arg in status choice call.
- **workflow-badge**: token-scale text sizes (Linear token gate).
- **chat**: widen topicId prop for nullable conversation context.
- **agents**: force card layout and wrapped controls on mobile.
- **chat**: evict stale topics and fall back to the conversation list.
- **mobile**: persist last-used agent id and read it for new conversations.
- **settings**: load common namespace for the Agents row label.
- **mobile**: load global stylesheet in mobile entry, hide kbd hint on touch.
- **watchdog-test**: cover settle-path model methods, expect paused projection.
- **settlement**: satisfy strict updateStatus overloads and test typings.
- **misc**: pass children inside Provider props in useAgentId test.
- **misc**: /settings/agents shadowed by workspace slug; topic list agentId projection; task-agent labels.
- **hetero-agents**: satisfy augmented ProcessEnv in keep-alive tests.
- **server**: gate goal-mode dispatch on builtin-tool mount capability.
- **typography**: font-semibold on workflow-state picker rows.
- **typography**: align type ramp, mono IDs and timestamps to design tokens.
- **types**: exclude vendored aegis sources from repo typecheck.
- **server**: converge orphaned dispatches on stale ops and admission deadlocks.
- **server**: ack duplicate hetero callbacks after operation settles.
- **server**: unwrap TRPCError in sweeps and defer candidate column projection.
- **server**: bound dispatch sweeps and add backlog intake.
- **mywork**: rename workQueryVirtualList.ts to fix case-insensitive collision.
- **inbox**: keep snooze labels as literal keys for typed t().
- **inbox**: menu keydown leak + token/skeleton gates.
- **inbox**: drop preventDefault in row option click guard.
- **issue-detail**: clear typecheck, e2e, and docs gates for Plane layout.
- **sidebar**: keep namespaced i18n keys in WorkspaceSwitcher aria labels.
- **provider**: type ModelList Search variant against SearchBar props.
- **work-query**: page rows that share a timestamp.
- **issue-detail**: open the status menu on workflow-linked issues.
- **work-query**: align issue list types with board and my-work lanes.
- **provider-binding**: name canonical seam types so overloaded typeof stays substitutable.
- **issues**: page project groups, previews, and visibility.
- **work-query**: group lists by milestone and agent.
- **saved-views**: name group headers and keep list lanes.
- **issues**: page filtered project lists by their group.
- **control-plane**: satisfy tsgo ProcessEnv overload in acceptance spawns.
- **work-query**: keep list group headers stuck to the scroll area.
- **work-query**: drop load more when a group page is exactly full.
- **server**: resolve embedded runner artifact lazily so bundlers never trace dist/.
- **work-query**: reject operators a field does not support.
- **saved-views**: type the group-by menu against existing copy.
- **work-query**: order activity pages and list headers.
- **misc**: categorize experienceMemory, mcpEvents, providerBinding API-key scopes.

#### ✨ Features

- **topics**: cursor-paginate the workspace conversation feed.
- **work-query**: split Status/Execution axes, saved-view schema v2.
- **topics**: workspace-wide conversation feed for the sidebar.
- **chat**: make lastUsedAgentId the only new-topic default source.
- **mobile**: rebuild 会话 tab as conversation list, fix tab-bar overlay.
- **misc**: topic-centric agent workspace + Settings→Agents config exile.
- **group-chat**: purpose-free creation, instant entry, agent pickers, top-level nav.
- **hetero-agents**: per-engine prompt-cache keep-alive for idle ACP sessions.
- **hetero**: fuse aegis method pack into verify + artifact pipeline.
- **server**: tiered intake matching with escalate-on-failure.
- **database,types**: add agent tier carrier on roster and dispatch rows.
- **inbox**: row-shaped loading skeleton for the list column.
- **inbox**: rework inbox as Plane-style All/Mentions feed.
- **issue-detail**: move relations into sidebar fields like Linear.
- **settings**: workspace switcher replaces logo header on settings sidebar.
- **provider-binding**: execution.ts compat superset for #367's execAgent.
- **issue-detail**: align relations and workflow with Plane.
- **saved-views**: restore list grouping axes and a second group.
- **server**: route orvilo dispatches to the embedded Prime host behind prime_embedded_dispatch.
- **controlPlane**: embedded runtime host composition option + artifact verification.
- **agent-execution**: embedded harness broker inference bridge.
- **misc**: restore P30-retired provider settings UI and client-side inference runtime.
- **prime-harness**: first-party harness runner package.
- **agent-execution**: embedded-Prime harness wire protocol, transport, runtime.
- **work-query**: page grouped lists and virtualize them.
- **providerBinding**: BYOK execution chain — mint fenced credentials into Orvilo agent runs.
- **work-query**: board axes, swimlanes, and shared filters.
- **misc**: add durable MCP event consumer with guarded execution.

#### ♻️ Code Refactoring

- **tasks**: Issue kanban shows workflow only, split status picker/execution badge.
- **server**: restore terminal throw in dispatch admission catch.
- **controlPlane**: remove prime_embedded_dispatch flag — orvilo tasks always run embedded Prime.
- **sidebar**: workspace switcher moves to main sidebar header; settings rails go headerless.

#### 💄 Styles

- **issue-detail**: text-xs scale class + mono identifiers for Linear tokens.
- **issue-detail**: mono font for relation identifiers like Linear's ID tokens.
- **issue-detail**: match Plane property rows and title.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's fixed

- **tasks**: compose IssueStatusPicker search on ReUI Input ([1111915](https://github.com/alexj11324/orvilo1/commit/1111915))
- **AgentTasks**: replace bare <input> in IssueStatusPicker with design-system Input ([49a5559](https://github.com/alexj11324/orvilo1/commit/49a5559))
- **database**: treat removed lobehub avatar assets as absent ([139fe09](https://github.com/alexj11324/orvilo1/commit/139fe09))
- **agents**: give the agent settings profile a mobile layout ([feccd99](https://github.com/alexj11324/orvilo1/commit/feccd99))
- **selectors**: resolve active topic through every loaded bucket ([6b4b003](https://github.com/alexj11324/orvilo1/commit/6b4b003))
- **topics**: flatten workspace query row type after leftJoin ([1bd4e37](https://github.com/alexj11324/orvilo1/commit/1bd4e37))
- **ui**: clean up #403 visual/IA fallout + native-controls CI gate, closes [#403](https://github.com/alexj11324/orvilo1/issues/403) ([bb5213c](https://github.com/alexj11324/orvilo1/commit/bb5213c))
- **kanban**: drop stale groupBy arg in status choice call ([46b59f6](https://github.com/alexj11324/orvilo1/commit/46b59f6))
- **workflow-badge**: token-scale text sizes (Linear token gate) ([d7b8fea](https://github.com/alexj11324/orvilo1/commit/d7b8fea))
- **chat**: widen topicId prop for nullable conversation context ([40456ea](https://github.com/alexj11324/orvilo1/commit/40456ea))
- **agents**: force card layout and wrapped controls on mobile ([295248b](https://github.com/alexj11324/orvilo1/commit/295248b))
- **chat**: evict stale topics and fall back to the conversation list ([16068fd](https://github.com/alexj11324/orvilo1/commit/16068fd))
- **mobile**: persist last-used agent id and read it for new conversations ([f95ed23](https://github.com/alexj11324/orvilo1/commit/f95ed23))
- **settings**: load common namespace for the Agents row label ([58bbd03](https://github.com/alexj11324/orvilo1/commit/58bbd03))
- **mobile**: load global stylesheet in mobile entry, hide kbd hint on touch ([0b8b756](https://github.com/alexj11324/orvilo1/commit/0b8b756))
- **watchdog-test**: cover settle-path model methods, expect paused projection ([659ca7f](https://github.com/alexj11324/orvilo1/commit/659ca7f))
- **settlement**: satisfy strict updateStatus overloads and test typings ([15b285a](https://github.com/alexj11324/orvilo1/commit/15b285a))
- **misc**: pass children inside Provider props in useAgentId test ([d567de7](https://github.com/alexj11324/orvilo1/commit/d567de7))
- **misc**: /settings/agents shadowed by workspace slug; topic list agentId projection; task-agent labels ([09df8df](https://github.com/alexj11324/orvilo1/commit/09df8df))
- **hetero-agents**: satisfy augmented ProcessEnv in keep-alive tests ([3e3bd64](https://github.com/alexj11324/orvilo1/commit/3e3bd64))
- **server**: gate goal-mode dispatch on builtin-tool mount capability ([d81bc78](https://github.com/alexj11324/orvilo1/commit/d81bc78))
- **typography**: font-semibold on workflow-state picker rows ([b29d058](https://github.com/alexj11324/orvilo1/commit/b29d058))
- **typography**: align type ramp, mono IDs and timestamps to design tokens ([f1a659f](https://github.com/alexj11324/orvilo1/commit/f1a659f))
- **types**: exclude vendored aegis sources from repo typecheck ([e37e9f7](https://github.com/alexj11324/orvilo1/commit/e37e9f7))
- **server**: converge orphaned dispatches on stale ops and admission deadlocks ([5784fd9](https://github.com/alexj11324/orvilo1/commit/5784fd9))
- **server**: ack duplicate hetero callbacks after operation settles ([ff26dbc](https://github.com/alexj11324/orvilo1/commit/ff26dbc))
- **server**: unwrap TRPCError in sweeps and defer candidate column projection ([bdbd516](https://github.com/alexj11324/orvilo1/commit/bdbd516))
- **server**: bound dispatch sweeps and add backlog intake ([2f69c9d](https://github.com/alexj11324/orvilo1/commit/2f69c9d))
- **mywork**: rename workQueryVirtualList.ts to fix case-insensitive collision ([f51a559](https://github.com/alexj11324/orvilo1/commit/f51a559))
- **inbox**: keep snooze labels as literal keys for typed t() ([3e0f951](https://github.com/alexj11324/orvilo1/commit/3e0f951))
- **inbox**: menu keydown leak + token/skeleton gates ([d814dce](https://github.com/alexj11324/orvilo1/commit/d814dce))
- **inbox**: drop preventDefault in row option click guard ([5a02b5f](https://github.com/alexj11324/orvilo1/commit/5a02b5f))
- **issue-detail**: clear typecheck, e2e, and docs gates for Plane layout ([a7c2da0](https://github.com/alexj11324/orvilo1/commit/a7c2da0))
- **sidebar**: keep namespaced i18n keys in WorkspaceSwitcher aria labels ([2b01fca](https://github.com/alexj11324/orvilo1/commit/2b01fca))
- **provider**: type ModelList Search variant against SearchBar props ([c8ea193](https://github.com/alexj11324/orvilo1/commit/c8ea193))
- **work-query**: page rows that share a timestamp ([cc4fc73](https://github.com/alexj11324/orvilo1/commit/cc4fc73))
- **issue-detail**: open the status menu on workflow-linked issues ([39e979b](https://github.com/alexj11324/orvilo1/commit/39e979b))
- **work-query**: align issue list types with board and my-work lanes ([d56107b](https://github.com/alexj11324/orvilo1/commit/d56107b))
- **provider-binding**: name canonical seam types so overloaded typeof stays substitutable ([26ea777](https://github.com/alexj11324/orvilo1/commit/26ea777))
- **issues**: page project groups, previews, and visibility ([8c7aff3](https://github.com/alexj11324/orvilo1/commit/8c7aff3))
- **work-query**: group lists by milestone and agent ([4fb704b](https://github.com/alexj11324/orvilo1/commit/4fb704b))
- **saved-views**: name group headers and keep list lanes ([a6de126](https://github.com/alexj11324/orvilo1/commit/a6de126))
- **issues**: page filtered project lists by their group ([5c46e3c](https://github.com/alexj11324/orvilo1/commit/5c46e3c))
- **control-plane**: satisfy tsgo ProcessEnv overload in acceptance spawns ([43b6b27](https://github.com/alexj11324/orvilo1/commit/43b6b27))
- **work-query**: keep list group headers stuck to the scroll area ([ffc7914](https://github.com/alexj11324/orvilo1/commit/ffc7914))
- **work-query**: drop load more when a group page is exactly full ([f141f70](https://github.com/alexj11324/orvilo1/commit/f141f70))
- **server**: resolve embedded runner artifact lazily so bundlers never trace dist/ ([c6aad5f](https://github.com/alexj11324/orvilo1/commit/c6aad5f))
- **work-query**: reject operators a field does not support ([f8c0583](https://github.com/alexj11324/orvilo1/commit/f8c0583))
- **saved-views**: type the group-by menu against existing copy ([ced58b3](https://github.com/alexj11324/orvilo1/commit/ced58b3))
- **work-query**: order activity pages and list headers ([5a4712e](https://github.com/alexj11324/orvilo1/commit/5a4712e))
- **misc**: categorize experienceMemory, mcpEvents, providerBinding API-key scopes ([74b051b](https://github.com/alexj11324/orvilo1/commit/74b051b))

#### What's improved

- **topics**: cursor-paginate the workspace conversation feed ([b98d438](https://github.com/alexj11324/orvilo1/commit/b98d438))
- **work-query**: split Status/Execution axes, saved-view schema v2 ([70dca8e](https://github.com/alexj11324/orvilo1/commit/70dca8e))
- **topics**: workspace-wide conversation feed for the sidebar ([74f37f2](https://github.com/alexj11324/orvilo1/commit/74f37f2))
- **chat**: make lastUsedAgentId the only new-topic default source ([f4d2b80](https://github.com/alexj11324/orvilo1/commit/f4d2b80))
- **mobile**: rebuild 会话 tab as conversation list, fix tab-bar overlay ([f8ac3b4](https://github.com/alexj11324/orvilo1/commit/f8ac3b4))
- **misc**: topic-centric agent workspace + Settings→Agents config exile ([a77b6c2](https://github.com/alexj11324/orvilo1/commit/a77b6c2))
- **group-chat**: purpose-free creation, instant entry, agent pickers, top-level nav ([e75bc0f](https://github.com/alexj11324/orvilo1/commit/e75bc0f))
- **hetero-agents**: per-engine prompt-cache keep-alive for idle ACP sessions ([a0626ed](https://github.com/alexj11324/orvilo1/commit/a0626ed))
- **hetero**: fuse aegis method pack into verify + artifact pipeline ([6ff43ff](https://github.com/alexj11324/orvilo1/commit/6ff43ff))
- **server**: tiered intake matching with escalate-on-failure ([74339da](https://github.com/alexj11324/orvilo1/commit/74339da))
- **database,types**: add agent tier carrier on roster and dispatch rows ([d4ee26e](https://github.com/alexj11324/orvilo1/commit/d4ee26e))
- **inbox**: row-shaped loading skeleton for the list column ([38dadd2](https://github.com/alexj11324/orvilo1/commit/38dadd2))
- **inbox**: rework inbox as Plane-style All/Mentions feed ([b832fce](https://github.com/alexj11324/orvilo1/commit/b832fce))
- **issue-detail**: move relations into sidebar fields like Linear ([e2d6242](https://github.com/alexj11324/orvilo1/commit/e2d6242))
- **settings**: workspace switcher replaces logo header on settings sidebar ([8145c87](https://github.com/alexj11324/orvilo1/commit/8145c87))
- **provider-binding**: execution.ts compat superset for #367's execAgent, closes [#367](https://github.com/alexj11324/orvilo1/issues/367) ([e91b9e1](https://github.com/alexj11324/orvilo1/commit/e91b9e1))
- **issue-detail**: align relations and workflow with Plane ([89e321b](https://github.com/alexj11324/orvilo1/commit/89e321b))
- **saved-views**: restore list grouping axes and a second group ([c75f919](https://github.com/alexj11324/orvilo1/commit/c75f919))
- **server**: route orvilo dispatches to the embedded Prime host behind prime_embedded_dispatch ([5d28b8c](https://github.com/alexj11324/orvilo1/commit/5d28b8c))
- **controlPlane**: embedded runtime host composition option + artifact verification ([f9a6d78](https://github.com/alexj11324/orvilo1/commit/f9a6d78))
- **agent-execution**: embedded harness broker inference bridge ([532fce8](https://github.com/alexj11324/orvilo1/commit/532fce8))
- **misc**: restore P30-retired provider settings UI and client-side inference runtime ([9e9ab63](https://github.com/alexj11324/orvilo1/commit/9e9ab63))
- **prime-harness**: first-party harness runner package ([fc84547](https://github.com/alexj11324/orvilo1/commit/fc84547))
- **agent-execution**: embedded-Prime harness wire protocol, transport, runtime ([679736e](https://github.com/alexj11324/orvilo1/commit/679736e))
- **work-query**: page grouped lists and virtualize them ([e651e59](https://github.com/alexj11324/orvilo1/commit/e651e59))
- **providerBinding**: BYOK execution chain — mint fenced credentials into Orvilo agent runs ([823c91e](https://github.com/alexj11324/orvilo1/commit/823c91e))
- **work-query**: board axes, swimlanes, and shared filters ([d3dc1d3](https://github.com/alexj11324/orvilo1/commit/d3dc1d3))
- **misc**: add durable MCP event consumer with guarded execution ([e2aa719](https://github.com/alexj11324/orvilo1/commit/e2aa719))

#### Code Refactoring

- **tasks**: Issue kanban shows workflow only, split status picker/execution badge ([e991687](https://github.com/alexj11324/orvilo1/commit/e991687))
- **server**: restore terminal throw in dispatch admission catch ([6628818](https://github.com/alexj11324/orvilo1/commit/6628818))
- **controlPlane**: remove prime_embedded_dispatch flag — orvilo tasks always run embedded Prime ([b5c967f](https://github.com/alexj11324/orvilo1/commit/b5c967f))
- **sidebar**: workspace switcher moves to main sidebar header; settings rails go headerless ([d936e68](https://github.com/alexj11324/orvilo1/commit/d936e68))

#### Styles

- **issue-detail**: text-xs scale class + mono identifiers for Linear tokens ([f92bff4](https://github.com/alexj11324/orvilo1/commit/f92bff4))
- **issue-detail**: mono font for relation identifiers like Linear's ID tokens ([f947203](https://github.com/alexj11324/orvilo1/commit/f947203))
- **issue-detail**: match Plane property rows and title ([d6f1dfc](https://github.com/alexj11324/orvilo1/commit/d6f1dfc))

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

## [Version 2.5.0](https://github.com/alexj11324/orvilo1/compare/v2.4.2-canary.8...v2.5.0)

<sup>Released on **2026-09-30**</sup>

#### 🐛 Bug Fixes

- **test**: point chunk-error toast mock at @/components/toast.
- **ui**: restore WideScreenContainer style merge + non-modal menus.
- **ui**: restore column direction on migrated bare Flexbox sites.
- **oauth**: set consent loading on form submit so POST is not cancelled.
- **oauth**: set authorize loading on form submit, assert device POST in e2e.
- **e2e**: locate confirm popups by alertdialog role.
- **tasks**: surface schedule dialog API failures via localized toasts.
- **misc**: persist milestone reorders after sortable drag.
- **ts**: repair migration-induced type errors in AgentViewAll/ConnectAgent/WorkingDirectory.
- **ts**: repair migration-induced type errors in AgentSetting/Automations/AgentViewAll/AgentMockDevtools.
- **ts**: repair migration-induced type errors in Conversation + ChatInput.
- **ts**: repair migration-induced type errors in Home/Work/DevPanel/PageEditor.
- **ui**: repair b11b migration regressions — missing cn imports, duplicate className, type-only modal imports, leaked div type prop, compact ToolTag variant, accordion action hover, signin link semantics.
- **ui**: use Select adapter default export in pagination and schema fields.
- **ui**: convert className string-literal codemod artifacts to real expressions + retarget dead lobehub base-ui test mocks (b13).
- **ui**: import named Textarea in teammate invite.
- **settings**: expose migrated form item rows.
- **conversation**: ErrorAlert self-hides on close + params-loading testid back in Skeleton mock.
- **reui**: restore migrated sidebar and conversation flows.
- **modal**: preserve content during exit.
- **ui**: restore content lost during ReUI migration.
- **ui**: restore hover popover, TextArea row bounds and stepper states after ReUI migration.
- **ui**: drop leftover lobehub flex props on plain divs.
- **ui**: restore lobehub Flexbox column default after ReUI migration.
- **ImageSearchRef**: use anchor as popover trigger instead of nested interactive wrapper.
- **sidebar**: fall back to global icon rail while collapsed on panel routes.
- **sidebar**: skeleton on panel routes while registering + key panel swaps by navKey.
- **workspace**: keep slug unresolved while workspace list has no data (fixes cold-load false 404).
- **settings-sidebar**: drop empty groups, plain group labels, user icon fallback, back-row nowrap.
- **sidebar**: scope global search row to the home nav, not the column.
- **sidebar**: wrap settings panels in SideBarLayout for scroll/tooltip chrome.
- **misc**: repair 8 typecheck errors from ReUI migration and sidebar-merge rewrite.
- **ci**: diff Linear Tokens gate via refs/pull/N/head instead of capped gh pr diff.
- **ci**: diff Linear Tokens gate via refs/pull/N/head instead of capped gh pr diff.
- **misc**: restore route nav panels beside global sidebar via in-page RoutePanelColumn.
- **context-menu**: accept NativeContextMenuItem in sidebar menu props.
- **misc**: light sidebar palette on web under light theme.
- **misc**: theme-aware sidebar + keep modal alive under open Selects.
- **misc**: suspend modal outside-dismiss while dialog Select is open.
- **misc**: drop empty cn-menu-target utility breaking Tailwind build.

#### ♻️ Code Refactoring

- **ui**: mop up last lobehub/antd residual imports.
- **ui**: migrate HotkeyHelperPanel Tabs to ReUI primitives.
- **ui**: migrate MCP/PluginDevModal/PluginTag to ReUI primitives.
- **ui**: remove duplicate Ollama guide content after migration.
- **ui**: migrate b11b features to ReUI primitives.
- **ui**: migrate app shells/components/store/layout to ReUI (b9).
- **ui**: migrate builtin-tool packages + shared-tool-ui off lobehub base-ui to ReUI (b12).
- **ui**: migrate AgentSetting/Auth/Electron/ResourceManager/Settings/User off lobehub base-ui to ReUI (b7).
- **ui**: migrate Acceptance/AgentGoals/Automations/DevDock/SelfLearning to ReUI (b6).
- **ui**: migrate LibraryModal/PageEditor/Portal/ResourcePermission/ShareModal to ReUI (b4).

#### ✨ Features

- **ui**: add shadcn breadcrumb primitive for antd Breadcrumb migration.
- **sidebar**: swap route panels into the single sidebar column (Linear-style).
- **misc**: wire due-date + remind-me into task surfaces, migrate rail pickers to ReUI.
- **misc**: add task dueDate + per-user reminders with sweep delivery.
- **misc**: expand task context menu with labels, project, favorite, rename, copy variants.

#### 💄 Styles

- **misc**: rebuild schedule dialog on ReUI schedule composition, define cn-menu utilities.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's fixed

- **test**: point chunk-error toast mock at @/components/toast ([ab4a6e2](https://github.com/alexj11324/orvilo1/commit/ab4a6e2))
- **ui**: restore WideScreenContainer style merge + non-modal menus ([506e3e2](https://github.com/alexj11324/orvilo1/commit/506e3e2))
- **ui**: restore column direction on migrated bare Flexbox sites ([5528e1a](https://github.com/alexj11324/orvilo1/commit/5528e1a))
- **oauth**: set consent loading on form submit so POST is not cancelled ([c606898](https://github.com/alexj11324/orvilo1/commit/c606898))
- **oauth**: set authorize loading on form submit, assert device POST in e2e ([00012b9](https://github.com/alexj11324/orvilo1/commit/00012b9))
- **e2e**: locate confirm popups by alertdialog role ([b0cfbf8](https://github.com/alexj11324/orvilo1/commit/b0cfbf8))
- **tasks**: surface schedule dialog API failures via localized toasts ([ab1b8f0](https://github.com/alexj11324/orvilo1/commit/ab1b8f0))
- **misc**: persist milestone reorders after sortable drag ([808ad2f](https://github.com/alexj11324/orvilo1/commit/808ad2f))
- **ts**: repair migration-induced type errors in AgentViewAll/ConnectAgent/WorkingDirectory ([d9b6937](https://github.com/alexj11324/orvilo1/commit/d9b6937))
- **ts**: repair migration-induced type errors in AgentSetting/Automations/AgentViewAll/AgentMockDevtools ([58fcd89](https://github.com/alexj11324/orvilo1/commit/58fcd89))
- **ts**: repair migration-induced type errors in Conversation + ChatInput ([5397d69](https://github.com/alexj11324/orvilo1/commit/5397d69))
- **ts**: repair migration-induced type errors in Home/Work/DevPanel/PageEditor ([f6271ed](https://github.com/alexj11324/orvilo1/commit/f6271ed))
- **ui**: repair b11b migration regressions — missing cn imports, duplicate className, type-only modal imports, leaked div type prop, compact ToolTag variant, accordion action hover, signin link semantics ([5a3c1bc](https://github.com/alexj11324/orvilo1/commit/5a3c1bc))
- **ui**: use Select adapter default export in pagination and schema fields ([ef0981f](https://github.com/alexj11324/orvilo1/commit/ef0981f))
- **ui**: convert className string-literal codemod artifacts to real expressions + retarget dead lobehub base-ui test mocks (b13) ([14ea167](https://github.com/alexj11324/orvilo1/commit/14ea167))
- **ui**: import named Textarea in teammate invite ([8b65a88](https://github.com/alexj11324/orvilo1/commit/8b65a88))
- **settings**: expose migrated form item rows ([b08a227](https://github.com/alexj11324/orvilo1/commit/b08a227))
- **conversation**: ErrorAlert self-hides on close + params-loading testid back in Skeleton mock ([777284e](https://github.com/alexj11324/orvilo1/commit/777284e))
- **reui**: restore migrated sidebar and conversation flows ([c1f3c67](https://github.com/alexj11324/orvilo1/commit/c1f3c67))
- **modal**: preserve content during exit ([638d59e](https://github.com/alexj11324/orvilo1/commit/638d59e))
- **ui**: restore content lost during ReUI migration ([a9dba98](https://github.com/alexj11324/orvilo1/commit/a9dba98))
- **ui**: restore hover popover, TextArea row bounds and stepper states after ReUI migration ([c3a2806](https://github.com/alexj11324/orvilo1/commit/c3a2806))
- **ui**: drop leftover lobehub flex props on plain divs ([92f1760](https://github.com/alexj11324/orvilo1/commit/92f1760))
- **ui**: restore lobehub Flexbox column default after ReUI migration ([c74a07b](https://github.com/alexj11324/orvilo1/commit/c74a07b))
- **ImageSearchRef**: use anchor as popover trigger instead of nested interactive wrapper ([5ba87f5](https://github.com/alexj11324/orvilo1/commit/5ba87f5))
- **sidebar**: fall back to global icon rail while collapsed on panel routes ([6172177](https://github.com/alexj11324/orvilo1/commit/6172177))
- **sidebar**: skeleton on panel routes while registering + key panel swaps by navKey ([2420b01](https://github.com/alexj11324/orvilo1/commit/2420b01))
- **workspace**: keep slug unresolved while workspace list has no data (fixes cold-load false 404) ([18bdc8d](https://github.com/alexj11324/orvilo1/commit/18bdc8d))
- **settings-sidebar**: drop empty groups, plain group labels, user icon fallback, back-row nowrap ([08512e5](https://github.com/alexj11324/orvilo1/commit/08512e5))
- **sidebar**: scope global search row to the home nav, not the column ([f615ee8](https://github.com/alexj11324/orvilo1/commit/f615ee8))
- **sidebar**: wrap settings panels in SideBarLayout for scroll/tooltip chrome ([90715d9](https://github.com/alexj11324/orvilo1/commit/90715d9))
- **misc**: repair 8 typecheck errors from ReUI migration and sidebar-merge rewrite ([36ac5d7](https://github.com/alexj11324/orvilo1/commit/36ac5d7))
- **ci**: diff Linear Tokens gate via refs/pull/N/head instead of capped gh pr diff ([b3be820](https://github.com/alexj11324/orvilo1/commit/b3be820))
- **ci**: diff Linear Tokens gate via refs/pull/N/head instead of capped gh pr diff ([4d794f9](https://github.com/alexj11324/orvilo1/commit/4d794f9))
- **misc**: restore route nav panels beside global sidebar via in-page RoutePanelColumn ([33966ef](https://github.com/alexj11324/orvilo1/commit/33966ef))
- **context-menu**: accept NativeContextMenuItem in sidebar menu props ([061f20e](https://github.com/alexj11324/orvilo1/commit/061f20e))
- **misc**: light sidebar palette on web under light theme ([a63362b](https://github.com/alexj11324/orvilo1/commit/a63362b))
- **misc**: theme-aware sidebar + keep modal alive under open Selects ([cd39c8a](https://github.com/alexj11324/orvilo1/commit/cd39c8a))
- **misc**: suspend modal outside-dismiss while dialog Select is open ([cc5bfc1](https://github.com/alexj11324/orvilo1/commit/cc5bfc1))
- **misc**: drop empty cn-menu-target utility breaking Tailwind build ([6d4bf00](https://github.com/alexj11324/orvilo1/commit/6d4bf00))

#### Code Refactoring

- **ui**: mop up last lobehub/antd residual imports ([d3ee67c](https://github.com/alexj11324/orvilo1/commit/d3ee67c))
- **ui**: migrate HotkeyHelperPanel Tabs to ReUI primitives ([8abbe4a](https://github.com/alexj11324/orvilo1/commit/8abbe4a))
- **ui**: migrate MCP/PluginDevModal/PluginTag to ReUI primitives ([f08e456](https://github.com/alexj11324/orvilo1/commit/f08e456))
- **ui**: remove duplicate Ollama guide content after migration ([3d86823](https://github.com/alexj11324/orvilo1/commit/3d86823))
- **ui**: migrate b11b features to ReUI primitives ([ce6a1b1](https://github.com/alexj11324/orvilo1/commit/ce6a1b1))
- **ui**: migrate app shells/components/store/layout to ReUI (b9) ([25ab7c9](https://github.com/alexj11324/orvilo1/commit/25ab7c9))
- **ui**: migrate builtin-tool packages + shared-tool-ui off lobehub base-ui to ReUI (b12) ([61fcee6](https://github.com/alexj11324/orvilo1/commit/61fcee6))
- **ui**: migrate AgentSetting/Auth/Electron/ResourceManager/Settings/User off lobehub base-ui to ReUI (b7) ([e323409](https://github.com/alexj11324/orvilo1/commit/e323409))
- **ui**: migrate Acceptance/AgentGoals/Automations/DevDock/SelfLearning to ReUI (b6) ([50d0fc8](https://github.com/alexj11324/orvilo1/commit/50d0fc8))
- **ui**: migrate LibraryModal/PageEditor/Portal/ResourcePermission/ShareModal to ReUI (b4) ([a9b71e6](https://github.com/alexj11324/orvilo1/commit/a9b71e6))

#### What's improved

- **ui**: add shadcn breadcrumb primitive for antd Breadcrumb migration ([d837246](https://github.com/alexj11324/orvilo1/commit/d837246))
- **sidebar**: swap route panels into the single sidebar column (Linear-style) ([f720c41](https://github.com/alexj11324/orvilo1/commit/f720c41))
- **misc**: wire due-date + remind-me into task surfaces, migrate rail pickers to ReUI ([385d855](https://github.com/alexj11324/orvilo1/commit/385d855))
- **misc**: add task dueDate + per-user reminders with sweep delivery ([d887456](https://github.com/alexj11324/orvilo1/commit/d887456))
- **misc**: expand task context menu with labels, project, favorite, rename, copy variants ([88b32bc](https://github.com/alexj11324/orvilo1/commit/88b32bc))

#### Styles

- **misc**: rebuild schedule dialog on ReUI schedule composition, define cn-menu utilities ([13f1703](https://github.com/alexj11324/orvilo1/commit/13f1703))

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### [Version 2.4.1](https://github.com/alexj11324/orvilo1/compare/v2.4.0...v2.4.1)

<sup>Released on **2026-09-29**</sup>

#### 🐛 Bug Fixes

- **ci**: skip Cloud overlay resolution when no overlay repo is configured.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's fixed

- **ci**: skip Cloud overlay resolution when no overlay repo is configured ([0165fe6](https://github.com/alexj11324/orvilo1/commit/0165fe6))

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### [Version 2.3.1](https://github.com/alexj11324/orvilo1/compare/v2.3.0...v2.3.1)

<sup>Released on **2026-09-28**</sup>

#### 🐛 Bug Fixes

- **auth**: link pre-Clerk users by email in session exchange.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's fixed

- **auth**: link pre-Clerk users by email in session exchange, closes [#314](https://github.com/alexj11324/orvilo1/issues/314) ([79c009a](https://github.com/alexj11324/orvilo1/commit/79c009a))

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

## [Version 2.3.0](https://github.com/alexj11324/orvilo1/compare/v0.0.0-nightly.pr196.1086...v2.3.0)

<sup>Released on **2026-09-28**</sup>

#### 🐛 Bug Fixes

- **deploy**: stop flagging CLERK_SECRET_KEY as deprecated.
- **auth**: align Google return-target fallback test with product-home default.
- **auth**: strip Better Auth HMAC signature from legacy session cookie.
- **memory**: keep ProgressIcon segments visible in info layout.
- **lint**: migrate banned antd components to @lobehub/ui.
- **board**: restore column surface frame on task board.
- **auth**: serve portal assets same-origin, fold legacy auth pages into /login.
- **cloudflare**: target owned account.
- **ci**: run worker deploy jobs in the production environment.
- **auth**: answer /v1/contract at the worker, bare portal chrome.
- **auth**: pass CLERK_PROXY_URL through the worker document injection.
- **auth**: wire clerk proxyUrl knob + hook-test the sign-in flow.
- **onboarding**: seed one blank invite row on the invite step.
- **dev**: serve debug-proxy page via next.config rewrite on self-hosted deploys.
- **boot**: pin sans font stack on loading brand.
- **onboarding**: auto-fill workspace URL from workspace name.
- **linear**: copy synced issues into selected import project.
- **linear**: dispatch every import page and verify Electron flow.
- **linear**: split team catalog query below complexity limit.
- **linear**: share concurrent catalog token refresh.
- **linear**: use organization-scoped GraphQL fields in sync catalog.
- **imports**: style the Linear importer and retire the old entry.
- **deploy**: sync repo compose files to the host before pull/up.
- **collaboration**: deploy the gateway service; fail closed on non-ws client URL.
- **collaboration**: conceal via the public gateway URL and replay presence on refresh.
- **reviews**: keep both detail views mounted so drafts survive; author comment-only scope; honest branch label.
- **collaboration**: narrow publish union before reading kick scope in gateway handshake error.
- **linear-import**: close review findings — cascade project FK, lease renewal, failed-job requeue, link-claim dedup, install refresh.
- **reviews**: narrow the detail response in the write-gate capability test.
- **reviews**: keep OAuth watch past the poll timeout; only revoke grants on grant errors.
- **linear**: stop querying unsupported oauthClientId and surface GraphQL errors.
- **reviews**: group merge-ready PRs by GitHub state.
- **misc**: classify Linear import API key access.
- **misc**: open Linear import OAuth in desktop browser.
- **reviews**: open GitHub authorization before async work.
- **misc**: satisfy Linear importer typecheck.
- **settings**: hide Subscription nav group when business features are off.
- **projects**: stop rejecting committed milestone writes on refresh errors and harden CSV export.
- **api-keys**: categorize the githubOAuth namespace as blocked for restricted keys.
- **tasks**: match Linear issue-detail rail and body type scale.
- **e2e**: align task-prerequisites locators with renamed related-issue copy.
- **teams**: group the Team Issues list by workflow state like the board.
- **tasks**: one Status row on the issue rail — the workflow state, like Linear.
- **issue**: keep Related links nonblocking and symmetric.
- **issue**: align detail geometry and workflow status marks.
- **teams**: align Recent issues icons and right rail.
- **desktop**: run pre-app-init before main-app captures userData.
- **chat**: settle at bottom promptly after a reply; poll for it in AGENT-SCROLL-001.
- **desktop**: reject non-builtin externals in pre-app-init guard.
- **desktop**: run pre-app-init before main-app captures userData.
- **scripts**: correct container name in setup-test-postgres-db.sh.
- **misc**: narrow agencyConfig before deleting heterogeneousProvider.
- **misc**: bind the inbox builtin agent to the builtin orvilo harness at creation.
- **locales**: drop orphaned orvilo-message builtin keys.
- **desktop**: regenerate pnpm-lock after chat-adapter-imessage dep removal.
- **topic**: normalize agentId null→undefined for createTopic mutation input.
- **slimming**: repair ORV-106 typecheck collateral — replace retired image/video model types in tests, drop parameters card case.
- **slimming**: repair ORV-105 typecheck collateral — delete bot-metadata icon readers, platformIcon lib, dead message runtime test ref.
- **slimming**: restore skills.categories.\* locale keys still used by useSkillCategory (ORV-104).
- **slimming**: repair ORV-104 typecheck collateral — restore live mcp locale keys, drop dead marketPlugin lookup, fix tests.
- **db**: renumber remediation migrations contiguously 0177–0185 + restore canary 0176 snapshot.
- **types**: CreateTopicParams.agentId drops null — wire schema is z.string().optional().
- **topic**: create topics via agentId — sessionId=\<agt\_\*> violates topics_session_id FK for agent-first agents.
- **reviews**: intent-derived operationIds, unknown-outcome UX, generation-bound pager.
- **reviews**: claim-based write dedup with remoteId-pinned reconcile.
- **connect-agent**: persist executionTarget=local + boundDeviceId on local hetero agent creation.
- **projects**: scope Issues count to caller-readable tasks.
- **review**: read diff side from thread fields, not comment nodes.
- **reviews**: persist review receipts with atomic replay re-authorization.
- **locales**: flatten project list/overview/properties keys to match source.
- **views**: literal-key typing for visibility label resolver.
- **server-test**: supply required observedHeadSha in write-gate inputs.
- **server-test**: supply required observedHeadSha in write-gate inputs.
- **server-test**: supply required observedHeadSha in write-gate inputs.
- **e2e**: resend second message when the topic-switch remount swallows Enter.
- **board**: field-sorted views must not write manual position.
- **server**: predicate-first workQuery filter schema + PR review write gate.
- **views**: private saved views no longer labeled Workspace; project tabs match by section.
- **project**: typecheck — Flexbox wrap prop + preserve taskCount on cached list updates.
- **git,cli**: fail closed on leftover .reclaim tickets — never check-then-unlink residue (SC02).
- **aiAgent**: require claim-pinned window/scope on token-path approvals (SC03).
- **misc**: serialize dead-lock reclaim through a single-writer ticket (SC02).
- **taskRunner**: park retryable prepare-stage failures so same-key retry re-adopts the bound approval (SC05).
- **device-control**: satisfy addGitWorktreeClaimed required claimToken contract (SC01).
- **project**: Avatar title accepts string|undefined — coerce null.
- **desktop**: load entry script with an absolute path.
- **taskWorkspace**: negotiate claim capability before add — never delete without credential (SC01).
- **git**: make the repo-file mutex owner-verified and liveness-based (SC02).
- **misc**: bind approval decisions and consumes to their claim/dispatch (SC03+SC05).
- **cli**: childResultInbox repairTail — byte-boundary tail scan + cross-process file lock.
- **conversation**: resolve desktop agent coordinate from chat store when route has no aid.
- **judgment**: keep unconfirmed launches in cancel_requested; reconcile failed launches before throwing.
- **database**: null-safe fence_seq definition check in 0182.
- **titlebar**: resolve common-namespace titleKeys in tab/document titles.
- **aiGeneration**: return the never-typed failAndTrace.
- **ai-generation**: trace judgment abort/timeout legs (53eb73fa onto merged tree).
- **route-meta**: resolve titleKeys across electron + common namespaces.
- **router**: register project conversation route — composer send no longer drops the message.
- **db**: never let a nullable first column null out a joined object.
- **db**: never let a nullable first column null out a joined object.
- **db**: never let a nullable first column null out a joined object.
- **db**: never let a nullable first column null out a joined object.
- **aiGeneration**: register durable judgment launches before dispatch (SB10).
- **taskRunner**: explicit run intent + authorized replan via approval grants (SB08).
- **device-control**: verify worktree claim tokens against host registry (SB01).
- **git**: SB05 — cross-process push-fence mutex + persisted remote-write intent.
- **reviews**: drop duplicated probe tests merged alongside wave contract.
- **attention**: favorites resolve task titles by route identifier; reviews degrade probe failure to connect-state.
- **attention**: favorites resolve task titles by route identifier; reviews degrade probe failure to connect-state.
- **attention**: favorites resolve task titles by route identifier; reviews degrade probe failure to connect-state.
- **attention**: favorites resolve task titles by route identifier; reviews degrade probe failure to connect-state.
- **attention**: favorites resolve task titles by route identifier; reviews degrade probe failure to connect-state.
- **ci**: SB12 residual — global diagnostics parsed, unknown categories block, tree-sha bound to HEAD^{tree}.
- **misc**: receipt workspace_id FK + renew argsHash rebind (E2E follow-up).
- **ci**: typecheckDiff — unindented runner noise no longer extends last diagnostic (phantom hard-new).
- **conversation**: settle at bottom when a pinned stream ends naturally.
- **conversation**: settle at bottom when a pinned stream ends naturally.
- **conversation**: settle at bottom when a pinned stream ends naturally.
- **conversation**: settle at bottom when a pinned stream ends naturally.
- **chat**: narrow session_complete union before reading status.
- **chat**: narrow session_complete union before reading status.
- **chat**: narrow session_complete union before reading status.
- **chat**: narrow session_complete union before reading status.
- **chat**: reuse live local op on gateway reconnect.
- **chat**: reuse live local op on gateway reconnect.
- **chat**: reuse live local op on gateway reconnect.
- **chat**: reuse live local op on gateway reconnect.
- **agentRun**: never drop agent_runtime_end at MAX_INFLIGHT — strands client op running + queue.
- **agentRun**: never drop agent_runtime_end at MAX_INFLIGHT — strands client op running + queue.
- **agentRun**: never drop agent_runtime_end at MAX_INFLIGHT — strands client op running + queue.
- **agentRun**: never drop agent_runtime_end at MAX_INFLIGHT — strands client op running + queue.
- **deps**: pin @hugeicons/core-free-icons to 4.3.3 — 4.3.4 ships broken esm index.
- **chat**: arm send detection on list mount, not just context switches.
- **chat**: arm send detection on list mount, not just context switches.
- **chat**: arm send detection on list mount, not just context switches.
- **chat**: arm send detection on list mount, not just context switches.
- **chat**: pin the just-sent row when topic adoption lands it pre-seeded.
- **chat**: pin the just-sent row when topic adoption lands it pre-seeded.
- **chat**: pin the just-sent row when topic adoption lands it pre-seeded.
- **chat**: pin the just-sent row when topic adoption lands it pre-seeded.
- **e2e**: settle the first turn before creating the second topic.
- **e2e**: settle the first turn before creating the second topic.
- **e2e**: settle the first turn before creating the second topic.
- **e2e**: settle the first turn before creating the second topic.
- **task-runner**: dep-blocked claims release to backlog; manual completion is a valid delivery.
- **scroll**: resolve tail-appended ids whose role map lags a commit.
- **scroll**: resolve tail-appended ids whose role map lags a commit.
- **scroll**: resolve tail-appended ids whose role map lags a commit.
- **scroll**: resolve tail-appended ids whose role map lags a commit.
- **misc**: approval scope CAS, window rotation + grant epoch, durable child-result ACK.
- **database**: tool-approval decision window CAS + delivery receipt state reader.
- **dispatch**: persist origin + verified settlement grants + final admission recheck (SA05-B).
- **taskRunner**: run intents + immutable source contracts + fail-closed dependency reads (SA05-A).
- **server**: tri-state merge outcomes keep the write-ahead intent on lost responses (SA03-A).
- **workspace**: bind worktree claims to canonical physical identity (SA01-A).
- **scroll**: keep spacer armed while the reply outgrows the viewport.
- **scroll**: keep spacer armed while the reply outgrows the viewport.
- **scroll**: keep spacer armed while the reply outgrows the viewport.
- **scroll**: keep spacer armed while the reply outgrows the viewport.
- **e2e**: gate new-topic click on in-flight send; emit scroll hook debug logs.
- **e2e**: gate new-topic click on in-flight send; emit scroll hook debug logs.
- **e2e**: gate new-topic click on in-flight send; emit scroll hook debug logs.
- **e2e**: gate new-topic click on in-flight send; emit scroll hook debug logs.
- **ci**: SB12 — mandatory head-log envelope, untruncated multi-line diagnostic matching, checkout-bound live runs.
- **ai-generation**: SB10+SB11 — physical cancel authority, total-budget dispatch, intentKey reconcile, honest judgment traces.
- **ci**: one psql -c per ALTER SYSTEM statement.
- **ci**: one psql -c per ALTER SYSTEM statement.
- **ci**: one psql -c per ALTER SYSTEM statement.
- **ci**: one psql -c per ALTER SYSTEM statement.
- **migrations**: strict-monotonic journal — 0179 when inverted past 0178 skipped fence_seq on staged upgrades (X01).
- **chat**: pin detection tolerates split/extra-row send commits.
- **chat**: pin detection tolerates split/extra-row send commits.
- **chat**: pin detection tolerates split/extra-row send commits.
- **chat**: pin detection tolerates split/extra-row send commits.
- **e2e**: always re-press Enter on persist miss + pin-failure dump.
- **e2e**: always re-press Enter on persist miss + pin-failure dump.
- **e2e**: always re-press Enter on persist miss + pin-failure dump.
- **e2e**: always re-press Enter on persist miss + pin-failure dump.
- **e2e**: raise cucumber step budgets past inner poll windows.
- **e2e**: raise cucumber step budgets past inner poll windows.
- **e2e**: raise cucumber step budgets past inner poll windows.
- **e2e**: raise cucumber step budgets past inner poll windows.
- **e2e**: retry swallowed Enter; poll sidebar topics before switching.
- **e2e**: retry swallowed Enter; poll sidebar topics before switching.
- **e2e**: retry swallowed Enter; poll sidebar topics before switching.
- **e2e**: retry swallowed Enter; poll sidebar topics before switching.
- **server**: SA02 follow-up — external-surface pins expectation; drop retired-provider title test.
- **e2e**: make pin-delta measure null-safe so expect.poll retries.
- **e2e**: make pin-delta measure null-safe so expect.poll retries.
- **e2e**: make pin-delta measure null-safe so expect.poll retries.
- **e2e**: make pin-delta measure null-safe so expect.poll retries.
- **e2e**: read persisted user row from pg directly; measure pin by text.
- **e2e**: read persisted user row from pg directly; measure pin by text.
- **e2e**: read persisted user row from pg directly; measure pin by text.
- **e2e**: read persisted user row from pg directly; measure pin by text.
- **database**: coalesce jsonb null tests — pg_search planner crash guard.
- **e2e**: settle scroll tests on terminal op state, not running-window observation.
- **e2e**: settle scroll tests on terminal op state, not running-window observation.
- **e2e**: settle scroll tests on terminal op state, not running-window observation.
- **e2e**: settle scroll tests on terminal op state, not running-window observation.
- **database**: type integration lease context column as RepoRefLeaseOutcomeContext.
- **acceptance**: SA08 — longest-first root normalization in typecheck diff (/tmp before /private/tmp).
- **quota-identity**: SA07 — revoke confirmation on unidentifiable live sample, scope trust to principal+workspace (F11).
- **agent-execution**: SA06 — durable status wins + hardened judgment contract (F09/F10).
- **task-integration**: SA03 — preserve unknown lease outcomes, remote fence + write-ahead merge intent (F03/F08).
- **task-workspace**: durable workspace claim + orphan recovery queue (SA01 F01/F02/F07).
- **hetero-agents**: drop stale providerBinding exports — module retired in P05.
- **task-integration**: fence remaining repoPath/deviceId reads, type test resolvers.
- **task-integration**: hoist narrowed fields into fenced closures.
- **task-integration**: durable re-drive + in-flight lease heartbeats for R02 review.
- **misc**: fail closed start-intent contract — no success-no-op on idle (R05/F09).
- **task-integration**: R02 — short-lived repo/ref lease with owner fencing (F03).
- **e2e**: re-open agents context menu when target item has not resolved.
- **permissions**: admit caller's own unfiled rows in workspace scope.
- **e2e**: re-open agents context menu when target item has not resolved.
- **permissions**: admit caller's own unfiled rows in workspace scope.
- **permissions**: admit caller's own unfiled rows in workspace scope.
- **permissions**: admit caller's own unfiled rows in workspace scope.
- **test**: satisfy zero-arg getLatestReadings mock signature.
- **task-runner**: immutable contract content + pinned base SHA provenance (F07).
- **quota**: bind quota observation to confirmed execution identity (R09/F11).
- **agent-execution**: terminal-status whitelist + durable child-result delivery ledger (F06).
- **agent**: builtin slug guard treats unfiled rows as in-scope.
- **agent**: builtin slug guard treats unfiled rows as in-scope.
- **agent**: builtin slug guard treats unfiled rows as in-scope.
- **task-workspace**: import GitWorktreePathInspection type where used.
- **task-workspace**: prove worktree ownership via device inspection, never force-remove (F01/F02).
- **test**: satisfy ProcessEnv required keys in extension contract fixture.
- **test**: satisfy ProcessEnv required keys in extension contract fixture.
- **test**: satisfy ProcessEnv required keys in extension contract fixture.
- **test**: satisfy ProcessEnv required keys in extension contract fixture.
- **task-delivery-review**: guard null topicId before integration patch.
- **hetero-agents**: update gatewayEventHandler test to createLiveAdapter.
- **hetero-agents**: widen historicalDecoderRegistry to Record for string-keyed lookup.
- **task**: admit own unfiled rows in raw-SQL ownership clause.
- **task**: admit own unfiled rows in raw-SQL ownership clause.
- **task**: admit own unfiled rows in raw-SQL ownership clause.
- **task**: admit own unfiled rows in raw-SQL ownership clause.
- **agent**: expose workspaceId on builtin-agent payload type.
- **agent**: expose workspaceId on builtin-agent payload type.
- **agent**: expose workspaceId on builtin-agent payload type.
- **agent**: expose workspaceId on builtin-agent payload type.
- **store**: drop retired showSidebarHidden from persisted view-options type.
- **permission**: move isWorkspaceScopedMeta to a leaf module.
- **permission**: move isWorkspaceScopedMeta to a leaf module.
- **permission**: move isWorkspaceScopedMeta to a leaf module.
- **permission**: move isWorkspaceScopedMeta to a leaf module.
- **agent**: never cache a builtin row under the wrong workspace scope.
- **agent**: never cache a builtin row under the wrong workspace scope.
- **agent**: never cache a builtin row under the wrong workspace scope.
- **permission**: admit own unfiled rows inside workspace scope.
- **permission**: admit own unfiled rows inside workspace scope.
- **permission**: admit own unfiled rows inside workspace scope.
- **permission**: admit own unfiled rows inside workspace scope.
- **retire**: put back the three locale keys live UI still reads.
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak.
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak.
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak.
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak.
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak.
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak.
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak.
- **notification**: lookahead over-fetch past the 50-row feed cap so hasMore can be true.
- **WorkInbox**: scope feed tail, drafts and decision ops to request identity; split detail on IssueContent.
- **members**: ActionIcon title → aria-label inside popup triggers; extract directoryRows.
- **reviews**: synthesize file headers on hunk-only patches; advance queue load-more cursor.
- **reviews**: v6 repair — schema-valid queries, review sessions, write binding, paging, checks rollup, Linear work surface.
- **work-attention**: keep predicate nodes through saved-view save; stream project picker pages.
- **work-attention**: v6 data/query repairs — OR round-trip, board sortMode, scoped pickers, real activity.
- **inbox**: keep relative-time helper in InboxModal until L4 deletes its consumer.
- **work-attention**: keep predicate nodes through saved-view save; stream project picker pages.
- **members**: ActionIcon title → aria-label inside popup triggers; extract directoryRows.
- **work-attention**: v6 data/query repairs — OR round-trip, board sortMode, scoped pickers, real activity.
- **inbox**: keep relative-time helper in InboxModal until L4 deletes its consumer.
- **desktop**: drop session-auth-expired during the pre-init window.
- **desktop**: send sessionless clients to login instead of the expired modal.
- **onboarding**: wait for user-state hydration before mounting the wizard.
- **workspaces**: map Drizzle-wrapped unique violations to CONFLICT.
- **security**: close the N01–N10 audit findings and retire N11–N13.
- **delegation**: fence delegated commits on live grant state, not just the epoch.
- **tasks**: stop the board/list surface from following the task count.
- **server-tests**: declare explicit execution targets in device/workspace provisioning tests.
- **quota**: keep focus revalidation that lands mid-request.
- **client-parity**: address review feedback and align tests with explicit execution targets.
- **branding**: drop the upstream loading wordmark, route desktop deep links.
- **client-parity**: resolve CI typecheck errors.
- **connector**: repair the type errors the retirement left in the release build.
- **retirement**: close the entry points the surface deletion left behind.
- **teammates**: leave must not refresh the departed roster.
- **release**: repair the release-cut script for the canary branch.
- **misc**: harden delegated-run and eval-timeout seams after facade migration.
- **p30**: close sub-agent contract gaps from independent review.
- **p30**: satisfy ExecAgentResult contract in lifecycle gateway mocks.
- **p30**: restore sub-agent spawn contract + supervisor routing, retire stale client-runtime tests.
- **database**: association revoke ordering, quad serialization, test-DB host guard.
- **proxy**: keep asset-dir names routable as workspace slugs.
- **proxy**: exclude backend/framework/asset namespaces from workspace slug.
- **database**: serialize same-quad association apply/revoke.
- **proxy**: cover workspace-scoped and missing root SPA routes in matcher.
- **database**: remove relation rows leaked by out-of-order decision revokes.
- **p30**: restore run-lifecycle fields and aiModel wrapper lost in rebase.
- **test**: drop orphaned describe closer in aiModel action test.
- **onboarding**: persist setup and address review findings.
- **infra**: S3 presign via public endpoint + GHCR tag hygiene.
- **workspace**: reserve /invite first segment in slug guards.
- **teammates**: widen test arg type and sort relative imports.
- **branding**: restore LobeChatProps npm export name (over-broad rename).
- **teammates**: accessible scrolling for member tables + keyboard-operable workspace switcher.
- **collab**: overlapping snapshot replay, fail-closed gateway URL, strict presence payloads, no workspace-as-task targets.
- **delegation**: bind delegated runs to grant.agentId with epoch fencing, durable approval expiry, atomic revoke.
- **teammates**: gate member UI on authorization ceilings.
- **collaboration**: anchor cursors correctly and keep private tasks off the wire.
- **collaboration**: gate top-bar presence on the feature flag.
- **collaboration**: harden room connection lifecycle.
- **auth**: let global RBAC grants pass the workspace membership gate.
- **database**: project grant reads a private workspace project.
- **membership**: gate task reassignment and private roster reads.
- **invite**: harden invitation lifecycle edges.
- **teammates**: close workspaceAgent roster visibility/aggregation gaps.
- **teammates**: honor suspension + workspace binding in authz predicates.
- **teammates**: declare route skeleton meta on invite landing.
- **teammates**: drop antd-style active prop from base-ui SkeletonText.
- **teammates**: whitelist /invite in proxy middleware matcher.
- **collab-ui**: refresh authz data on permanent authorize failure (N2).
- **invite**: no-op project-member role change skips audit/event (N1).
- **collab-ui**: stop infinite authorize retry on permanent failures; project rooms require workspace context; send expectedAuthzVersion.
- **collab**: member.left kicks sockets, kick emits presence-gone, claimed outbox drain, required approval base echo.
- **invite**: no-op project-member removal skips audit; removal preview reads suspended members.
- **database**: claim outbox rows with visibility timeout before publishing.
- **database**: revoke project memberships on workspace-member removal.
- **auth**: emit undefined workspaceRole in personal mode for WorkspaceRowCtx compat.
- **member**: detach task slots in one update + one domain event per task.
- **delegation**: coerce nullable task workspaceId for outbox event params.
- **teammates**: make task_inputs workspace anchor nullable and fix ProjectMemberModel arity.
- **teammates**: emit workspaceRole as undefined and use admin membership in linearSync tests.
- **teammates**: align frontend with base-ui APIs and server contracts.
- **teammates**: align collab/delegation code with drizzle schema + test keys.
- **teammates**: return wrapInternal in catches, scope new namespaces, align audit taxonomy.
- **teammates**: narrow workspace ctx types and mock membership seam in tests.
- **database**: export standalone insertOutboxEvent for tx-executor call sites.
- **collaboration**: route outbox drain through EventOutboxModel lifecycle, ISO ticket expiry.
- **teammates**: align invitation lifecycle with audit taxonomy and room-scoped outbox.
- **tasks**: capture model contract before dispatch.
- **linear**: preserve database retry CAS precision.
- **linear**: persist signed removal tombstones.
- **tasks**: resume integration recovery states.
- **misc**: expose project orchestration settings.
- **misc**: group Linear tasks by business workflow.
- **misc**: harden Linear planning and dispatch recovery.
- **linear**: pass label baseline to merge.
- **linear**: bound task issue link queries.
- **linear**: trust signed issue removals.
- **linear**: enforce outbound public scope.
- **linear**: preserve archived issue tombstones.
- **linear**: validate mapped organization members.
- **linear**: refresh workspace sync status.
- **linear**: lock complete planning read set.
- **tasks**: persist run ownership before dispatch.
- **linear**: guard replanning proposal application.
- **tasks**: stabilize automated run identities.
- **tasks**: fence dispatch lifecycle transitions.
- **linear**: apply persisted planning proposals.
- **linear**: register workspace settings route.
- **linear**: categorize API key scope.
- **linear**: satisfy CI typecheck.

#### ✨ Features

- **auth**: Clerk-backed session layer + portal sign-in redirect.
- **auth**: port accounts portal onto apps/auth worker.
- **connectors**: authorize GitHub MCP with existing GitHub App.
- **connectors**: add direct Linear OAuth entry.
- **collaboration**: render human cursors as the SF pointer arrowhead.
- **reviews**: add layout-matching skeleton for review detail.
- **reviews**: align overview and diff with Linear layout.
- **collaboration**: show human issue cursors with personal visibility control.
- **settings**: replace builtin tools with MCP preset catalog on Connectors page.
- **misc**: add Linear team import wizard.
- **parity**: issue-row and surface alignment base.
- **tasks**: one canonical Linear-shaped status mark per issue row.
- **auth**: adopt ReUI login and onboarding layouts.
- **project**: Linear-shaped overview + projects table — title/properties/resources rows, milestone goals, issue counts.
- **project**: status pill + member avatars in project header.
- **project**: Linear-style properties rail on project overview.
- **project**: Linear-shaped project surface — tabs header + overview body.
- **project**: land /project/:id on the issue collection.
- **task-run**: pass explicit intent from UI/CLI/tool callers (SB08).
- **task-runner**: SA05 — contract identity chain, current-delivery gates + CAID admission at the shared claim boundary (F07/F12).
- **task-dispatch**: CAID admission rollout gate (R10).
- **task-delivery-review**: per-stage poll-failure budgets + merge-accepted reconcile (R07).
- **tool-surface**: mount external connector/MCP tools + strict required-tool admission (F04/F05).
- **goal-experience**: P17 — surface per-node integration state and parallelism control.
- **task-integration**: P15 — serialize same repo/ref integrations and re-baseline stale merges.
- **task-workspace**: P14 — preflight device repo and recover interrupted provisioning.
- **goal**: P13 — re-verify depends_on readiness under the dispatch claim lock.
- **task-runner**: P11 — persist versioned TaskExecutionContract on run rows.
- **tool-surface**: P09 — explicit per-tool mount outcomes for ACP runs.
- **task-dispatch**: P16 — goal-stop dispatch fences and bounded verification polls.
- **goal-manager**: P12 — CAID incremental plan patches with revision CAS.
- **branding**: P03 — Orvilo self-brand surface (ACP clientInfo, release feed, allowlist).
- **notification**: feedCard by-id read endpoint for deep links and decide reconcile.
- **pages**: apply WorkSurface collection skeleton to my issues, teams, projects, views.
- **work-surface**: shared page-frame skeletons, members directory table, IssueContent extraction.
- **nav**: fixed Linear IA hook — inbox/my-issues/reviews/agent rows.
- **sidebar**: Linear sidebar IA + locales + frozen v4 packet docs.
- **surfaces**: Linear-style work surfaces — Inbox, My issues, Reviews, Views, Teams, Members.
- **work-surface**: shared page-frame skeletons, members directory table, IssueContent extraction.
- **nav**: fixed Linear IA hook — inbox/my-issues/reviews/agent rows.
- **sidebar**: Linear sidebar IA + locales + frozen v4 packet docs.
- **surfaces**: Linear-style work surfaces — Inbox, My issues, Reviews, Views, Teams, Members.
- **workspace**: client activation chain — URL sync, workspace store, X-Workspace-Id.
- **sidebar**: Linear sidebar IA + locales + frozen v4 packet docs.
- **surfaces**: Linear-style work surfaces — Inbox, My issues, Reviews, Views, Teams, Members.
- **workspace**: client activation chain — URL sync, workspace store, X-Workspace-Id.
- **db,server**: work-attention data contract — scoped models, routers, and services.
- **acp**: P70d — delete the retired in-process agent engine.
- **agent**: ACP-only execution binding + shared-type detach (P70a + P70b core).
- **acp**: retire builtin orvilo-browser tool chain (P60).
- **tasks**: enforce PR-first delivery review lifecycle.
- **ops**: stamp execution-engine provenance on agent_operations.
- **workspace**: real workspace context in OSS business layer.
- **client-parity**: unify web/desktop control plane and execution contract.
- **misc**: consent-based ownership transfer + member roster workload.
- **teammates**: self-serve workspace leave entry.
- **acp**: remote-run admission ledger and cancellation fencing.
- **linear**: workspace-scope sync, teams and repository associations.
- **teammates**: flag invites whose email failed to send.
- **convergence**: task-first convergence — retire community social backend, workbench, guest execution, memory profiling.
- **teammates**: add /invite/:token landing page for invitation accept.
- **teammates**: workspaceAgent roster router and final lambda wiring.
- **misc**: teammates workspace collaboration frontend.
- **teammates**: invitation, membership and project-member APIs.
- **misc**: add agent delegation + realtime collaboration backend.
- **database**: add teammates collaboration data layer.
- **linear**: sync external comments and relations.
- **linear**: add independent sync rollout controls.
- **linear**: harden OAuth and integration sync boundary.
- **projects**: add bounded orchestration policy settings.
- **linear**: scope incremental replanning ownership.
- **linear**: add sync visibility wizard.
- **tasks**: enforce durable dispatch ownership.
- **tasks**: add orchestration domain contract.
- **linear**: complete workspace sync workflow.
- **linear**: apply versioned planning proposals.
- **linear**: add durable incremental replanning.
- **linear**: enqueue local task changes.
- **linear**: process issue sync inbox.
- **linear**: add workspace sync foundation.

#### ♻️ Code Refactoring

- **settings**: delete the Audit logs settings surface.
- **agent-execution**: P21 — physically delete legacy agent-runtime tails, migrate consumers to agentExecution.
- **hetero-agents**: P07 — split live ACP registry from historical trace decoders.
- **quota**: P06 — retire managed quota accounts and quota-driven routing.
- **provider**: P05 — retire provider binding, server-default relay and orphan model entry points.
- **sidebar**: retire per-item sidebar-visibility subsystem.
- **inbox**: move shared relative-time helper next to its surviving consumer.
- **favorites**: move favorite button+toggle to surfaces layer.
- **inbox**: move shared relative-time helper next to its surviving consumer.
- **favorites**: move favorite button+toggle to surfaces layer.
- **task**: retire the fork's task steering layer.
- **app**: retire provider settings UI and client-side inference runtime (P30).
- **invite**: follow OrviloDatabase rename after canary merge.
- **tasks**: retire the /tasks empty-state hero, empty list renders the board.
- **linear**: run sync workflows through Hatchet.

#### 💄 Styles

- **teammates**: order workspaceAgent imports per repo convention.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's fixed

- **deploy**: stop flagging CLERK_SECRET_KEY as deprecated ([a2b522b](https://github.com/alexj11324/orvilo1/commit/a2b522b))
- **auth**: align Google return-target fallback test with product-home default ([a066a22](https://github.com/alexj11324/orvilo1/commit/a066a22))
- **auth**: strip Better Auth HMAC signature from legacy session cookie ([afef55a](https://github.com/alexj11324/orvilo1/commit/afef55a))
- **memory**: keep ProgressIcon segments visible in info layout ([d53500f](https://github.com/alexj11324/orvilo1/commit/d53500f))
- **lint**: migrate banned antd components to @lobehub/ui ([0cafd97](https://github.com/alexj11324/orvilo1/commit/0cafd97))
- **board**: restore column surface frame on task board ([6cc7c0e](https://github.com/alexj11324/orvilo1/commit/6cc7c0e))
- **auth**: serve portal assets same-origin, fold legacy auth pages into /login ([5e825eb](https://github.com/alexj11324/orvilo1/commit/5e825eb))
- **cloudflare**: target owned account ([9d0b1a6](https://github.com/alexj11324/orvilo1/commit/9d0b1a6))
- **ci**: run worker deploy jobs in the production environment ([76344e4](https://github.com/alexj11324/orvilo1/commit/76344e4))
- **auth**: answer /v1/contract at the worker, bare portal chrome ([40a0988](https://github.com/alexj11324/orvilo1/commit/40a0988))
- **auth**: pass CLERK_PROXY_URL through the worker document injection ([3426993](https://github.com/alexj11324/orvilo1/commit/3426993))
- **auth**: wire clerk proxyUrl knob + hook-test the sign-in flow ([14b8b9c](https://github.com/alexj11324/orvilo1/commit/14b8b9c))
- **onboarding**: seed one blank invite row on the invite step ([503d2b4](https://github.com/alexj11324/orvilo1/commit/503d2b4))
- **dev**: serve debug-proxy page via next.config rewrite on self-hosted deploys ([f9150eb](https://github.com/alexj11324/orvilo1/commit/f9150eb))
- **boot**: pin sans font stack on loading brand ([8e687c0](https://github.com/alexj11324/orvilo1/commit/8e687c0))
- **onboarding**: auto-fill workspace URL from workspace name ([f918b04](https://github.com/alexj11324/orvilo1/commit/f918b04))
- **linear**: copy synced issues into selected import project, closes [#296](https://github.com/alexj11324/orvilo1/issues/296) ([9566846](https://github.com/alexj11324/orvilo1/commit/9566846))
- **linear**: dispatch every import page and verify Electron flow, closes [#292](https://github.com/alexj11324/orvilo1/issues/292) ([5718651](https://github.com/alexj11324/orvilo1/commit/5718651))
- **linear**: split team catalog query below complexity limit, closes [#291](https://github.com/alexj11324/orvilo1/issues/291) ([6f70e8f](https://github.com/alexj11324/orvilo1/commit/6f70e8f))
- **linear**: share concurrent catalog token refresh, closes [#289](https://github.com/alexj11324/orvilo1/issues/289) ([7657d44](https://github.com/alexj11324/orvilo1/commit/7657d44))
- **linear**: use organization-scoped GraphQL fields in sync catalog, closes [#281](https://github.com/alexj11324/orvilo1/issues/281) ([f3b055d](https://github.com/alexj11324/orvilo1/commit/f3b055d))
- **imports**: style the Linear importer and retire the old entry, closes [#282](https://github.com/alexj11324/orvilo1/issues/282) ([fa9ea13](https://github.com/alexj11324/orvilo1/commit/fa9ea13))
- **deploy**: sync repo compose files to the host before pull/up, closes [#279](https://github.com/alexj11324/orvilo1/issues/279) ([5951f37](https://github.com/alexj11324/orvilo1/commit/5951f37))
- **collaboration**: deploy the gateway service; fail closed on non-ws client URL ([25d81b5](https://github.com/alexj11324/orvilo1/commit/25d81b5))
- **collaboration**: conceal via the public gateway URL and replay presence on refresh ([f1f6245](https://github.com/alexj11324/orvilo1/commit/f1f6245))
- **reviews**: keep both detail views mounted so drafts survive; author comment-only scope; honest branch label ([9fa9160](https://github.com/alexj11324/orvilo1/commit/9fa9160))
- **collaboration**: narrow publish union before reading kick scope in gateway handshake error ([bbc715f](https://github.com/alexj11324/orvilo1/commit/bbc715f))
- **linear-import**: close review findings — cascade project FK, lease renewal, failed-job requeue, link-claim dedup, install refresh ([977f91b](https://github.com/alexj11324/orvilo1/commit/977f91b))
- **reviews**: narrow the detail response in the write-gate capability test ([0b5fe96](https://github.com/alexj11324/orvilo1/commit/0b5fe96))
- **reviews**: keep OAuth watch past the poll timeout; only revoke grants on grant errors ([3de6a28](https://github.com/alexj11324/orvilo1/commit/3de6a28))
- **linear**: stop querying unsupported oauthClientId and surface GraphQL errors ([cd9e106](https://github.com/alexj11324/orvilo1/commit/cd9e106))
- **reviews**: group merge-ready PRs by GitHub state ([f99aa33](https://github.com/alexj11324/orvilo1/commit/f99aa33))
- **misc**: classify Linear import API key access ([93ae8c8](https://github.com/alexj11324/orvilo1/commit/93ae8c8))
- **misc**: open Linear import OAuth in desktop browser ([09144f2](https://github.com/alexj11324/orvilo1/commit/09144f2))
- **reviews**: open GitHub authorization before async work ([89f3816](https://github.com/alexj11324/orvilo1/commit/89f3816))
- **misc**: satisfy Linear importer typecheck ([ab292b7](https://github.com/alexj11324/orvilo1/commit/ab292b7))
- **settings**: hide Subscription nav group when business features are off, closes [#269](https://github.com/alexj11324/orvilo1/issues/269) ([5076f16](https://github.com/alexj11324/orvilo1/commit/5076f16))
- **projects**: stop rejecting committed milestone writes on refresh errors and harden CSV export, closes [#267](https://github.com/alexj11324/orvilo1/issues/267) ([b632e5d](https://github.com/alexj11324/orvilo1/commit/b632e5d))
- **api-keys**: categorize the githubOAuth namespace as blocked for restricted keys ([ecaf920](https://github.com/alexj11324/orvilo1/commit/ecaf920))
- **tasks**: match Linear issue-detail rail and body type scale, closes [#244](https://github.com/alexj11324/orvilo1/issues/244) ([3771232](https://github.com/alexj11324/orvilo1/commit/3771232))
- **e2e**: align task-prerequisites locators with renamed related-issue copy, closes [#260](https://github.com/alexj11324/orvilo1/issues/260) ([0e6ccc8](https://github.com/alexj11324/orvilo1/commit/0e6ccc8))
- **teams**: group the Team Issues list by workflow state like the board, closes [#240](https://github.com/alexj11324/orvilo1/issues/240), closes [#258](https://github.com/alexj11324/orvilo1/issues/258) ([9084a52](https://github.com/alexj11324/orvilo1/commit/9084a52))
- **tasks**: one Status row on the issue rail — the workflow state, like Linear, closes [#241](https://github.com/alexj11324/orvilo1/issues/241) ([fcfaca6](https://github.com/alexj11324/orvilo1/commit/fcfaca6))
- **issue**: keep Related links nonblocking and symmetric, closes [#229](https://github.com/alexj11324/orvilo1/issues/229) ([bd2eace](https://github.com/alexj11324/orvilo1/commit/bd2eace))
- **issue**: align detail geometry and workflow status marks, closes [#227](https://github.com/alexj11324/orvilo1/issues/227) ([566c490](https://github.com/alexj11324/orvilo1/commit/566c490))
- **teams**: align Recent issues icons and right rail, closes [#226](https://github.com/alexj11324/orvilo1/issues/226) ([09b9ecd](https://github.com/alexj11324/orvilo1/commit/09b9ecd))
- **desktop**: run pre-app-init before main-app captures userData, closes [#236](https://github.com/alexj11324/orvilo1/issues/236) ([049c900](https://github.com/alexj11324/orvilo1/commit/049c900))
- **chat**: settle at bottom promptly after a reply; poll for it in AGENT-SCROLL-001, closes [#242](https://github.com/alexj11324/orvilo1/issues/242) ([d8e6344](https://github.com/alexj11324/orvilo1/commit/d8e6344))
- **desktop**: reject non-builtin externals in pre-app-init guard ([fb211b9](https://github.com/alexj11324/orvilo1/commit/fb211b9))
- **desktop**: run pre-app-init before main-app captures userData ([99ccf19](https://github.com/alexj11324/orvilo1/commit/99ccf19))
- **scripts**: correct container name in setup-test-postgres-db.sh ([aa852bd](https://github.com/alexj11324/orvilo1/commit/aa852bd))
- **misc**: narrow agencyConfig before deleting heterogeneousProvider ([3793a91](https://github.com/alexj11324/orvilo1/commit/3793a91))
- **misc**: bind the inbox builtin agent to the builtin orvilo harness at creation ([404ccce](https://github.com/alexj11324/orvilo1/commit/404ccce))
- **locales**: drop orphaned orvilo-message builtin keys ([7923002](https://github.com/alexj11324/orvilo1/commit/7923002))
- **desktop**: regenerate pnpm-lock after chat-adapter-imessage dep removal ([6c42de2](https://github.com/alexj11324/orvilo1/commit/6c42de2))
- **topic**: normalize agentId null→undefined for createTopic mutation input ([5b3dc13](https://github.com/alexj11324/orvilo1/commit/5b3dc13))
- **slimming**: repair ORV-106 typecheck collateral — replace retired image/video model types in tests, drop parameters card case ([5cc4d28](https://github.com/alexj11324/orvilo1/commit/5cc4d28))
- **slimming**: repair ORV-105 typecheck collateral — delete bot-metadata icon readers, platformIcon lib, dead message runtime test ref ([cab766f](https://github.com/alexj11324/orvilo1/commit/cab766f))
- **slimming**: restore skills.categories.\* locale keys still used by useSkillCategory (ORV-104) ([e4da9bf](https://github.com/alexj11324/orvilo1/commit/e4da9bf))
- **slimming**: repair ORV-104 typecheck collateral — restore live mcp locale keys, drop dead marketPlugin lookup, fix tests ([bb7bbe4](https://github.com/alexj11324/orvilo1/commit/bb7bbe4))
- **db**: renumber remediation migrations contiguously 0177–0185 + restore canary 0176 snapshot ([ddf8b22](https://github.com/alexj11324/orvilo1/commit/ddf8b22))
- **types**: CreateTopicParams.agentId drops null — wire schema is z.string().optional() ([b908a8d](https://github.com/alexj11324/orvilo1/commit/b908a8d))
- **topic**: create topics via agentId — sessionId=\<agt\_\*> violates topics_session_id FK for agent-first agents ([ff57c4a](https://github.com/alexj11324/orvilo1/commit/ff57c4a))
- **reviews**: intent-derived operationIds, unknown-outcome UX, generation-bound pager ([dbbfb3f](https://github.com/alexj11324/orvilo1/commit/dbbfb3f))
- **reviews**: claim-based write dedup with remoteId-pinned reconcile ([255f359](https://github.com/alexj11324/orvilo1/commit/255f359))
- **connect-agent**: persist executionTarget=local + boundDeviceId on local hetero agent creation ([f52a691](https://github.com/alexj11324/orvilo1/commit/f52a691))
- **projects**: scope Issues count to caller-readable tasks ([99c196b](https://github.com/alexj11324/orvilo1/commit/99c196b))
- **review**: read diff side from thread fields, not comment nodes ([d828d99](https://github.com/alexj11324/orvilo1/commit/d828d99))
- **reviews**: persist review receipts with atomic replay re-authorization ([b20ab93](https://github.com/alexj11324/orvilo1/commit/b20ab93))
- **locales**: flatten project list/overview/properties keys to match source ([1a6c3d4](https://github.com/alexj11324/orvilo1/commit/1a6c3d4))
- **views**: literal-key typing for visibility label resolver ([3a198cd](https://github.com/alexj11324/orvilo1/commit/3a198cd))
- **server-test**: supply required observedHeadSha in write-gate inputs ([3e28901](https://github.com/alexj11324/orvilo1/commit/3e28901))
- **server-test**: supply required observedHeadSha in write-gate inputs ([a76f2be](https://github.com/alexj11324/orvilo1/commit/a76f2be))
- **server-test**: supply required observedHeadSha in write-gate inputs ([78492e4](https://github.com/alexj11324/orvilo1/commit/78492e4))
- **e2e**: resend second message when the topic-switch remount swallows Enter ([0d9f9cf](https://github.com/alexj11324/orvilo1/commit/0d9f9cf))
- **board**: field-sorted views must not write manual position ([cf458c9](https://github.com/alexj11324/orvilo1/commit/cf458c9))
- **server**: predicate-first workQuery filter schema + PR review write gate ([1bbb608](https://github.com/alexj11324/orvilo1/commit/1bbb608))
- **views**: private saved views no longer labeled Workspace; project tabs match by section ([efa3ba2](https://github.com/alexj11324/orvilo1/commit/efa3ba2))
- **project**: typecheck — Flexbox wrap prop + preserve taskCount on cached list updates ([73def8a](https://github.com/alexj11324/orvilo1/commit/73def8a))
- **git,cli**: fail closed on leftover .reclaim tickets — never check-then-unlink residue (SC02) ([f01b745](https://github.com/alexj11324/orvilo1/commit/f01b745))
- **aiAgent**: require claim-pinned window/scope on token-path approvals (SC03) ([8e2f419](https://github.com/alexj11324/orvilo1/commit/8e2f419))
- **misc**: serialize dead-lock reclaim through a single-writer ticket (SC02) ([eefa077](https://github.com/alexj11324/orvilo1/commit/eefa077))
- **taskRunner**: park retryable prepare-stage failures so same-key retry re-adopts the bound approval (SC05) ([b49c972](https://github.com/alexj11324/orvilo1/commit/b49c972))
- **device-control**: satisfy addGitWorktreeClaimed required claimToken contract (SC01) ([a85968c](https://github.com/alexj11324/orvilo1/commit/a85968c))
- **project**: Avatar title accepts string|undefined — coerce null ([cd6a94a](https://github.com/alexj11324/orvilo1/commit/cd6a94a))
- **desktop**: load entry script with an absolute path ([ebc4be6](https://github.com/alexj11324/orvilo1/commit/ebc4be6))
- **taskWorkspace**: negotiate claim capability before add — never delete without credential (SC01) ([6064671](https://github.com/alexj11324/orvilo1/commit/6064671))
- **git**: make the repo-file mutex owner-verified and liveness-based (SC02) ([3078b59](https://github.com/alexj11324/orvilo1/commit/3078b59))
- **misc**: bind approval decisions and consumes to their claim/dispatch (SC03+SC05) ([3bf901f](https://github.com/alexj11324/orvilo1/commit/3bf901f))
- **cli**: childResultInbox repairTail — byte-boundary tail scan + cross-process file lock ([2fe34fe](https://github.com/alexj11324/orvilo1/commit/2fe34fe))
- **conversation**: resolve desktop agent coordinate from chat store when route has no aid ([eb8110d](https://github.com/alexj11324/orvilo1/commit/eb8110d))
- **judgment**: keep unconfirmed launches in cancel_requested; reconcile failed launches before throwing ([a4299f6](https://github.com/alexj11324/orvilo1/commit/a4299f6))
- **database**: null-safe fence_seq definition check in 0182 ([d0ae158](https://github.com/alexj11324/orvilo1/commit/d0ae158))
- **titlebar**: resolve common-namespace titleKeys in tab/document titles ([9a2ca20](https://github.com/alexj11324/orvilo1/commit/9a2ca20))
- **aiGeneration**: return the never-typed failAndTrace ([9ac1590](https://github.com/alexj11324/orvilo1/commit/9ac1590))
- **ai-generation**: trace judgment abort/timeout legs (53eb73fa onto merged tree) ([dd7be7b](https://github.com/alexj11324/orvilo1/commit/dd7be7b))
- **route-meta**: resolve titleKeys across electron + common namespaces ([6269fd2](https://github.com/alexj11324/orvilo1/commit/6269fd2))
- **router**: register project conversation route — composer send no longer drops the message ([591148f](https://github.com/alexj11324/orvilo1/commit/591148f))
- **db**: never let a nullable first column null out a joined object ([bd9a39f](https://github.com/alexj11324/orvilo1/commit/bd9a39f))
- **db**: never let a nullable first column null out a joined object ([8733150](https://github.com/alexj11324/orvilo1/commit/8733150))
- **db**: never let a nullable first column null out a joined object ([86ea85e](https://github.com/alexj11324/orvilo1/commit/86ea85e))
- **db**: never let a nullable first column null out a joined object ([ae72eb4](https://github.com/alexj11324/orvilo1/commit/ae72eb4))
- **aiGeneration**: register durable judgment launches before dispatch (SB10) ([f79b2e8](https://github.com/alexj11324/orvilo1/commit/f79b2e8))
- **taskRunner**: explicit run intent + authorized replan via approval grants (SB08) ([d69221c](https://github.com/alexj11324/orvilo1/commit/d69221c))
- **device-control**: verify worktree claim tokens against host registry (SB01) ([f375998](https://github.com/alexj11324/orvilo1/commit/f375998))
- **git**: SB05 — cross-process push-fence mutex + persisted remote-write intent ([4ab5d9a](https://github.com/alexj11324/orvilo1/commit/4ab5d9a))
- **reviews**: drop duplicated probe tests merged alongside wave contract ([75da07e](https://github.com/alexj11324/orvilo1/commit/75da07e))
- **attention**: favorites resolve task titles by route identifier; reviews degrade probe failure to connect-state ([e375623](https://github.com/alexj11324/orvilo1/commit/e375623))
- **attention**: favorites resolve task titles by route identifier; reviews degrade probe failure to connect-state ([fab55df](https://github.com/alexj11324/orvilo1/commit/fab55df))
- **attention**: favorites resolve task titles by route identifier; reviews degrade probe failure to connect-state ([818d627](https://github.com/alexj11324/orvilo1/commit/818d627))
- **attention**: favorites resolve task titles by route identifier; reviews degrade probe failure to connect-state ([5a6f3f0](https://github.com/alexj11324/orvilo1/commit/5a6f3f0))
- **attention**: favorites resolve task titles by route identifier; reviews degrade probe failure to connect-state ([c90f46d](https://github.com/alexj11324/orvilo1/commit/c90f46d))
- **ci**: SB12 residual — global diagnostics parsed, unknown categories block, tree-sha bound to HEAD^{tree} ([33ccd47](https://github.com/alexj11324/orvilo1/commit/33ccd47))
- **misc**: receipt workspace_id FK + renew argsHash rebind (E2E follow-up) ([e48df97](https://github.com/alexj11324/orvilo1/commit/e48df97))
- **ci**: typecheckDiff — unindented runner noise no longer extends last diagnostic (phantom hard-new) ([66389af](https://github.com/alexj11324/orvilo1/commit/66389af))
- **conversation**: settle at bottom when a pinned stream ends naturally ([9e357d4](https://github.com/alexj11324/orvilo1/commit/9e357d4))
- **conversation**: settle at bottom when a pinned stream ends naturally ([032c770](https://github.com/alexj11324/orvilo1/commit/032c770))
- **conversation**: settle at bottom when a pinned stream ends naturally ([633330a](https://github.com/alexj11324/orvilo1/commit/633330a))
- **conversation**: settle at bottom when a pinned stream ends naturally ([d5aa09c](https://github.com/alexj11324/orvilo1/commit/d5aa09c))
- **chat**: narrow session_complete union before reading status ([8b7de9d](https://github.com/alexj11324/orvilo1/commit/8b7de9d))
- **chat**: narrow session_complete union before reading status ([7935f30](https://github.com/alexj11324/orvilo1/commit/7935f30))
- **chat**: narrow session_complete union before reading status ([bd8ccfe](https://github.com/alexj11324/orvilo1/commit/bd8ccfe))
- **chat**: narrow session_complete union before reading status ([03db7ef](https://github.com/alexj11324/orvilo1/commit/03db7ef))
- **chat**: reuse live local op on gateway reconnect ([87c4d33](https://github.com/alexj11324/orvilo1/commit/87c4d33))
- **chat**: reuse live local op on gateway reconnect ([a61a7a3](https://github.com/alexj11324/orvilo1/commit/a61a7a3))
- **chat**: reuse live local op on gateway reconnect ([aa1b3f9](https://github.com/alexj11324/orvilo1/commit/aa1b3f9))
- **chat**: reuse live local op on gateway reconnect ([18a08c4](https://github.com/alexj11324/orvilo1/commit/18a08c4))
- **agentRun**: never drop agent_runtime_end at MAX_INFLIGHT — strands client op running + queue ([6375a21](https://github.com/alexj11324/orvilo1/commit/6375a21))
- **agentRun**: never drop agent_runtime_end at MAX_INFLIGHT — strands client op running + queue ([b53e04c](https://github.com/alexj11324/orvilo1/commit/b53e04c))
- **agentRun**: never drop agent_runtime_end at MAX_INFLIGHT — strands client op running + queue ([adccfd4](https://github.com/alexj11324/orvilo1/commit/adccfd4))
- **agentRun**: never drop agent_runtime_end at MAX_INFLIGHT — strands client op running + queue ([6b4c566](https://github.com/alexj11324/orvilo1/commit/6b4c566))
- **deps**: pin @hugeicons/core-free-icons to 4.3.3 — 4.3.4 ships broken esm index, closes [#159](https://github.com/alexj11324/orvilo1/issues/159) ([a54f781](https://github.com/alexj11324/orvilo1/commit/a54f781))
- **chat**: arm send detection on list mount, not just context switches ([e388e5d](https://github.com/alexj11324/orvilo1/commit/e388e5d))
- **chat**: arm send detection on list mount, not just context switches ([e1a8b36](https://github.com/alexj11324/orvilo1/commit/e1a8b36))
- **chat**: arm send detection on list mount, not just context switches ([f5e8aeb](https://github.com/alexj11324/orvilo1/commit/f5e8aeb))
- **chat**: arm send detection on list mount, not just context switches ([fd68bfc](https://github.com/alexj11324/orvilo1/commit/fd68bfc))
- **chat**: pin the just-sent row when topic adoption lands it pre-seeded ([a4e4804](https://github.com/alexj11324/orvilo1/commit/a4e4804))
- **chat**: pin the just-sent row when topic adoption lands it pre-seeded ([4fdef51](https://github.com/alexj11324/orvilo1/commit/4fdef51))
- **chat**: pin the just-sent row when topic adoption lands it pre-seeded ([ab4fcec](https://github.com/alexj11324/orvilo1/commit/ab4fcec))
- **chat**: pin the just-sent row when topic adoption lands it pre-seeded ([bb3eed5](https://github.com/alexj11324/orvilo1/commit/bb3eed5))
- **e2e**: settle the first turn before creating the second topic ([9af10af](https://github.com/alexj11324/orvilo1/commit/9af10af))
- **e2e**: settle the first turn before creating the second topic ([8a7de3f](https://github.com/alexj11324/orvilo1/commit/8a7de3f))
- **e2e**: settle the first turn before creating the second topic ([45a1f64](https://github.com/alexj11324/orvilo1/commit/45a1f64))
- **e2e**: settle the first turn before creating the second topic ([4864840](https://github.com/alexj11324/orvilo1/commit/4864840))
- **task-runner**: dep-blocked claims release to backlog; manual completion is a valid delivery ([b7410ac](https://github.com/alexj11324/orvilo1/commit/b7410ac))
- **scroll**: resolve tail-appended ids whose role map lags a commit ([7075f94](https://github.com/alexj11324/orvilo1/commit/7075f94))
- **scroll**: resolve tail-appended ids whose role map lags a commit ([f9dd807](https://github.com/alexj11324/orvilo1/commit/f9dd807))
- **scroll**: resolve tail-appended ids whose role map lags a commit ([6511a75](https://github.com/alexj11324/orvilo1/commit/6511a75))
- **scroll**: resolve tail-appended ids whose role map lags a commit ([ef0301b](https://github.com/alexj11324/orvilo1/commit/ef0301b))
- **misc**: approval scope CAS, window rotation + grant epoch, durable child-result ACK ([a199bf6](https://github.com/alexj11324/orvilo1/commit/a199bf6))
- **database**: tool-approval decision window CAS + delivery receipt state reader ([b6106d2](https://github.com/alexj11324/orvilo1/commit/b6106d2))
- **dispatch**: persist origin + verified settlement grants + final admission recheck (SA05-B) ([aeb48fe](https://github.com/alexj11324/orvilo1/commit/aeb48fe))
- **taskRunner**: run intents + immutable source contracts + fail-closed dependency reads (SA05-A) ([3971a48](https://github.com/alexj11324/orvilo1/commit/3971a48))
- **server**: tri-state merge outcomes keep the write-ahead intent on lost responses (SA03-A) ([d9b62b1](https://github.com/alexj11324/orvilo1/commit/d9b62b1))
- **workspace**: bind worktree claims to canonical physical identity (SA01-A) ([fd01e85](https://github.com/alexj11324/orvilo1/commit/fd01e85))
- **scroll**: keep spacer armed while the reply outgrows the viewport ([8377690](https://github.com/alexj11324/orvilo1/commit/8377690))
- **scroll**: keep spacer armed while the reply outgrows the viewport ([cefd905](https://github.com/alexj11324/orvilo1/commit/cefd905))
- **scroll**: keep spacer armed while the reply outgrows the viewport ([bd675e5](https://github.com/alexj11324/orvilo1/commit/bd675e5))
- **scroll**: keep spacer armed while the reply outgrows the viewport ([fc5eed9](https://github.com/alexj11324/orvilo1/commit/fc5eed9))
- **e2e**: gate new-topic click on in-flight send; emit scroll hook debug logs ([acc314b](https://github.com/alexj11324/orvilo1/commit/acc314b))
- **e2e**: gate new-topic click on in-flight send; emit scroll hook debug logs ([c5677ed](https://github.com/alexj11324/orvilo1/commit/c5677ed))
- **e2e**: gate new-topic click on in-flight send; emit scroll hook debug logs ([0f17923](https://github.com/alexj11324/orvilo1/commit/0f17923))
- **e2e**: gate new-topic click on in-flight send; emit scroll hook debug logs ([d5f94b6](https://github.com/alexj11324/orvilo1/commit/d5f94b6))
- **ci**: SB12 — mandatory head-log envelope, untruncated multi-line diagnostic matching, checkout-bound live runs ([3ad30f5](https://github.com/alexj11324/orvilo1/commit/3ad30f5))
- **ai-generation**: SB10+SB11 — physical cancel authority, total-budget dispatch, intentKey reconcile, honest judgment traces ([65ac55f](https://github.com/alexj11324/orvilo1/commit/65ac55f))
- **ci**: one psql -c per ALTER SYSTEM statement ([81f661d](https://github.com/alexj11324/orvilo1/commit/81f661d))
- **ci**: one psql -c per ALTER SYSTEM statement ([d83a553](https://github.com/alexj11324/orvilo1/commit/d83a553))
- **ci**: one psql -c per ALTER SYSTEM statement ([34d8ce9](https://github.com/alexj11324/orvilo1/commit/34d8ce9))
- **ci**: one psql -c per ALTER SYSTEM statement ([677815a](https://github.com/alexj11324/orvilo1/commit/677815a))
- **migrations**: strict-monotonic journal — 0179 when inverted past 0178 skipped fence_seq on staged upgrades (X01) ([490ff12](https://github.com/alexj11324/orvilo1/commit/490ff12))
- **chat**: pin detection tolerates split/extra-row send commits ([aed2d11](https://github.com/alexj11324/orvilo1/commit/aed2d11))
- **chat**: pin detection tolerates split/extra-row send commits ([bfe6b3d](https://github.com/alexj11324/orvilo1/commit/bfe6b3d))
- **chat**: pin detection tolerates split/extra-row send commits ([775cb91](https://github.com/alexj11324/orvilo1/commit/775cb91))
- **chat**: pin detection tolerates split/extra-row send commits ([1d1556e](https://github.com/alexj11324/orvilo1/commit/1d1556e))
- **e2e**: always re-press Enter on persist miss + pin-failure dump ([00187f8](https://github.com/alexj11324/orvilo1/commit/00187f8))
- **e2e**: always re-press Enter on persist miss + pin-failure dump ([f5e5cf0](https://github.com/alexj11324/orvilo1/commit/f5e5cf0))
- **e2e**: always re-press Enter on persist miss + pin-failure dump ([54778d5](https://github.com/alexj11324/orvilo1/commit/54778d5))
- **e2e**: always re-press Enter on persist miss + pin-failure dump ([079e4ac](https://github.com/alexj11324/orvilo1/commit/079e4ac))
- **e2e**: raise cucumber step budgets past inner poll windows ([8a8091f](https://github.com/alexj11324/orvilo1/commit/8a8091f))
- **e2e**: raise cucumber step budgets past inner poll windows ([4f50042](https://github.com/alexj11324/orvilo1/commit/4f50042))
- **e2e**: raise cucumber step budgets past inner poll windows ([cc27a9d](https://github.com/alexj11324/orvilo1/commit/cc27a9d))
- **e2e**: raise cucumber step budgets past inner poll windows ([d8e4927](https://github.com/alexj11324/orvilo1/commit/d8e4927))
- **e2e**: retry swallowed Enter; poll sidebar topics before switching ([3cbf8e0](https://github.com/alexj11324/orvilo1/commit/3cbf8e0))
- **e2e**: retry swallowed Enter; poll sidebar topics before switching ([cdbd37f](https://github.com/alexj11324/orvilo1/commit/cdbd37f))
- **e2e**: retry swallowed Enter; poll sidebar topics before switching ([44ffebe](https://github.com/alexj11324/orvilo1/commit/44ffebe))
- **e2e**: retry swallowed Enter; poll sidebar topics before switching ([9c71c6c](https://github.com/alexj11324/orvilo1/commit/9c71c6c))
- **server**: SA02 follow-up — external-surface pins expectation; drop retired-provider title test ([110f3c3](https://github.com/alexj11324/orvilo1/commit/110f3c3))
- **e2e**: make pin-delta measure null-safe so expect.poll retries ([c772c2e](https://github.com/alexj11324/orvilo1/commit/c772c2e))
- **e2e**: make pin-delta measure null-safe so expect.poll retries ([0fafd4e](https://github.com/alexj11324/orvilo1/commit/0fafd4e))
- **e2e**: make pin-delta measure null-safe so expect.poll retries ([d61ea0c](https://github.com/alexj11324/orvilo1/commit/d61ea0c))
- **e2e**: make pin-delta measure null-safe so expect.poll retries ([19c3770](https://github.com/alexj11324/orvilo1/commit/19c3770))
- **e2e**: read persisted user row from pg directly; measure pin by text ([0019648](https://github.com/alexj11324/orvilo1/commit/0019648))
- **e2e**: read persisted user row from pg directly; measure pin by text ([f97d247](https://github.com/alexj11324/orvilo1/commit/f97d247))
- **e2e**: read persisted user row from pg directly; measure pin by text ([346e8de](https://github.com/alexj11324/orvilo1/commit/346e8de))
- **e2e**: read persisted user row from pg directly; measure pin by text ([e817f6a](https://github.com/alexj11324/orvilo1/commit/e817f6a))
- **database**: coalesce jsonb null tests — pg_search planner crash guard ([4bddcbe](https://github.com/alexj11324/orvilo1/commit/4bddcbe))
- **e2e**: settle scroll tests on terminal op state, not running-window observation ([80c64aa](https://github.com/alexj11324/orvilo1/commit/80c64aa))
- **e2e**: settle scroll tests on terminal op state, not running-window observation ([7fa2be8](https://github.com/alexj11324/orvilo1/commit/7fa2be8))
- **e2e**: settle scroll tests on terminal op state, not running-window observation ([cc1f20f](https://github.com/alexj11324/orvilo1/commit/cc1f20f))
- **e2e**: settle scroll tests on terminal op state, not running-window observation ([48796d4](https://github.com/alexj11324/orvilo1/commit/48796d4))
- **database**: type integration lease context column as RepoRefLeaseOutcomeContext ([ef8ae31](https://github.com/alexj11324/orvilo1/commit/ef8ae31))
- **acceptance**: SA08 — longest-first root normalization in typecheck diff (/tmp before /private/tmp) ([69bdba3](https://github.com/alexj11324/orvilo1/commit/69bdba3))
- **quota-identity**: SA07 — revoke confirmation on unidentifiable live sample, scope trust to principal+workspace (F11) ([03b7e0f](https://github.com/alexj11324/orvilo1/commit/03b7e0f))
- **agent-execution**: SA06 — durable status wins + hardened judgment contract (F09/F10) ([c3c1cd5](https://github.com/alexj11324/orvilo1/commit/c3c1cd5))
- **task-integration**: SA03 — preserve unknown lease outcomes, remote fence + write-ahead merge intent (F03/F08) ([a1846d9](https://github.com/alexj11324/orvilo1/commit/a1846d9))
- **task-workspace**: durable workspace claim + orphan recovery queue (SA01 F01/F02/F07) ([ad9333f](https://github.com/alexj11324/orvilo1/commit/ad9333f))
- **hetero-agents**: drop stale providerBinding exports — module retired in P05 ([0750d82](https://github.com/alexj11324/orvilo1/commit/0750d82))
- **task-integration**: fence remaining repoPath/deviceId reads, type test resolvers ([f28f270](https://github.com/alexj11324/orvilo1/commit/f28f270))
- **task-integration**: hoist narrowed fields into fenced closures ([88c314d](https://github.com/alexj11324/orvilo1/commit/88c314d))
- **task-integration**: durable re-drive + in-flight lease heartbeats for R02 review ([24cad7c](https://github.com/alexj11324/orvilo1/commit/24cad7c))
- **misc**: fail closed start-intent contract — no success-no-op on idle (R05/F09) ([925d612](https://github.com/alexj11324/orvilo1/commit/925d612))
- **task-integration**: R02 — short-lived repo/ref lease with owner fencing (F03) ([d629ec6](https://github.com/alexj11324/orvilo1/commit/d629ec6))
- **e2e**: re-open agents context menu when target item has not resolved ([ab17923](https://github.com/alexj11324/orvilo1/commit/ab17923))
- **permissions**: admit caller's own unfiled rows in workspace scope ([621955c](https://github.com/alexj11324/orvilo1/commit/621955c))
- **e2e**: re-open agents context menu when target item has not resolved ([b8fb69c](https://github.com/alexj11324/orvilo1/commit/b8fb69c))
- **permissions**: admit caller's own unfiled rows in workspace scope ([f1783d6](https://github.com/alexj11324/orvilo1/commit/f1783d6))
- **permissions**: admit caller's own unfiled rows in workspace scope ([9ff4f8d](https://github.com/alexj11324/orvilo1/commit/9ff4f8d))
- **permissions**: admit caller's own unfiled rows in workspace scope ([237fbc3](https://github.com/alexj11324/orvilo1/commit/237fbc3))
- **test**: satisfy zero-arg getLatestReadings mock signature ([bc85827](https://github.com/alexj11324/orvilo1/commit/bc85827))
- **task-runner**: immutable contract content + pinned base SHA provenance (F07) ([c21b6f2](https://github.com/alexj11324/orvilo1/commit/c21b6f2))
- **quota**: bind quota observation to confirmed execution identity (R09/F11) ([e77bb68](https://github.com/alexj11324/orvilo1/commit/e77bb68))
- **agent-execution**: terminal-status whitelist + durable child-result delivery ledger (F06) ([79d5f9b](https://github.com/alexj11324/orvilo1/commit/79d5f9b))
- **agent**: builtin slug guard treats unfiled rows as in-scope ([2b76779](https://github.com/alexj11324/orvilo1/commit/2b76779))
- **agent**: builtin slug guard treats unfiled rows as in-scope ([0caaea8](https://github.com/alexj11324/orvilo1/commit/0caaea8))
- **agent**: builtin slug guard treats unfiled rows as in-scope ([4b4ff3b](https://github.com/alexj11324/orvilo1/commit/4b4ff3b))
- **task-workspace**: import GitWorktreePathInspection type where used ([946e5d9](https://github.com/alexj11324/orvilo1/commit/946e5d9))
- **task-workspace**: prove worktree ownership via device inspection, never force-remove (F01/F02) ([23ec725](https://github.com/alexj11324/orvilo1/commit/23ec725))
- **test**: satisfy ProcessEnv required keys in extension contract fixture ([2fc8943](https://github.com/alexj11324/orvilo1/commit/2fc8943))
- **test**: satisfy ProcessEnv required keys in extension contract fixture ([9d1a490](https://github.com/alexj11324/orvilo1/commit/9d1a490))
- **test**: satisfy ProcessEnv required keys in extension contract fixture ([318017a](https://github.com/alexj11324/orvilo1/commit/318017a))
- **test**: satisfy ProcessEnv required keys in extension contract fixture ([51a2b7e](https://github.com/alexj11324/orvilo1/commit/51a2b7e))
- **task-delivery-review**: guard null topicId before integration patch ([b027ff3](https://github.com/alexj11324/orvilo1/commit/b027ff3))
- **hetero-agents**: update gatewayEventHandler test to createLiveAdapter ([3489302](https://github.com/alexj11324/orvilo1/commit/3489302))
- **hetero-agents**: widen historicalDecoderRegistry to Record for string-keyed lookup ([d264bea](https://github.com/alexj11324/orvilo1/commit/d264bea))
- **task**: admit own unfiled rows in raw-SQL ownership clause ([42334b5](https://github.com/alexj11324/orvilo1/commit/42334b5))
- **task**: admit own unfiled rows in raw-SQL ownership clause ([656b1a8](https://github.com/alexj11324/orvilo1/commit/656b1a8))
- **task**: admit own unfiled rows in raw-SQL ownership clause ([7f92a0a](https://github.com/alexj11324/orvilo1/commit/7f92a0a))
- **task**: admit own unfiled rows in raw-SQL ownership clause ([5c323aa](https://github.com/alexj11324/orvilo1/commit/5c323aa))
- **agent**: expose workspaceId on builtin-agent payload type ([4594c65](https://github.com/alexj11324/orvilo1/commit/4594c65))
- **agent**: expose workspaceId on builtin-agent payload type ([fb23930](https://github.com/alexj11324/orvilo1/commit/fb23930))
- **agent**: expose workspaceId on builtin-agent payload type ([f033c4d](https://github.com/alexj11324/orvilo1/commit/f033c4d))
- **agent**: expose workspaceId on builtin-agent payload type ([a9ef5a1](https://github.com/alexj11324/orvilo1/commit/a9ef5a1))
- **store**: drop retired showSidebarHidden from persisted view-options type ([9d5f3e2](https://github.com/alexj11324/orvilo1/commit/9d5f3e2))
- **permission**: move isWorkspaceScopedMeta to a leaf module ([9c61d8e](https://github.com/alexj11324/orvilo1/commit/9c61d8e))
- **permission**: move isWorkspaceScopedMeta to a leaf module ([5f309ef](https://github.com/alexj11324/orvilo1/commit/5f309ef))
- **permission**: move isWorkspaceScopedMeta to a leaf module ([3788d75](https://github.com/alexj11324/orvilo1/commit/3788d75))
- **permission**: move isWorkspaceScopedMeta to a leaf module ([818688e](https://github.com/alexj11324/orvilo1/commit/818688e))
- **agent**: never cache a builtin row under the wrong workspace scope ([333f532](https://github.com/alexj11324/orvilo1/commit/333f532))
- **agent**: never cache a builtin row under the wrong workspace scope ([9875fe7](https://github.com/alexj11324/orvilo1/commit/9875fe7))
- **agent**: never cache a builtin row under the wrong workspace scope ([a0eb8b0](https://github.com/alexj11324/orvilo1/commit/a0eb8b0))
- **permission**: admit own unfiled rows inside workspace scope ([518ccc3](https://github.com/alexj11324/orvilo1/commit/518ccc3))
- **permission**: admit own unfiled rows inside workspace scope ([a7f22ad](https://github.com/alexj11324/orvilo1/commit/a7f22ad))
- **permission**: admit own unfiled rows inside workspace scope ([b5c10fb](https://github.com/alexj11324/orvilo1/commit/b5c10fb))
- **permission**: admit own unfiled rows inside workspace scope ([3fc7bb8](https://github.com/alexj11324/orvilo1/commit/3fc7bb8))
- **retire**: put back the three locale keys live UI still reads ([0256a04](https://github.com/alexj11324/orvilo1/commit/0256a04))
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak ([0529416](https://github.com/alexj11324/orvilo1/commit/0529416))
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak ([e5f10c5](https://github.com/alexj11324/orvilo1/commit/e5f10c5))
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak ([b0a9512](https://github.com/alexj11324/orvilo1/commit/b0a9512))
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak ([5231bbc](https://github.com/alexj11324/orvilo1/commit/5231bbc))
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak ([dbabb1f](https://github.com/alexj11324/orvilo1/commit/dbabb1f))
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak ([aa849ea](https://github.com/alexj11324/orvilo1/commit/aa849ea))
- **deps,db**: pin hugeicons 4.3.3 + deterministic recent-order tiebreak ([7670d39](https://github.com/alexj11324/orvilo1/commit/7670d39))
- **notification**: lookahead over-fetch past the 50-row feed cap so hasMore can be true ([a83d721](https://github.com/alexj11324/orvilo1/commit/a83d721))
- **WorkInbox**: scope feed tail, drafts and decision ops to request identity; split detail on IssueContent ([a69e710](https://github.com/alexj11324/orvilo1/commit/a69e710))
- **members**: ActionIcon title → aria-label inside popup triggers; extract directoryRows ([7b83160](https://github.com/alexj11324/orvilo1/commit/7b83160))
- **reviews**: synthesize file headers on hunk-only patches; advance queue load-more cursor ([bf8f05c](https://github.com/alexj11324/orvilo1/commit/bf8f05c))
- **reviews**: v6 repair — schema-valid queries, review sessions, write binding, paging, checks rollup, Linear work surface ([8b64020](https://github.com/alexj11324/orvilo1/commit/8b64020))
- **work-attention**: keep predicate nodes through saved-view save; stream project picker pages ([453de10](https://github.com/alexj11324/orvilo1/commit/453de10))
- **work-attention**: v6 data/query repairs — OR round-trip, board sortMode, scoped pickers, real activity ([aa0d514](https://github.com/alexj11324/orvilo1/commit/aa0d514))
- **inbox**: keep relative-time helper in InboxModal until L4 deletes its consumer ([59ff0e9](https://github.com/alexj11324/orvilo1/commit/59ff0e9))
- **work-attention**: keep predicate nodes through saved-view save; stream project picker pages ([0f148d3](https://github.com/alexj11324/orvilo1/commit/0f148d3))
- **members**: ActionIcon title → aria-label inside popup triggers; extract directoryRows ([a52e252](https://github.com/alexj11324/orvilo1/commit/a52e252))
- **work-attention**: v6 data/query repairs — OR round-trip, board sortMode, scoped pickers, real activity ([e047cd3](https://github.com/alexj11324/orvilo1/commit/e047cd3))
- **inbox**: keep relative-time helper in InboxModal until L4 deletes its consumer ([cebf5bf](https://github.com/alexj11324/orvilo1/commit/cebf5bf))
- **desktop**: drop session-auth-expired during the pre-init window ([bd46886](https://github.com/alexj11324/orvilo1/commit/bd46886))
- **desktop**: send sessionless clients to login instead of the expired modal ([f9668d8](https://github.com/alexj11324/orvilo1/commit/f9668d8))
- **onboarding**: wait for user-state hydration before mounting the wizard, closes [#104](https://github.com/alexj11324/orvilo1/issues/104) ([f919466](https://github.com/alexj11324/orvilo1/commit/f919466))
- **workspaces**: map Drizzle-wrapped unique violations to CONFLICT, closes [#103](https://github.com/alexj11324/orvilo1/issues/103) ([72eb9d5](https://github.com/alexj11324/orvilo1/commit/72eb9d5))
- **security**: close the N01–N10 audit findings and retire N11–N13, closes [#97](https://github.com/alexj11324/orvilo1/issues/97) ([9843b85](https://github.com/alexj11324/orvilo1/commit/9843b85))
- **delegation**: fence delegated commits on live grant state, not just the epoch, closes [#84](https://github.com/alexj11324/orvilo1/issues/84) ([f8431d3](https://github.com/alexj11324/orvilo1/commit/f8431d3))
- **tasks**: stop the board/list surface from following the task count, closes [#83](https://github.com/alexj11324/orvilo1/issues/83) ([9fced30](https://github.com/alexj11324/orvilo1/commit/9fced30))
- **server-tests**: declare explicit execution targets in device/workspace provisioning tests ([6bb4537](https://github.com/alexj11324/orvilo1/commit/6bb4537))
- **quota**: keep focus revalidation that lands mid-request, closes [#80](https://github.com/alexj11324/orvilo1/issues/80) ([73257df](https://github.com/alexj11324/orvilo1/commit/73257df))
- **client-parity**: address review feedback and align tests with explicit execution targets ([2a2f43f](https://github.com/alexj11324/orvilo1/commit/2a2f43f))
- **branding**: drop the upstream loading wordmark, route desktop deep links ([22801d6](https://github.com/alexj11324/orvilo1/commit/22801d6))
- **client-parity**: resolve CI typecheck errors ([987c169](https://github.com/alexj11324/orvilo1/commit/987c169))
- **connector**: repair the type errors the retirement left in the release build ([6d085c2](https://github.com/alexj11324/orvilo1/commit/6d085c2))
- **retirement**: close the entry points the surface deletion left behind ([a9c8397](https://github.com/alexj11324/orvilo1/commit/a9c8397))
- **teammates**: leave must not refresh the departed roster ([ae29e02](https://github.com/alexj11324/orvilo1/commit/ae29e02))
- **release**: repair the release-cut script for the canary branch ([285f40e](https://github.com/alexj11324/orvilo1/commit/285f40e))
- **misc**: harden delegated-run and eval-timeout seams after facade migration ([244db00](https://github.com/alexj11324/orvilo1/commit/244db00))
- **p30**: close sub-agent contract gaps from independent review ([11bde7a](https://github.com/alexj11324/orvilo1/commit/11bde7a))
- **p30**: satisfy ExecAgentResult contract in lifecycle gateway mocks ([f48e128](https://github.com/alexj11324/orvilo1/commit/f48e128))
- **p30**: restore sub-agent spawn contract + supervisor routing, retire stale client-runtime tests ([ab7a6ea](https://github.com/alexj11324/orvilo1/commit/ab7a6ea))
- **database**: association revoke ordering, quad serialization, test-DB host guard ([b0a1f54](https://github.com/alexj11324/orvilo1/commit/b0a1f54))
- **proxy**: keep asset-dir names routable as workspace slugs, closes [#71](https://github.com/alexj11324/orvilo1/issues/71) ([66925ab](https://github.com/alexj11324/orvilo1/commit/66925ab))
- **proxy**: exclude backend/framework/asset namespaces from workspace slug, closes [#70](https://github.com/alexj11324/orvilo1/issues/70) ([08ff59f](https://github.com/alexj11324/orvilo1/commit/08ff59f))
- **database**: serialize same-quad association apply/revoke ([ef20318](https://github.com/alexj11324/orvilo1/commit/ef20318))
- **proxy**: cover workspace-scoped and missing root SPA routes in matcher, closes [#66](https://github.com/alexj11324/orvilo1/issues/66) ([9efc6a5](https://github.com/alexj11324/orvilo1/commit/9efc6a5))
- **database**: remove relation rows leaked by out-of-order decision revokes ([dd4fd07](https://github.com/alexj11324/orvilo1/commit/dd4fd07))
- **p30**: restore run-lifecycle fields and aiModel wrapper lost in rebase ([aa0ab1a](https://github.com/alexj11324/orvilo1/commit/aa0ab1a))
- **test**: drop orphaned describe closer in aiModel action test ([59b43e3](https://github.com/alexj11324/orvilo1/commit/59b43e3))
- **onboarding**: persist setup and address review findings ([678a1c9](https://github.com/alexj11324/orvilo1/commit/678a1c9))
- **infra**: S3 presign via public endpoint + GHCR tag hygiene, closes [#52](https://github.com/alexj11324/orvilo1/issues/52) ([dc5e471](https://github.com/alexj11324/orvilo1/commit/dc5e471))
- **workspace**: reserve /invite first segment in slug guards ([d300475](https://github.com/alexj11324/orvilo1/commit/d300475))
- **teammates**: widen test arg type and sort relative imports ([3b0cc48](https://github.com/alexj11324/orvilo1/commit/3b0cc48))
- **branding**: restore LobeChatProps npm export name (over-broad rename) ([fd9d8bf](https://github.com/alexj11324/orvilo1/commit/fd9d8bf))
- **teammates**: accessible scrolling for member tables + keyboard-operable workspace switcher ([a26a4e4](https://github.com/alexj11324/orvilo1/commit/a26a4e4))
- **collab**: overlapping snapshot replay, fail-closed gateway URL, strict presence payloads, no workspace-as-task targets ([af8164a](https://github.com/alexj11324/orvilo1/commit/af8164a))
- **delegation**: bind delegated runs to grant.agentId with epoch fencing, durable approval expiry, atomic revoke ([d1f8ecc](https://github.com/alexj11324/orvilo1/commit/d1f8ecc))
- **teammates**: gate member UI on authorization ceilings ([3ba4775](https://github.com/alexj11324/orvilo1/commit/3ba4775))
- **collaboration**: anchor cursors correctly and keep private tasks off the wire ([d45996a](https://github.com/alexj11324/orvilo1/commit/d45996a))
- **collaboration**: gate top-bar presence on the feature flag ([4a12c48](https://github.com/alexj11324/orvilo1/commit/4a12c48))
- **collaboration**: harden room connection lifecycle ([f92116d](https://github.com/alexj11324/orvilo1/commit/f92116d))
- **auth**: let global RBAC grants pass the workspace membership gate ([cf4a700](https://github.com/alexj11324/orvilo1/commit/cf4a700))
- **database**: project grant reads a private workspace project ([29aa894](https://github.com/alexj11324/orvilo1/commit/29aa894))
- **membership**: gate task reassignment and private roster reads ([56aaaf9](https://github.com/alexj11324/orvilo1/commit/56aaaf9))
- **invite**: harden invitation lifecycle edges ([4024b60](https://github.com/alexj11324/orvilo1/commit/4024b60))
- **teammates**: close workspaceAgent roster visibility/aggregation gaps ([35860fd](https://github.com/alexj11324/orvilo1/commit/35860fd))
- **teammates**: honor suspension + workspace binding in authz predicates ([d11733e](https://github.com/alexj11324/orvilo1/commit/d11733e))
- **teammates**: declare route skeleton meta on invite landing ([9cd766c](https://github.com/alexj11324/orvilo1/commit/9cd766c))
- **teammates**: drop antd-style active prop from base-ui SkeletonText ([4713809](https://github.com/alexj11324/orvilo1/commit/4713809))
- **teammates**: whitelist /invite in proxy middleware matcher ([fadf23b](https://github.com/alexj11324/orvilo1/commit/fadf23b))
- **collab-ui**: refresh authz data on permanent authorize failure (N2) ([2257eb0](https://github.com/alexj11324/orvilo1/commit/2257eb0))
- **invite**: no-op project-member role change skips audit/event (N1) ([e70e171](https://github.com/alexj11324/orvilo1/commit/e70e171))
- **collab-ui**: stop infinite authorize retry on permanent failures; project rooms require workspace context; send expectedAuthzVersion ([78426ea](https://github.com/alexj11324/orvilo1/commit/78426ea))
- **collab**: member.left kicks sockets, kick emits presence-gone, claimed outbox drain, required approval base echo ([884ea60](https://github.com/alexj11324/orvilo1/commit/884ea60))
- **invite**: no-op project-member removal skips audit; removal preview reads suspended members ([d1bf4bd](https://github.com/alexj11324/orvilo1/commit/d1bf4bd))
- **database**: claim outbox rows with visibility timeout before publishing ([ff7a572](https://github.com/alexj11324/orvilo1/commit/ff7a572))
- **database**: revoke project memberships on workspace-member removal ([0a373a1](https://github.com/alexj11324/orvilo1/commit/0a373a1))
- **auth**: emit undefined workspaceRole in personal mode for WorkspaceRowCtx compat ([c9fa1e0](https://github.com/alexj11324/orvilo1/commit/c9fa1e0))
- **member**: detach task slots in one update + one domain event per task ([1c17304](https://github.com/alexj11324/orvilo1/commit/1c17304))
- **delegation**: coerce nullable task workspaceId for outbox event params ([66a7d24](https://github.com/alexj11324/orvilo1/commit/66a7d24))
- **teammates**: make task_inputs workspace anchor nullable and fix ProjectMemberModel arity ([3c59e8f](https://github.com/alexj11324/orvilo1/commit/3c59e8f))
- **teammates**: emit workspaceRole as undefined and use admin membership in linearSync tests ([1eff4ff](https://github.com/alexj11324/orvilo1/commit/1eff4ff))
- **teammates**: align frontend with base-ui APIs and server contracts ([97f3e0e](https://github.com/alexj11324/orvilo1/commit/97f3e0e))
- **teammates**: align collab/delegation code with drizzle schema + test keys ([a36ccfa](https://github.com/alexj11324/orvilo1/commit/a36ccfa))
- **teammates**: return wrapInternal in catches, scope new namespaces, align audit taxonomy ([13ffd12](https://github.com/alexj11324/orvilo1/commit/13ffd12))
- **teammates**: narrow workspace ctx types and mock membership seam in tests ([ec62a2c](https://github.com/alexj11324/orvilo1/commit/ec62a2c))
- **database**: export standalone insertOutboxEvent for tx-executor call sites ([034abb6](https://github.com/alexj11324/orvilo1/commit/034abb6))
- **collaboration**: route outbox drain through EventOutboxModel lifecycle, ISO ticket expiry ([c18a0c0](https://github.com/alexj11324/orvilo1/commit/c18a0c0))
- **teammates**: align invitation lifecycle with audit taxonomy and room-scoped outbox ([75a79a9](https://github.com/alexj11324/orvilo1/commit/75a79a9))
- **tasks**: capture model contract before dispatch ([0a94480](https://github.com/alexj11324/orvilo1/commit/0a94480))
- **linear**: preserve database retry CAS precision ([95a0d9f](https://github.com/alexj11324/orvilo1/commit/95a0d9f))
- **linear**: persist signed removal tombstones ([9c04804](https://github.com/alexj11324/orvilo1/commit/9c04804))
- **tasks**: resume integration recovery states ([71f062b](https://github.com/alexj11324/orvilo1/commit/71f062b))
- **misc**: expose project orchestration settings ([ee74974](https://github.com/alexj11324/orvilo1/commit/ee74974))
- **misc**: group Linear tasks by business workflow ([8218ff7](https://github.com/alexj11324/orvilo1/commit/8218ff7))
- **misc**: harden Linear planning and dispatch recovery ([58c09e1](https://github.com/alexj11324/orvilo1/commit/58c09e1))
- **linear**: pass label baseline to merge ([dfa99b9](https://github.com/alexj11324/orvilo1/commit/dfa99b9))
- **linear**: bound task issue link queries ([a257d99](https://github.com/alexj11324/orvilo1/commit/a257d99))
- **linear**: trust signed issue removals ([881f055](https://github.com/alexj11324/orvilo1/commit/881f055))
- **linear**: enforce outbound public scope ([dc5f857](https://github.com/alexj11324/orvilo1/commit/dc5f857))
- **linear**: preserve archived issue tombstones ([b4b9b77](https://github.com/alexj11324/orvilo1/commit/b4b9b77))
- **linear**: validate mapped organization members ([5e1bd46](https://github.com/alexj11324/orvilo1/commit/5e1bd46))
- **linear**: refresh workspace sync status ([95fa5f7](https://github.com/alexj11324/orvilo1/commit/95fa5f7))
- **linear**: lock complete planning read set ([65924f2](https://github.com/alexj11324/orvilo1/commit/65924f2))
- **tasks**: persist run ownership before dispatch ([6e6d544](https://github.com/alexj11324/orvilo1/commit/6e6d544))
- **linear**: guard replanning proposal application ([30d82c6](https://github.com/alexj11324/orvilo1/commit/30d82c6))
- **tasks**: stabilize automated run identities ([1ff1407](https://github.com/alexj11324/orvilo1/commit/1ff1407))
- **tasks**: fence dispatch lifecycle transitions ([9a3a2e8](https://github.com/alexj11324/orvilo1/commit/9a3a2e8))
- **linear**: apply persisted planning proposals ([f91515d](https://github.com/alexj11324/orvilo1/commit/f91515d))
- **linear**: register workspace settings route ([5581bdd](https://github.com/alexj11324/orvilo1/commit/5581bdd))
- **linear**: categorize API key scope ([13d3da0](https://github.com/alexj11324/orvilo1/commit/13d3da0))
- **linear**: satisfy CI typecheck ([4e7b1b3](https://github.com/alexj11324/orvilo1/commit/4e7b1b3))

#### What's improved

- **auth**: Clerk-backed session layer + portal sign-in redirect ([065e7f1](https://github.com/alexj11324/orvilo1/commit/065e7f1))
- **auth**: port accounts portal onto apps/auth worker ([4f68d91](https://github.com/alexj11324/orvilo1/commit/4f68d91))
- **connectors**: authorize GitHub MCP with existing GitHub App, closes [#287](https://github.com/alexj11324/orvilo1/issues/287) ([f6f9c77](https://github.com/alexj11324/orvilo1/commit/f6f9c77))
- **connectors**: add direct Linear OAuth entry, closes [#284](https://github.com/alexj11324/orvilo1/issues/284) ([951d69a](https://github.com/alexj11324/orvilo1/commit/951d69a))
- **collaboration**: render human cursors as the SF pointer arrowhead ([0dd7833](https://github.com/alexj11324/orvilo1/commit/0dd7833))
- **reviews**: add layout-matching skeleton for review detail ([a4c77ab](https://github.com/alexj11324/orvilo1/commit/a4c77ab))
- **reviews**: align overview and diff with Linear layout ([ce1fa60](https://github.com/alexj11324/orvilo1/commit/ce1fa60))
- **collaboration**: show human issue cursors with personal visibility control ([5bdd081](https://github.com/alexj11324/orvilo1/commit/5bdd081))
- **settings**: replace builtin tools with MCP preset catalog on Connectors page, closes [#271](https://github.com/alexj11324/orvilo1/issues/271) ([0b6422f](https://github.com/alexj11324/orvilo1/commit/0b6422f))
- **misc**: add Linear team import wizard ([80b8125](https://github.com/alexj11324/orvilo1/commit/80b8125))
- **parity**: issue-row and surface alignment base, closes [#228](https://github.com/alexj11324/orvilo1/issues/228) ([9b08ec1](https://github.com/alexj11324/orvilo1/commit/9b08ec1))
- **tasks**: one canonical Linear-shaped status mark per issue row, closes [#225](https://github.com/alexj11324/orvilo1/issues/225) ([a8968f6](https://github.com/alexj11324/orvilo1/commit/a8968f6))
- **auth**: adopt ReUI login and onboarding layouts, closes [#206](https://github.com/alexj11324/orvilo1/issues/206) ([4b37d31](https://github.com/alexj11324/orvilo1/commit/4b37d31))
- **project**: Linear-shaped overview + projects table — title/properties/resources rows, milestone goals, issue counts ([dbe7c23](https://github.com/alexj11324/orvilo1/commit/dbe7c23))
- **project**: status pill + member avatars in project header ([6ffcbdb](https://github.com/alexj11324/orvilo1/commit/6ffcbdb))
- **project**: Linear-style properties rail on project overview ([020b475](https://github.com/alexj11324/orvilo1/commit/020b475))
- **project**: Linear-shaped project surface — tabs header + overview body ([e2465c4](https://github.com/alexj11324/orvilo1/commit/e2465c4))
- **project**: land /project/:id on the issue collection ([e0b1113](https://github.com/alexj11324/orvilo1/commit/e0b1113))
- **task-run**: pass explicit intent from UI/CLI/tool callers (SB08) ([6f258c9](https://github.com/alexj11324/orvilo1/commit/6f258c9))
- **task-runner**: SA05 — contract identity chain, current-delivery gates + CAID admission at the shared claim boundary (F07/F12) ([510dfd7](https://github.com/alexj11324/orvilo1/commit/510dfd7))
- **task-dispatch**: CAID admission rollout gate (R10) ([6147986](https://github.com/alexj11324/orvilo1/commit/6147986))
- **task-delivery-review**: per-stage poll-failure budgets + merge-accepted reconcile (R07) ([32af62b](https://github.com/alexj11324/orvilo1/commit/32af62b))
- **tool-surface**: mount external connector/MCP tools + strict required-tool admission (F04/F05) ([250fd52](https://github.com/alexj11324/orvilo1/commit/250fd52))
- **goal-experience**: P17 — surface per-node integration state and parallelism control ([2f34aab](https://github.com/alexj11324/orvilo1/commit/2f34aab))
- **task-integration**: P15 — serialize same repo/ref integrations and re-baseline stale merges ([45bad74](https://github.com/alexj11324/orvilo1/commit/45bad74))
- **task-workspace**: P14 — preflight device repo and recover interrupted provisioning ([6511fda](https://github.com/alexj11324/orvilo1/commit/6511fda))
- **goal**: P13 — re-verify depends_on readiness under the dispatch claim lock ([571f55f](https://github.com/alexj11324/orvilo1/commit/571f55f))
- **task-runner**: P11 — persist versioned TaskExecutionContract on run rows ([b68f9ff](https://github.com/alexj11324/orvilo1/commit/b68f9ff))
- **tool-surface**: P09 — explicit per-tool mount outcomes for ACP runs ([62df9e1](https://github.com/alexj11324/orvilo1/commit/62df9e1))
- **task-dispatch**: P16 — goal-stop dispatch fences and bounded verification polls ([c4052e4](https://github.com/alexj11324/orvilo1/commit/c4052e4))
- **goal-manager**: P12 — CAID incremental plan patches with revision CAS ([024d3f8](https://github.com/alexj11324/orvilo1/commit/024d3f8))
- **branding**: P03 — Orvilo self-brand surface (ACP clientInfo, release feed, allowlist) ([848ca84](https://github.com/alexj11324/orvilo1/commit/848ca84))
- **notification**: feedCard by-id read endpoint for deep links and decide reconcile ([0b10826](https://github.com/alexj11324/orvilo1/commit/0b10826))
- **pages**: apply WorkSurface collection skeleton to my issues, teams, projects, views ([424110c](https://github.com/alexj11324/orvilo1/commit/424110c))
- **work-surface**: shared page-frame skeletons, members directory table, IssueContent extraction ([19f600b](https://github.com/alexj11324/orvilo1/commit/19f600b))
- **nav**: fixed Linear IA hook — inbox/my-issues/reviews/agent rows ([1b0f34a](https://github.com/alexj11324/orvilo1/commit/1b0f34a))
- **sidebar**: Linear sidebar IA + locales + frozen v4 packet docs ([12c2656](https://github.com/alexj11324/orvilo1/commit/12c2656))
- **surfaces**: Linear-style work surfaces — Inbox, My issues, Reviews, Views, Teams, Members ([78fb8de](https://github.com/alexj11324/orvilo1/commit/78fb8de))
- **work-surface**: shared page-frame skeletons, members directory table, IssueContent extraction ([f33a69e](https://github.com/alexj11324/orvilo1/commit/f33a69e))
- **nav**: fixed Linear IA hook — inbox/my-issues/reviews/agent rows ([49bb36b](https://github.com/alexj11324/orvilo1/commit/49bb36b))
- **sidebar**: Linear sidebar IA + locales + frozen v4 packet docs ([04d5469](https://github.com/alexj11324/orvilo1/commit/04d5469))
- **surfaces**: Linear-style work surfaces — Inbox, My issues, Reviews, Views, Teams, Members ([60ca42f](https://github.com/alexj11324/orvilo1/commit/60ca42f))
- **workspace**: client activation chain — URL sync, workspace store, X-Workspace-Id ([7e4c888](https://github.com/alexj11324/orvilo1/commit/7e4c888))
- **sidebar**: Linear sidebar IA + locales + frozen v4 packet docs ([a63f578](https://github.com/alexj11324/orvilo1/commit/a63f578))
- **surfaces**: Linear-style work surfaces — Inbox, My issues, Reviews, Views, Teams, Members ([bb9df89](https://github.com/alexj11324/orvilo1/commit/bb9df89))
- **workspace**: client activation chain — URL sync, workspace store, X-Workspace-Id ([d130068](https://github.com/alexj11324/orvilo1/commit/d130068))
- **db,server**: work-attention data contract — scoped models, routers, and services ([9a546fb](https://github.com/alexj11324/orvilo1/commit/9a546fb))
- **acp**: P70d — delete the retired in-process agent engine, closes [#107](https://github.com/alexj11324/orvilo1/issues/107) ([34b05cd](https://github.com/alexj11324/orvilo1/commit/34b05cd))
- **agent**: ACP-only execution binding + shared-type detach (P70a + P70b core), closes [#90](https://github.com/alexj11324/orvilo1/issues/90) ([5d3f0b8](https://github.com/alexj11324/orvilo1/commit/5d3f0b8))
- **acp**: retire builtin orvilo-browser tool chain (P60), closes [#76](https://github.com/alexj11324/orvilo1/issues/76) ([8a59e82](https://github.com/alexj11324/orvilo1/commit/8a59e82))
- **tasks**: enforce PR-first delivery review lifecycle, closes [#88](https://github.com/alexj11324/orvilo1/issues/88) ([94a71e4](https://github.com/alexj11324/orvilo1/commit/94a71e4))
- **ops**: stamp execution-engine provenance on agent_operations, closes [#87](https://github.com/alexj11324/orvilo1/issues/87) ([bdd048f](https://github.com/alexj11324/orvilo1/commit/bdd048f))
- **workspace**: real workspace context in OSS business layer, closes [#85](https://github.com/alexj11324/orvilo1/issues/85) ([277b5a8](https://github.com/alexj11324/orvilo1/commit/277b5a8))
- **client-parity**: unify web/desktop control plane and execution contract ([20cee71](https://github.com/alexj11324/orvilo1/commit/20cee71))
- **misc**: consent-based ownership transfer + member roster workload, closes [#81](https://github.com/alexj11324/orvilo1/issues/81) ([5498a06](https://github.com/alexj11324/orvilo1/commit/5498a06))
- **teammates**: self-serve workspace leave entry ([da9ed89](https://github.com/alexj11324/orvilo1/commit/da9ed89))
- **acp**: remote-run admission ledger and cancellation fencing, closes [#61](https://github.com/alexj11324/orvilo1/issues/61) ([798f314](https://github.com/alexj11324/orvilo1/commit/798f314))
- **linear**: workspace-scope sync, teams and repository associations ([aa9e8c9](https://github.com/alexj11324/orvilo1/commit/aa9e8c9))
- **teammates**: flag invites whose email failed to send ([c41401f](https://github.com/alexj11324/orvilo1/commit/c41401f))
- **convergence**: task-first convergence — retire community social backend, workbench, guest execution, memory profiling, closes [#44](https://github.com/alexj11324/orvilo1/issues/44) ([7a40f70](https://github.com/alexj11324/orvilo1/commit/7a40f70))
- **teammates**: add /invite/:token landing page for invitation accept ([fe0b884](https://github.com/alexj11324/orvilo1/commit/fe0b884))
- **teammates**: workspaceAgent roster router and final lambda wiring ([44a22cb](https://github.com/alexj11324/orvilo1/commit/44a22cb))
- **misc**: teammates workspace collaboration frontend ([13d61b1](https://github.com/alexj11324/orvilo1/commit/13d61b1))
- **teammates**: invitation, membership and project-member APIs ([f515260](https://github.com/alexj11324/orvilo1/commit/f515260))
- **misc**: add agent delegation + realtime collaboration backend ([9ed8640](https://github.com/alexj11324/orvilo1/commit/9ed8640))
- **database**: add teammates collaboration data layer ([369cf27](https://github.com/alexj11324/orvilo1/commit/369cf27))
- **linear**: sync external comments and relations ([c00e7cd](https://github.com/alexj11324/orvilo1/commit/c00e7cd))
- **linear**: add independent sync rollout controls ([3e38f63](https://github.com/alexj11324/orvilo1/commit/3e38f63))
- **linear**: harden OAuth and integration sync boundary ([acf75a4](https://github.com/alexj11324/orvilo1/commit/acf75a4))
- **projects**: add bounded orchestration policy settings ([7406eb0](https://github.com/alexj11324/orvilo1/commit/7406eb0))
- **linear**: scope incremental replanning ownership ([0e2c90e](https://github.com/alexj11324/orvilo1/commit/0e2c90e))
- **linear**: add sync visibility wizard ([7174af2](https://github.com/alexj11324/orvilo1/commit/7174af2))
- **tasks**: enforce durable dispatch ownership ([cab4268](https://github.com/alexj11324/orvilo1/commit/cab4268))
- **tasks**: add orchestration domain contract ([8c10871](https://github.com/alexj11324/orvilo1/commit/8c10871))
- **linear**: complete workspace sync workflow ([fe81ed7](https://github.com/alexj11324/orvilo1/commit/fe81ed7))
- **linear**: apply versioned planning proposals ([b2ecc92](https://github.com/alexj11324/orvilo1/commit/b2ecc92))
- **linear**: add durable incremental replanning ([baf7635](https://github.com/alexj11324/orvilo1/commit/baf7635))
- **linear**: enqueue local task changes ([2b50ccf](https://github.com/alexj11324/orvilo1/commit/2b50ccf))
- **linear**: process issue sync inbox ([0dda337](https://github.com/alexj11324/orvilo1/commit/0dda337))
- **linear**: add workspace sync foundation ([99976a5](https://github.com/alexj11324/orvilo1/commit/99976a5))

#### Code Refactoring

- **settings**: delete the Audit logs settings surface, closes [#272](https://github.com/alexj11324/orvilo1/issues/272) ([f5f8463](https://github.com/alexj11324/orvilo1/commit/f5f8463))
- **agent-execution**: P21 — physically delete legacy agent-runtime tails, migrate consumers to agentExecution ([5955c4c](https://github.com/alexj11324/orvilo1/commit/5955c4c))
- **hetero-agents**: P07 — split live ACP registry from historical trace decoders ([576cde1](https://github.com/alexj11324/orvilo1/commit/576cde1))
- **quota**: P06 — retire managed quota accounts and quota-driven routing ([84482e8](https://github.com/alexj11324/orvilo1/commit/84482e8))
- **provider**: P05 — retire provider binding, server-default relay and orphan model entry points ([c3ce5c9](https://github.com/alexj11324/orvilo1/commit/c3ce5c9))
- **sidebar**: retire per-item sidebar-visibility subsystem ([9519ddd](https://github.com/alexj11324/orvilo1/commit/9519ddd))
- **inbox**: move shared relative-time helper next to its surviving consumer ([0dea9aa](https://github.com/alexj11324/orvilo1/commit/0dea9aa))
- **favorites**: move favorite button+toggle to surfaces layer ([ddd5722](https://github.com/alexj11324/orvilo1/commit/ddd5722))
- **inbox**: move shared relative-time helper next to its surviving consumer ([29a52c9](https://github.com/alexj11324/orvilo1/commit/29a52c9))
- **favorites**: move favorite button+toggle to surfaces layer ([81bf079](https://github.com/alexj11324/orvilo1/commit/81bf079))
- **task**: retire the fork's task steering layer ([d15a9a2](https://github.com/alexj11324/orvilo1/commit/d15a9a2))
- **app**: retire provider settings UI and client-side inference runtime (P30) ([f1846bc](https://github.com/alexj11324/orvilo1/commit/f1846bc))
- **invite**: follow OrviloDatabase rename after canary merge ([20ff287](https://github.com/alexj11324/orvilo1/commit/20ff287))
- **tasks**: retire the /tasks empty-state hero, empty list renders the board, closes [#46](https://github.com/alexj11324/orvilo1/issues/46) ([9af568f](https://github.com/alexj11324/orvilo1/commit/9af568f))
- **linear**: run sync workflows through Hatchet ([218ec80](https://github.com/alexj11324/orvilo1/commit/218ec80))

#### Styles

- **teammates**: order workspaceAgent imports per repo convention ([4835be4](https://github.com/alexj11324/orvilo1/commit/4835be4))

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.2.17

<sup>Released on **2026-09-11**</sup>

#### 🐛 Bug Fixes

- **portal**: repair weekly HTML publish imports.
- **ci**: restore release metadata sync and dispatch on main.
- **misc**: preserve flat JSON provider errors.

#### 💄 Styles

- **acceptance**: always show the comment reaction button.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **portal**: repair weekly HTML publish imports
- **ci**: restore release metadata sync and dispatch on main
- **misc**: preserve flat JSON provider errors

#### Styles

- **acceptance**: always show the comment reaction button

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

## Version 2.2.16

<sup>Released on **2026-09-04**</sup>

#### 🐛 Bug Fixes

- **heterogeneous-agent**: preserve TRAE auth for model bindings.

#### ✨ Features

- **misc**: relax workspace resource management.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **heterogeneous-agent**: preserve TRAE auth for model bindings

#### What's improved

- **misc**: relax workspace resource management

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

## Version 2.2.11

<sup>Released on **2026-07-23**</sup>

#### 🐛 Bug Fixes

- **misc**: narrow acceptance empty filter translation key.
- **verify**: polish recovered acceptance changes.
- **chat**: prevent mobile input auto-zoom.
- **minimax**: normalize unsupported image detail "auto".
- **ProviderConfig**: reset form fields to prevent leaking old values on provider switch.
- **search**: surface marketplace agent failures.
- **search**: surface web search provider failures.
- **misc**: enforce agent step execution deadlines.
- **model-runtime**: enable prompt cache keys for Grok.
- **conversation-flow**: iterative message-tree traversal to avoid mobile stack overflow.

#### 💄 Styles

- **misc**: add existing subscription redirect copy.
- **misc**: improve remote device tool UI.

#### ✨ Features

- **chat-terminal**: polish terminal panel with tabs, context menu and WebGL renderer.
- **device**: add opt-in SRT sandbox runtime.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: narrow acceptance empty filter translation key
- **verify**: polish recovered acceptance changes
- **chat**: prevent mobile input auto-zoom
- **minimax**: normalize unsupported image detail "auto"
- **ProviderConfig**: reset form fields to prevent leaking old values on provider switch
- **search**: surface marketplace agent failures
- **search**: surface web search provider failures
- **misc**: enforce agent step execution deadlines
- **model-runtime**: enable prompt cache keys for Grok
- **conversation-flow**: iterative message-tree traversal to avoid mobile stack overflow

#### Styles

- **misc**: add existing subscription redirect copy
- **misc**: improve remote device tool UI

#### What's improved

- **chat-terminal**: polish terminal panel with tabs, context menu and WebGL renderer
- **device**: add opt-in SRT sandbox runtime

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.2.8

<sup>Released on **2026-06-22**</sup>

#### 🐛 Bug Fixes

- **misc**: drop legacy task template recommendations.
- **misc**: drop legacy task template recommendations.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: drop legacy task template recommendations
- **misc**: drop legacy task template recommendations

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.2.7

<sup>Released on **2026-06-20**</sup>

#### 🐛 Bug Fixes

- **chat**: treat parked runs as non-terminal in client run-lifecycle.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **chat**: treat parked runs as non-terminal in client run-lifecycle

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

## Version 2.2.6

<sup>Released on **2026-06-17**</sup>

#### ✨ Features

- **agent**: improve connector, document, and fleet workflows.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's improved

- **agent**: improve connector, document, and fleet workflows

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

## Version 2.2.1

<sup>Released on **2026-05-29**</sup>

#### ✨ Features

- **device**: device registry TRPC (register / list / update / remove).
- **bot**: add iMessage Desktop setup and bridge.
- **desktop**: show zoom level HUD on Cmd+/- and Cmd+0.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's improved

- **device**: device registry TRPC (register / list / update / remove)
- **bot**: add iMessage Desktop setup and bridge
- **desktop**: show zoom level HUD on Cmd+/- and Cmd+0

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.2.0

<sup>Released on **2026-05-18**</sup>

#### 💄 Styles

- **pricing**: restore DeepSeek models to official pricing.

#### 🐛 Bug Fixes

- **conversation**: animate only the last markdown block + drop clearMessages hotkey.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Styles

- **pricing**: restore DeepSeek models to official pricing

#### What's

- **conversation**: animate only the last markdown block + drop clearMessages hotkey

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

## Version 2.1.58

<sup>Released on **2026-05-13**</sup>

#### ✨ Features

- **agent-runtime**: persist agent operations to `agent_operations` table.
- **misc**: support slack mpim and fix discord dm problem.
- **database**: add `agent_operations` table.
- **markdown**: user_feedback card + task card polish + Run now context menu.
- **documents**: add optimistic create/delete and inline rename for document tree.
- **devtools**: add dev-only feature flag override panel.
- **misc**: add service model assignments settings.
- **misc**: inline skill auth in recommended task templates.
- **activator**: require activation reason.
- **agent-signal,server,prompts**: consolidate in self-review implemented.
- **hetero-agent**: support AskUserQuestion tools for claude code.
- **bot**: gate device tools by sender identity.
- **misc**: add user activity business hook.
- **misc**: add Gemini 3.1 Flash-Lite provider cards.
- **misc**: home daily brief with linkable welcome + paired input hint.
- **agent-signal,prompts,database**: self-review now proposal actions to briefs, and automatically execute actions.
- **misc**: add signOperationJwt with 4h expiry for hetero-agent operations.
- **misc**: migrate Notion to Orvilo Market.
- **misc**: Cloud Claude Code V3 — repo picker, GitHub token, sandbox context.

#### 🐛 Bug Fixes

- **hetero-agent**: wire AskUserBridge response events to renderer.
- **home**: blank user bubble when sending the placeholder hint.
- **conversation**: prevent synthetic scroll from shrinking spacer.
- **task-card**: localize task card date independent of dayjs global locale.
- **web-crawler**: cap response body size to prevent serverless OOM.
- **desktop**: focus onboarding auth success state.
- **misc**: Docs image.
- **desktop**: detect Windows npm .cmd shims for CLI agents (claude/codex/…).
- **misc**: update Task page placeholder copy.
- **builtin-tool-task**: expose `orvilo-task` and add `setTaskSchedule`.
- **desktop**: reset pendingLoginMethod on auth failure/cancel paths.
- **utils**: cap image binary at 3.75MB so base64 payload stays under Anthropic 5MB limit.
- **tasks**: scheduler, hotkey, comment & TodoList polish.
- **cli**: remove stale cron entry from generated man page.
- **misc**: sidebar add agent.
- **misc**: replace ScrollShadow with ScrollArea to fix React #185 infinite render loop.
- **heteroFinish**: trigger task lifecycle on cloud sandbox agent completion.
- **hotkey**: remove redundant onClear to prevent double updateHotkey calls.
- **misc**: reject inactive OIDC access.
- **misc**: drop unreachable aihubmix empty-apiKey test.
- **aihubmix**: use full models endpoint to return complete model list.
- **onboarding**: skip marketplace on early exit, drop CJK in prompts.
- **model-runtime**: enrich stream parse errors with provider/model context.
- **home**: strip markdown links from daily-brief input placeholder.
- **misc**: consume visual content parts in server runtime.
- **misc**: store onboarding interests as keys.
- **hetero-agent**: sync new-step assistant across replicas.
- **misc**: remove the old cron job from orvilo.
- **misc**: refresh content baseline from DB on every ingest call.
- **hetero-agent**: disable Claude Code AskUserQuestion to avoid auto-decline.
- **local-system**: guard readFile against binary blobs and oversized output.
- **database,utils,userMemories**: should perfer to use `paradedb.match(...)` instead of hardcoded normalizer.
- **database**: attach error listeners to Neon/Node pools to prevent Lambda crash.
- **misc**: gateway client-tool pluginState + drop redundant `Exit code: 0` tail.
- **gemini**: handle zero cachedContentTokenCount in usage conversion.
- **misc**: first inject the cloudecc runtime session should use the existingStatus.
- **misc**: slack connect error & slash commands.
- **misc**: polish task agent manager.
- **agent-runtime**: recover malformed tool_call names instead of finishing silently.
- **misc**: remove signin captcha flow.
- **misc**: add temporary email auth error locale.
- **misc**: add bot callback service.
- **misc**: sanitize sensitive comments and examples from production JS bundle.
- **misc**: multiple account link.

#### 💄 Styles

- **misc**: use @lobehub/ui built-in HtmlPreview instead of custom component.
- **misc**: polish desktop header icons, sidebar density, and task menus.
- **review-panel**: hover revert button to discard per-file working-tree changes.
- **misc**: standardize header action icon sizes.
- **tool**: add word wrap toggle to tool arguments display.
- **nav**: unify ActionIcon sizing and improve TodoList encapsulation.
- **web-onboarding**: add Render for saveUserQuestion & showAgentMarketplace.
- **misc**: add `reasoning_effort` support for Grok 4.3.
- **misc**: increase chat topic title length.
- **hetero-agent**: read-only SubAgent threads with breadcrumb header and thread switcher.
- **chat-input**: show skeleton in action bar while config is loading.
- **home**: add Recommendations module with hetero agent action library.
- **copyable-label**: wrap long tool-call params instead of truncating.
- **misc**: format tool execution time as Xmin Ys instead of X.Y min.
- **misc**: Add new DeepSeek-V4 models.
- **topic**: add copy session ID to topic dropdown menu.
- **misc**: use visible divider between queued messages.
- **intervention**: polish confirmation bar layout.
- **settings**: remove image avatar from lab input markdown rendering item.
- **task**: activity card stop run + register /tasks in SPA proxy.
- **misc**: update auth captcha retry copy.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's improved

- **agent-runtime**: persist agent operations to `agent_operations` table
- **misc**: support slack mpim and fix discord dm problem
- **database**: add `agent_operations` table
- **markdown**: user_feedback card + task card polish + Run now context menu
- **documents**: add optimistic create/delete and inline rename for document tree
- **devtools**: add dev-only feature flag override panel
- **misc**: add service model assignments settings
- **misc**: inline skill auth in recommended task templates
- **activator**: require activation reason
- **agent-signal,server,prompts**: consolidate in self-review implemented
- **hetero-agent**: support AskUserQuestion tools for claude code
- **bot**: gate device tools by sender identity
- **misc**: add user activity business hook
- **misc**: add Gemini 3.1 Flash-Lite provider cards
- **misc**: home daily brief with linkable welcome + paired input hint
- **agent-signal,prompts,database**: self-review now proposal actions to briefs, and automatically execute actions
- **misc**: add signOperationJwt with 4h expiry for hetero-agent operations
- **misc**: migrate Notion to Orvilo Market
- **misc**: Cloud Claude Code V3 — repo picker, GitHub token, sandbox context

#### What's

- **hetero-agent**: wire AskUserBridge response events to renderer
- **home**: blank user bubble when sending the placeholder hint
- **conversation**: prevent synthetic scroll from shrinking spacer
- **task-card**: localize task card date independent of dayjs global locale
- **web-crawler**: cap response body size to prevent serverless OOM
- **desktop**: focus onboarding auth success state
- **misc**: Docs image
- **desktop**: detect Windows npm .cmd shims for CLI agents (claude/codex/…)
- **misc**: update Task page placeholder copy
- **builtin-tool-task**: expose `orvilo-task` and add `setTaskSchedule`
- **desktop**: reset pendingLoginMethod on auth failure/cancel paths
- **utils**: cap image binary at 3.75MB so base64 payload stays under Anthropic 5MB limit
- **tasks**: scheduler, hotkey, comment & TodoList polish
- **cli**: remove stale cron entry from generated man page
- **misc**: sidebar add agent
- **misc**: replace ScrollShadow with ScrollArea to fix React #185 infinite render loop
- **heteroFinish**: trigger task lifecycle on cloud sandbox agent completion
- **hotkey**: remove redundant onClear to prevent double updateHotkey calls
- **misc**: reject inactive OIDC access
- **misc**: drop unreachable aihubmix empty-apiKey test
- **aihubmix**: use full models endpoint to return complete model list
- **onboarding**: skip marketplace on early exit, drop CJK in prompts
- **model-runtime**: enrich stream parse errors with provider/model context
- **home**: strip markdown links from daily-brief input placeholder
- **misc**: consume visual content parts in server runtime
- **misc**: store onboarding interests as keys
- **hetero-agent**: sync new-step assistant across replicas
- **misc**: remove the old cron job from orvilo
- **misc**: refresh content baseline from DB on every ingest call
- **hetero-agent**: disable Claude Code AskUserQuestion to avoid auto-decline
- **local-system**: guard readFile against binary blobs and oversized output
- **database,utils,userMemories**: should perfer to use `paradedb.match(...)` instead of hardcoded normalizer
- **database**: attach error listeners to Neon/Node pools to prevent Lambda crash
- **misc**: gateway client-tool pluginState + drop redundant `Exit code: 0` tail
- **gemini**: handle zero cachedContentTokenCount in usage conversion
- **misc**: first inject the cloudecc runtime session should use the existingStatus
- **misc**: slack connect error & slash commands
- **misc**: polish task agent manager
- **agent-runtime**: recover malformed tool_call names instead of finishing silently
- **misc**: remove signin captcha flow
- **misc**: add temporary email auth error locale
- **misc**: add bot callback service
- **misc**: sanitize sensitive comments and examples from production JS bundle
- **misc**: multiple account link

#### Styles

- **misc**: use @lobehub/ui built-in HtmlPreview instead of custom component
- **misc**: polish desktop header icons, sidebar density, and task menus
- **review-panel**: hover revert button to discard per-file working-tree changes
- **misc**: standardize header action icon sizes
- **tool**: add word wrap toggle to tool arguments display
- **nav**: unify ActionIcon sizing and improve TodoList encapsulation
- **web-onboarding**: add Render for saveUserQuestion & showAgentMarketplace
- **misc**: add `reasoning_effort` support for Grok 4.3
- **misc**: increase chat topic title length
- **hetero-agent**: read-only SubAgent threads with breadcrumb header and thread switcher
- **chat-input**: show skeleton in action bar while config is loading
- **home**: add Recommendations module with hetero agent action library
- **copyable-label**: wrap long tool-call params instead of truncating
- **misc**: format tool execution time as Xmin Ys instead of X.Y min
- **misc**: Add new DeepSeek-V4 models
- **topic**: add copy session ID to topic dropdown menu
- **misc**: use visible divider between queued messages
- **intervention**: polish confirmation bar layout
- **settings**: remove image avatar from lab input markdown rendering item
- **task**: activity card stop run + register /tasks in SPA proxy
- **misc**: update auth captcha retry copy

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

## Version 2.1.57

<sup>Released on **2026-05-09**</sup>

#### 🐛 Bug Fixes

- **docker**: replace pnpm init with static package.json in /deps.
- **onboarding**: guard skip/mode-switch footer with feature flag, desktop & init checks.
- **misc**: hide runtime-only model aliases.

#### ✨ Features

- **misc**: set OSS default model to DeepSeek V4 Pro.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **docker**: replace pnpm init with static package.json in /deps
- **onboarding**: guard skip/mode-switch footer with feature flag, desktop & init checks
- **misc**: hide runtime-only model aliases

#### What's improved

- **misc**: set OSS default model to DeepSeek V4 Pro

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.56

<sup>Released on **2026-05-01**</sup>

#### 👷 Build System

- **database**: add `metadata` and `trigger` to `briefs` table.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Build System

- **database**: add `metadata` and `trigger` to `briefs` table

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.55

<sup>Released on **2026-04-29**</sup>

#### 🐛 Bug Fixes

- **chat**: preserve topics across cold route sends.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **chat**: preserve topics across cold route sends

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.54

<sup>Released on **2026-04-27**</sup>

#### 🐛 Bug Fixes

- **misc**: clear stale topic when switching agents from a topic route.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: clear stale topic when switching agents from a topic route

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.52

<sup>Released on **2026-04-20**</sup>

#### 👷 Build System

- **database**: add topic status and tasks automation mode.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Build System

- **database**: add topic status and tasks automation mode

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

## Version 2.1.51

<sup>Released on **2026-04-16**</sup>

#### 👷 Build System

- **database**: add document history schema.
- **database**: add document history schema.

#### 🐛 Bug Fixes

- **misc**: fix minify cli.
- **misc**: recent delete.
- **deps**: pin @react-pdf/image to 3.0.4 to avoid privatized @react-pdf/svg.
- **database**: enforce document history ownership and pagination.

#### ✨ Features

- **database**: add document history table and update related models.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Build System

- **database**: add document history schema
- **database**: add document history schema

#### What's

- **misc**: fix minify cli
- **misc**: recent delete
- **deps**: pin @react-pdf/image to 3.0.4 to avoid privatized @react-pdf/svg
- **database**: enforce document history ownership and pagination

#### What's improved

- **database**: add document history table and update related models

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

## Version 2.1.50

<sup>Released on **2026-04-16**</sup>

#### 👷 Build System

- **database**: add document history schema.
- **database**: add document history schema.

#### 🐛 Bug Fixes

- **deps**: pin @react-pdf/image to 3.0.4 to avoid privatized @react-pdf/svg.
- **database**: enforce document history ownership and pagination.

#### ✨ Features

- **database**: add document history table and update related models.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Build System

- **database**: add document history schema
- **database**: add document history schema

#### What's

- **deps**: pin @react-pdf/image to 3.0.4 to avoid privatized @react-pdf/svg
- **database**: enforce document history ownership and pagination

#### What's improved

- **database**: add document history table and update related models

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.45

<sup>Released on **2026-03-26**</sup>

#### 👷 Build System

- **misc**: add agent task system database schema.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Build System

- **misc**: add agent task system database schema

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.44

<sup>Released on **2026-03-20**</sup>

#### 🐛 Bug Fixes

- **misc**: misc UI/UX improvements and bug fixes.

#### 💄 Styles

- **misc**: add image/video switch.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: misc UI/UX improvements and bug fixes

#### Styles

- **misc**: add image/video switch

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.43

<sup>Released on **2026-03-16**</sup>

#### 👷 Build System

- **misc**: add BM25 indexes with ICU tokenizer for search optimization.
- **misc**: add `agent_documents` table.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Build System

- **misc**: add BM25 indexes with ICU tokenizer for search optimization
- **misc**: add `agent_documents` table

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.42

<sup>Released on **2026-03-14**</sup>

#### 🐛 Bug Fixes

- **ci**: create stable update manifests for S3 publish.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **ci**: create stable update manifests for S3 publish

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.40

<sup>Released on **2026-03-12**</sup>

#### 👷 Build System

- **misc**: add description column to topics table.
- **misc**: add migration to enable `pg_search` extension.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Build System

- **misc**: add description column to topics table
- **misc**: add migration to enable `pg_search` extension

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.39

<sup>Released on **2026-03-09**</sup>

#### 👷 Build System

- **misc**: add api key hash column migration.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Build System

- **misc**: add api key hash column migration

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.38

<sup>Released on **2026-03-06**</sup>

#### 👷 Build System

- **ci**: fix changelog auto-generation in release workflow.

#### 🐛 Bug Fixes

- **misc**: when use trustclient not register market m2m token.
- **ci**: correct stable renderer tar source path.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Build System

- **ci**: fix changelog auto-generation in release workflow

#### What's

- **misc**: when use trustclient not register market m2m token
- **ci**: correct stable renderer tar source path

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.26

<sup>Released on **2026-02-10**</sup>

#### 💄 Styles

- **misc**: Update i18n.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Styles

- **misc**: Update i18n

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.25

<sup>Released on **2026-02-09**</sup>

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.24

<sup>Released on **2026-02-09**</sup>

#### 🐛 Bug Fixes

- **misc**: Fix multimodal content_part images rendered as base64 text.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Fix multimodal content_part images rendered as base64 text

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.23

<sup>Released on **2026-02-09**</sup>

#### 🐛 Bug Fixes

- **swr**: Prevent useActionSWR isValidating from getting stuck.
- **misc**: Fix editor content missing when send error, use custom avatar for group chat in sidebar.

#### 💄 Styles

- **misc**: Update i18n.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **swr**: Prevent useActionSWR isValidating from getting stuck
- **misc**: Fix editor content missing when send error
- **misc**: Use custom avatar for group chat in sidebar

#### Styles

- **misc**: Update i18n

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.23

<sup>Released on **2026-02-08**</sup>

#### 🐛 Bug Fixes

- **misc**: Fix editor content missing when send error.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Fix editor content missing when send error

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.23

<sup>Released on **2026-02-08**</sup>

#### 🐛 Bug Fixes

- **misc**: Fix editor content missing when send error.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Fix editor content missing when send error

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.22

<sup>Released on **2026-02-08**</sup>

#### 🐛 Bug Fixes

- **misc**: Register Notebook tool in server runtime.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Register Notebook tool in server runtime

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.21

<sup>Released on **2026-02-08**</sup>

#### 🐛 Bug Fixes

- **misc**: Add end-user info on OpenAI Responses API call, enable vertical scrolling for topic list on mobile.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Add end-user info on OpenAI Responses API call
- **misc**: Enable vertical scrolling for topic list on mobile, closes aspectlylabs/orvilo#12029

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.21

<sup>Released on **2026-02-08**</sup>

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.21

<sup>Released on **2026-02-08**</sup>

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.20

<sup>Released on **2026-02-08**</sup>

#### 🐛 Bug Fixes

- **misc**: Add api/version and api/desktop to public routes, show notification when file upload fails due to storage plan limit.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Add api/version and api/desktop to public routes
- **misc**: Show notification when file upload fails due to storage plan limit

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.20

<sup>Released on **2026-02-08**</sup>

#### 🐛 Bug Fixes

- **misc**: Add api/version and api/desktop to public routes, show notification when file upload fails due to storage plan limit.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Add api/version and api/desktop to public routes
- **misc**: Show notification when file upload fails due to storage plan limit

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.20

<sup>Released on **2026-02-07**</sup>

#### 🐛 Bug Fixes

- **misc**: Show notification when file upload fails due to storage plan limit.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Show notification when file upload fails due to storage plan limit

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.20

<sup>Released on **2026-02-07**</sup>

#### 🐛 Bug Fixes

- **misc**: Show notification when file upload fails due to storage plan limit.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Show notification when file upload fails due to storage plan limit

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.19

<sup>Released on **2026-02-06**</sup>

#### ♻ Code Refactoring

- **docker-compose**: Restructure dev environment.
- **misc**: Upgrade agents/group detail pages tabs、hidden like button.

#### 🐛 Bug Fixes

- **misc**: Fixed in community pluings tab the orvilo skills not display.

#### 💄 Styles

- **model-runtime**: Add Claude Opus 4.6 support for Bedrock runtime.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Code refactoring

- **docker-compose**: Restructure dev environment
- **misc**: Upgrade agents/group detail pages tabs、hidden like button

#### What's

- **misc**: Fixed in community pluings tab the orvilo skills not display

#### Styles

- **model-runtime**: Add Claude Opus 4.6 support for Bedrock runtime

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.19

<sup>Released on **2026-02-06**</sup>

#### ♻ Code Refactoring

- **docker-compose**: Restructure dev environment.
- **misc**: Upgrade agents/group detail pages tabs、hidden like button.

#### 🐛 Bug Fixes

- **misc**: Fixed in community pluings tab the orvilo skills not display.

#### 💄 Styles

- **model-runtime**: Add Claude Opus 4.6 support for Bedrock runtime.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Code refactoring

- **docker-compose**: Restructure dev environment
- **misc**: Upgrade agents/group detail pages tabs、hidden like button

#### What's

- **misc**: Fixed in community pluings tab the orvilo skills not display

#### Styles

- **model-runtime**: Add Claude Opus 4.6 support for Bedrock runtime

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.19

<sup>Released on **2026-02-06**</sup>

#### ♻ Code Refactoring

- **docker-compose**: Restructure dev environment.
- **misc**: Upgrade agents/group detail pages tabs、hidden like button.

#### 🐛 Bug Fixes

- **misc**: Fixed in community pluings tab the orvilo skills not display.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Code refactoring

- **docker-compose**: Restructure dev environment
- **misc**: Upgrade agents/group detail pages tabs、hidden like button

#### What's

- **misc**: Fixed in community pluings tab the orvilo skills not display

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.19

<sup>Released on **2026-02-06**</sup>

#### ♻ Code Refactoring

- **docker-compose**: Restructure dev environment.
- **misc**: Upgrade agents/group detail pages tabs、hidden like button.

#### 🐛 Bug Fixes

- **misc**: Fixed in community pluings tab the orvilo skills not display.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Code refactoring

- **docker-compose**: Restructure dev environment
- **misc**: Upgrade agents/group detail pages tabs、hidden like button

#### What's

- **misc**: Fixed in community pluings tab the orvilo skills not display

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.19

<sup>Released on **2026-02-06**</sup>

#### ♻ Code Refactoring

- **docker-compose**: Restructure dev environment.
- **misc**: Upgrade agents/group detail pages tabs、hidden like button.

#### 🐛 Bug Fixes

- **misc**: Fixed in community pluings tab the orvilo skills not display.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Code refactoring

- **docker-compose**: Restructure dev environment
- **misc**: Upgrade agents/group detail pages tabs、hidden like button

#### What's

- **misc**: Fixed in community pluings tab the orvilo skills not display

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.19

<sup>Released on **2026-02-06**</sup>

#### ♻ Code Refactoring

- **docker-compose**: Restructure dev environment.
- **misc**: Upgrade agents/group detail pages tabs、hidden like button.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Code refactoring

- **docker-compose**: Restructure dev environment
- **misc**: Upgrade agents/group detail pages tabs、hidden like button

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.19

<sup>Released on **2026-02-05**</sup>

#### ♻ Code Refactoring

- **misc**: Upgrade agents/group detail pages tabs、hidden like button.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Code refactoring

- **misc**: Upgrade agents/group detail pages tabs、hidden like button

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.18

<sup>Released on **2026-02-04**</sup>

#### 🐛 Bug Fixes

- **model-runtime**: Fix moonshot interleaved thinking and circular dependency.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **model-runtime**: Fix moonshot interleaved thinking and circular dependency

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.17

<sup>Released on **2026-02-04**</sup>

#### ♻ Code Refactoring

- **model-runtime**: Extract Anthropic factory and convert Moonshot to RouterRuntime.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Code refactoring

- **model-runtime**: Extract Anthropic factory and convert Moonshot to RouterRuntime

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.16

<sup>Released on **2026-02-04**</sup>

#### 🐛 Bug Fixes

- **misc**: Add the preview publish to market button preview check.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Add the preview publish to market button preview check

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.15

<sup>Released on **2026-02-04**</sup>

#### 🐛 Bug Fixes

- **misc**: Fixed the agents list the show updateAt time error.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Fixed the agents list the show updateAt time error

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.14

<sup>Released on **2026-02-04**</sup>

#### 🐛 Bug Fixes

- **misc**: Fix cannot uncompressed messages.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Fix cannot uncompressed messages

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.13

<sup>Released on **2026-02-03**</sup>

#### 🐛 Bug Fixes

- **docker**: Add librt.so.1 to fix PDF parsing.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **docker**: Add librt.so.1 to fix PDF parsing

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.12

<sup>Released on **2026-02-03**</sup>

#### 🐛 Bug Fixes

- **changelog**: Normalize versionRange to valid semver.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **changelog**: Normalize versionRange to valid semver

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.11

<sup>Released on **2026-02-02**</sup>

#### 🐛 Bug Fixes

- **misc**: Hide password features when AUTH_DISABLE_EMAIL_PASSWORD is set.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Hide password features when AUTH_DISABLE_EMAIL_PASSWORD is set

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.10

<sup>Released on **2026-02-02**</sup>

#### 🐛 Bug Fixes

- **auth**: Revert authority URL and tenant ID for Microsoft authentication..

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **auth**: Revert authority URL and tenant ID for Microsoft authentication.

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.9

<sup>Released on **2026-02-02**</sup>

#### 🐛 Bug Fixes

- **misc**: Use oauth2.link for generic OIDC provider account linking.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Use oauth2.link for generic OIDC provider account linking

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.8

<sup>Released on **2026-02-01**</sup>

#### 💄 Styles

- **misc**: Improve tasks display.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Styles

- **misc**: Improve tasks display

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.7

<sup>Released on **2026-02-01**</sup>

#### 🐛 Bug Fixes

- **misc**: Add missing description parameter docs in Notebook system prompt.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Add missing description parameter docs in Notebook system prompt

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.6

<sup>Released on **2026-02-01**</sup>

#### 💄 Styles

- **misc**: Improve local-system tool implement.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Styles

- **misc**: Improve local-system tool implement

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.5

<sup>Released on **2026-01-31**</sup>

#### 🐛 Bug Fixes

- **misc**: Slove the group member agents cant set skills problem.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Slove the group member agents cant set skills problem

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.4

<sup>Released on **2026-01-31**</sup>

#### 🐛 Bug Fixes

- **stream**: Update event handling to use 'text' instead of 'content_part' in gemini 2.5 models.

#### 💄 Styles

- **misc**: Update i18n, Update Kimi K2.5 & Qwen3 Max Thinking models.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **stream**: Update event handling to use 'text' instead of 'content_part' in gemini 2.5 models

#### Styles

- **misc**: Update i18n
- **misc**: Update Kimi K2.5 & Qwen3 Max Thinking models

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.3

<sup>Released on **2026-01-31**</sup>

#### 🐛 Bug Fixes

- **auth**: Add AUTH_DISABLE_EMAIL_PASSWORD env to enable SSO-only mode.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **auth**: Add AUTH_DISABLE_EMAIL_PASSWORD env to enable SSO-only mode

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.2

<sup>Released on **2026-01-30**</sup>

#### 🐛 Bug Fixes

- **misc**: Fix feishu sso provider.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Fix feishu sso provider

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.1.1

<sup>Released on **2026-01-30**</sup>

#### 🐛 Bug Fixes

- **misc**: Correct desktop download URL path.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Correct desktop download URL path

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

## Version 2.1.0

<sup>Released on **2026-01-30**</sup>

#### ✨ Features

- **misc**: Refactor cron job UI and use runtime enableBusinessFeatures flag.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's improved

- **misc**: Refactor cron job UI and use runtime enableBusinessFeatures flag

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.0.13

<sup>Released on **2026-01-29**</sup>

#### 💄 Styles

- **misc**: Fix usage table display issues.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Styles

- **misc**: Fix usage table display issues

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.0.12

<sup>Released on **2026-01-29**</sup>

#### 🐛 Bug Fixes

- **misc**: Group publish to market should set local group market identifer.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Group publish to market should set local group market identifer

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.0.11

<sup>Released on **2026-01-29**</sup>

#### 💄 Styles

- **misc**: Fix group task render.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### Styles

- **misc**: Fix group task render

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.0.10

<sup>Released on **2026-01-29**</sup>

#### 🐛 Bug Fixes

- **misc**: Add ExtendParamsTypeSchema for enhanced model settings.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Add ExtendParamsTypeSchema for enhanced model settings

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.0.9

<sup>Released on **2026-01-29**</sup>

#### 🐛 Bug Fixes

- **model-bank**: Fix ZenMux model IDs by adding provider prefixes.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **model-bank**: Fix ZenMux model IDs by adding provider prefixes

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.0.8

<sup>Released on **2026-01-28**</sup>

#### 🐛 Bug Fixes

- **misc**: Fix inbox agent in mobile.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Fix inbox agent in mobile

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.0.7

<sup>Released on **2026-01-28**</sup>

#### 🐛 Bug Fixes

- **model-runtime**: Include tool_calls in speed metrics & add getActiveTraceId.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **model-runtime**: Include tool_calls in speed metrics & add getActiveTraceId

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.0.6

<sup>Released on **2026-01-27**</sup>

#### 🐛 Bug Fixes

- **misc**: The klavis in onboarding connect timeout fixed.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: The klavis in onboarding connect timeout fixed

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.0.5

<sup>Released on **2026-01-27**</sup>

#### 🐛 Bug Fixes

- **misc**: Update the artifact prompt.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Update the artifact prompt

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.0.4

<sup>Released on **2026-01-27**</sup>

#### 🐛 Bug Fixes

- **misc**: Rename docker image and update docs for v2.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Rename docker image and update docs for v2

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.0.3

<sup>Released on **2026-01-27**</sup>

#### 🐛 Bug Fixes

- **misc**: Fixed compressed group message & open the switch config to control compression config enabled, fixed the onboarding crash problem.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Fixed compressed group message & open the switch config to control compression config enabled
- **misc**: Fixed the onboarding crash problem

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.0.2

<sup>Released on **2026-01-27**</sup>

#### 🐛 Bug Fixes

- **misc**: Slove the recentTopicLinkError.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Slove the recentTopicLinkError

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

### Version 2.0.1

<sup>Released on **2026-01-27**</sup>

#### 🐛 Bug Fixes

- **share**: Shared group topic not show avatar.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **share**: Shared group topic not show avatar

</details>

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>

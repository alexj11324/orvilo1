<a name="readme-top"></a>

# Changelog

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
- **markdown**: user\_feedback card + task card polish + Run now context menu.
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
- **agent-runtime**: recover malformed tool\_call names instead of finishing silently.
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
- **markdown**: user\_feedback card + task card polish + Run now context menu
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
- **agent-runtime**: recover malformed tool\_call names instead of finishing silently
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

- **misc**: Fix multimodal content\_part images rendered as base64 text.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Fix multimodal content\_part images rendered as base64 text

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

- **misc**: Hide password features when AUTH\_DISABLE\_EMAIL\_PASSWORD is set.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **misc**: Hide password features when AUTH\_DISABLE\_EMAIL\_PASSWORD is set

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

- **stream**: Update event handling to use 'text' instead of 'content\_part' in gemini 2.5 models.

#### 💄 Styles

- **misc**: Update i18n, Update Kimi K2.5 & Qwen3 Max Thinking models.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **stream**: Update event handling to use 'text' instead of 'content\_part' in gemini 2.5 models

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

- **auth**: Add AUTH\_DISABLE\_EMAIL\_PASSWORD env to enable SSO-only mode.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **auth**: Add AUTH\_DISABLE\_EMAIL\_PASSWORD env to enable SSO-only mode

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

- **model-runtime**: Include tool\_calls in speed metrics & add getActiveTraceId.

<br/>

<details>
<summary><kbd>Improvements and Fixes</kbd></summary>

#### What's

- **model-runtime**: Include tool\_calls in speed metrics & add getActiveTraceId

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

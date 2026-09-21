# ORV-105 — Retire the non-core Messenger/IM adapter stack

## Audit verdict

The Messenger/IM adapter stack (Feishu/Lark, WeChat, QQ, LINE, iMessage, Discord/Slack/Telegram
bridges) was a self-contained product surface: chat-adapter packages → `services/gateway`
connection plane → `services/bot` / `services/messenger` handlers → `orvilo-message` builtin
tool → Messenger settings UI → `bot:`/`message_api` legs in shared plumbing. It was retired
end-to-end as one deletion chain.

## Kept

- `BotSenderMetadata`, `parseSpeakerTag`, `resolveSenderIdentity`, `getBotSender`,
  `getPlatformIcon` (`src/libs/platformIcon`) — historical bot messages/topics in the DB
  still render with their original sender attribution and platform icons.
- `RequestTrigger.Bot` enum member + the `aiAgent.execAgent` refine rejecting `trigger: 'bot'` —
  persisted rows still carry it; the guard is the regression test.
- `AgentSignalScope`/`emitToolOutcome` runtime plumbing minus the `botScopeKey` leg (see below).
- `CliMessageTransport` / `MessageTransport` in agent-execution — unrelated to IM (CLI streaming).
- `deviceGateway` service + `gatewayConnectionSrv/Ctr` + `device-gateway-client` — the ACP
  device/hetero plane; only the `message_api` protocol leg was removed.
- `bearerSecretAuth` — still used by `linear-sync`.
- `src/services/message/` DB service, `DesktopOnboarding/OrviloMessage` copy block.
- Feishu/WeChat under `src/libs/better-auth/sso/providers/` — those are login SSO, not IM bots.
- Drizzle schemas for `agent_bot_providers`, `messenger_account_links`,
  `messenger_installations`, `system_bot_providers` — table drops deferred to ORV-108.

## Deleted

- `packages/chat-adapter-{feishu,imessage,line,qq,wechat}` — platform adapter packages.
- `apps/server/src/services/{bot,messenger,gateway}/` — webhook dispatch, bot runtime,
  GatewayManager/GatewayService/MessageGatewayClient/botConnectQueue.
- Lambda routers `messenger`, `botMessage`, `agentBotProvider`; hono bot handlers; the
  `/api/agent/webhooks/bot-callback` hatchet path and `botReplay` task/queue arm.
- `orvilo-message` builtin tool (`builtin-tool-message` manifest/executor/resolveManifest) and
  its registration in `packages/builtin-tools`.
- `BotCallbackService` delivery leg in `taskResultBridge`; `resolveDeviceAccessPolicy` /
  `botContext` / `botSender` in `execAgent`/`turnSetup`; `botScopeKey` lane in agent-signal
  (`forBotThread`, `botMessageMerged` source type, `BotAgentSignalSourceInput`).
- Messenger/channel UI, routes, agent bot store slice, `SettingsTabs.Messenger`,
  `notification.im.*` settings, messenger onboarding step, labs `enableImessage`.
- CLI `bot*` commands; desktop `ImessageBridgeCtr`/`imessageBridgeSrv`/`imessageBridge` IPC;
  `message_api` in `device-gateway-client` + `gatewayConnectionSrv`.
- Models `agentBotProvider`, `messengerAccountLink`, `messengerInstallation`,
  `systemBotProvider`; `imAccounts` leg in `task` runtime + `listWorkspaceMembers`
  (IM-identity haystack and `<@U123>`/`<@!4521>` mention-folding gone); resource-transfer
  `botBindings`/`botPlatforms` manifest chain; `apiKeyScope` `botMessage`/`messenger`/
  `agentBotProvider` rows.
- Locales: `messenger.*` namespace files, `agent.channel.*` (304 keys), `sendToMessenger`,
  `notification.im.*`, `tabKeywords.messenger`, `tab.messenger`, `messengerBanner`,
  `flow.steps.messenger`, `labs.features.imessage`, `subscription.messengerWechat`
  (en-US + zh-CN mirrors).
- Docs `docs/usage/{messenger,channels}/`, `docs/development/basic/add-new-bot-platform*`;
  `.env.example` Message Gateway / Messenger Bot sections; `env/gateway.ts` `MESSAGE_GATEWAY_*`.
- `BotPlatformContextInjector`, `DiscordContextProvider` context-engine injectors.
- `mergeNotificationSettings` IM nested-platforms branch; `types/user/settings/notification.ts`
  IM interfaces; `searchAssignableMembers` messengerAccountLinks EXISTS leg.

## Validation

- `pnpm type-check` (apps/server): no new errors over the \~300-file baseline; a dangling
  `export type {` in context-engine and a stale `agentBotProvider` apiKeyScope row were fixed.
- `bun run check`: 1699 related tests pass, lint warnings-only (preexisting `agentSlug`,
  `fileId`, `size` unused-arg warnings present on HEAD).
- Fixed test fallout: `GatewayConnectionCtr` (message\_api leg removed, 98 pass),
  `execAgent.device` (bot-context cases rewritten/deleted), `listWorkspaceMembers`
  ('neko' IM-identity query → 'chen'), `normalizeAgentState` (`channel: {}` dropped),
  `desktopRouter.sync` lazy-import floor 90→80, `scopeKey`/`sourceEvent` bot cases,
  `feedbackAction` `trigger: 'bot'` → `'api'`, `builtin-tools/register.ts` dangling import,
  `useFileItemDropdown.test` stray `);`.
- Env note: `apps/desktop` is not a pnpm/bun workspace member — `@orvilo/device-identity`,
  `device-control`, `device-sandbox` were symlinked into root `node_modules` to run its
  vitest suite locally; CI resolves them via the bun-workspace hoist.

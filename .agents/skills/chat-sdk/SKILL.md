---
name: chat-sdk
description: 'Use for multi-platform bots built with chat SDK: webhooks, mentions, slash commands, cards, modals and streaming.'
user-invocable: false
---

# Chat SDK

Vercel Chat SDK is an external TypeScript dependency. Orvilo uses Slack as its first IM channel; the SDK supports additional platforms without making them Orvilo product commitments. Read [the product contract](../../../docs/development/product-scope.md) before changing Slack behavior.

Orvilo pins `chat`, `@chat-adapter/slack`, and `@chat-adapter/state-ioredis` to `4.42.0`. Use their supported public exports; do not patch SDK internals or import private implementation files.

## Critical: Read the bundled docs

The `chat` package ships with full documentation in `node_modules/chat/docs/` and TypeScript source types. **Always read these before writing code:**

```
node_modules/chat/docs/index.mdx # Documentation entry point
node_modules/chat/docs/          # Core guides and API reference (MDX files)
node_modules/chat/resources/     # Published integration guides and templates
node_modules/chat/dist/          # Built types (.d.ts files)
node_modules/@chat-adapter/slack/dist/
node_modules/@chat-adapter/state-ioredis/dist/
```

Key docs to read based on task:

Paths below are relative to `node_modules/chat/`; verify them in the installed pinned package.

- `docs/index.mdx` — documentation overview
- `docs/getting-started.mdx` — setup guides
- `docs/usage.mdx` — event handlers, threads, messages, channels
- `docs/streaming.mdx` — AI streaming with AI SDK
- `docs/cards.mdx` — JSX interactive cards
- `docs/actions.mdx` — button/dropdown handlers
- `docs/modals.mdx` — form dialogs (Slack only)
- `docs/handling-events.mdx` — handler routing, including direct messages
- `docs/platform-adapters.mdx` — platform capabilities
- `docs/state-adapters.mdx` and `docs/concurrency.mdx` — persistence and locking
- `docs/api/chat.mdx` and `docs/api/thread.mdx` — public Chat and Thread APIs
- `resources/guides/how-to-build-a-slack-bot-with-next-js-and-redis.md` — Slack integration guide

Platform-specific details also live in the installed adapter README and public types. The published core package has no `docs/adapters/` or `docs/state/` directories.

Also read the TypeScript types from `node_modules/chat/dist/` to understand the full API surface.

## Quick start

This SDK example omits Orvilo identity and Agent authorization. Production handlers must use the existing installation, member-link and conversation-binding checks before executing an Agent. Give each installation its own state key prefix.

```typescript
import { Chat } from 'chat';
import { createSlackAdapter } from '@chat-adapter/slack';
import { createIoRedisState } from '@chat-adapter/state-ioredis';

const bot = new Chat({
  userName: 'mybot',
  adapters: {
    slack: createSlackAdapter({
      botToken: process.env.SLACK_BOT_TOKEN!,
      signingSecret: process.env.SLACK_SIGNING_SECRET!,
    }),
  },
  state: createIoRedisState({
    url: process.env.REDIS_URL!,
    keyPrefix: 'orvilo:slack:installation-id',
  }),
});

bot.onNewMention(async (thread) => {
  await thread.subscribe();
  await thread.post("Hello! I'm listening to this thread.");
});

bot.onSubscribedMessage(async (thread, message) => {
  await thread.post(`You said: ${message.text}`);
});
```

## Core concepts

- **Chat** — main entry point, coordinates adapters and routes events
- **Adapters** — platform-specific (Slack, Teams, GChat, Discord, GitHub, Linear)
- **State** — pluggable persistence (Redis for prod, memory for dev)
- **Thread** — conversation thread with `post()`, `subscribe()`, `startTyping()`
- **Message** — normalized format with `text`, `formatted` (mdast AST), `raw`
- **Channel** — container for threads, supports listing and posting

## Event handlers

| Handler                    | Trigger                                           |
| -------------------------- | ------------------------------------------------- |
| `onNewMention`             | Bot @-mentioned in unsubscribed thread            |
| `onSubscribedMessage`      | Any message in subscribed thread                  |
| `onNewMessage(regex)`      | Messages matching pattern in unsubscribed threads |
| `onSlashCommand("/cmd")`   | Slash command invocations                         |
| `onReaction(emojis)`       | Emoji reactions added/removed                     |
| `onAction(actionId)`       | Button clicks and dropdown selections             |
| `onAssistantThreadStarted` | Slack Assistants API thread opened                |
| `onAppHomeOpened`          | Slack App Home tab opened                         |

## Streaming

Pass any `AsyncIterable<string>` to `thread.post()`. Works with AI SDK's `textStream`:

```typescript
import { ToolLoopAgent } from 'ai';
const agent = new ToolLoopAgent({ model: 'anthropic/claude-4.5-sonnet' });

bot.onNewMention(async (thread, message) => {
  const result = await agent.stream({ prompt: message.text });
  await thread.post(result.textStream);
});
```

## Cards (JSX)

Set `jsxImportSource: "chat"` in tsconfig. Components: `Card`, `CardText`, `Button`, `Actions`, `Fields`, `Field`, `Select`, `SelectOption`, `Image`, `Divider`, `LinkButton`, `Section`, `RadioSelect`.

```tsx
await thread.post(
  <Card title="Order #1234">
    <CardText>Your order has been received!</CardText>
    <Actions>
      <Button id="approve" style="primary">
        Approve
      </Button>
      <Button id="reject" style="danger">
        Reject
      </Button>
    </Actions>
  </Card>,
);
```

## Packages

| Package                       | Purpose                       |
| ----------------------------- | ----------------------------- |
| `chat`                        | Core SDK                      |
| `@chat-adapter/slack`         | Slack                         |
| `@chat-adapter/teams`         | Microsoft Teams               |
| `@chat-adapter/gchat`         | Google Chat                   |
| `@chat-adapter/discord`       | Discord                       |
| `@chat-adapter/github`        | GitHub Issues                 |
| `@chat-adapter/linear`        | Linear Issues                 |
| `@chat-adapter/state-redis`   | Redis state (production)      |
| `@chat-adapter/state-ioredis` | ioredis state (alternative)   |
| `@chat-adapter/state-memory`  | In-memory state (development) |

## Dependency updates

Orvilo consumes the published SDK; this repository does not release `chat` or its adapters. Update the pinned dependency versions using pnpm, preserve this repository's `lockfile: false` policy, inspect the corresponding bundled docs/types, and run Orvilo's affected checks. Do not add an upstream SDK Changeset or apply its monorepo release workflow here.

## Webhook setup

Each adapter exposes an HTTP handler via `bot.webhooks.{platform}`. In Orvilo, the public Hono route verifies the untouched Slack signature and awaits durable Hatchet enqueue before ACK. The trusted worker rechecks the installation/token revision and uses public `adapter.parseMessage(rawEvent)` plus `bot.processMessage(adapter, threadId, message)`; never fabricate or re-sign a provider request. Keep Hatchet as the only delivery queue; SDK queue/debounce strategies collapse messages and do not preserve Orvilo's per-human ordered inputs.

Use `bot.thread(threadId)` to reconstruct a thread outside a handler, then `thread.post()` and the returned message's `edit()` for delivery. `Chat.createThread` is private. Use only exported SDK APIs; no Bolt Receiver injection or private Chat runtime hooks are required.

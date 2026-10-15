---
name: agent-testing-bot
description: 'Historical bot-channel acceptance entry point. Use only to investigate retired Messenger integrations; current Slack integration has separate owners.'
disable-model-invocation: true
---

# Retired Messenger Acceptance

The generic Messenger/bot-channel stack and its Electron BlueBubbles bridge were
removed. The platform scripts and guides in this directory are historical
reference, not supported acceptance recipes. Do not recreate deleted adapters,
IPC methods, providers or routes to make these scripts run.

The current Slack integration is a separate implementation:

- `apps/server/src/services/slackIntegration/`: OAuth, webhooks and channel runtime.
- `apps/server/src/routers/lambda/slackIntegration.ts`: client-facing procedures.
- `apps/server/src/hatchet/tasks.ts`: queued Slack integration event processing.

Trace those owners and their adjacent tests for current Slack work. Use
`.agents/acceptance/PROCESS.md` for evidence capture. Consult
`docs/development/slimming-orv-105-messenger.md` only as a historical retirement
record; its retained-surface list describes that change's revision.

# Slack OAuth and Vercel Chat SDK

## Accepted scope

Slack uses real frontend/backend OAuth and Vercel Chat SDK within Orvilo's
existing workspace settings. The integration retains Orvilo's components, identity
and Agent model. Current product behavior follows
[the product contract](./product-scope.md#7-资料记忆会话引用与-slack); earlier transport
verification records below describe their recorded revision only.

Observable acceptance: a workspace administrator installs the actual Slack App,
returns to a persisted connected workspace, binds a real Slack channel or direct
message to an accessible Agent, and a linked Slack user mentions that Agent or
sends a direct message and receives its real response through Vercel Chat SDK.
Reload retains installation/bindings;
provider cancellation, denied access and failed writes do not create success states. Disconnect
removes access. Other workspace members link their own Slack identity before
executing Agents. No sender inherits the installing administrator's authority.

## UI specification

- Destination: `/:workspaceSlug/settings/integrations`, Slack detail within the
  same surface. Existing Connector/MCP settings remain their own domain.
- Entry icon: `Cable` from the already installed `lucide-react` package.
- Reference: <https://docs.plane.so/integrations/slack> ; public screenshots:
  <https://media.docs.plane.so/integrations/slack/connect-personal-slack.webp> and
  <https://media.docs.plane.so/integrations/slack/configure-slack-integration.webp> .
- User-supplied dark screenshot shows an Integrations heading, Apps section and
  wide horizontal provider cards with a recessed logo, title and description.
  It is visual evidence, not measured CSS or a complete live-state inventory.
- Reuse existing workspace settings container, semantic theme tokens, buttons,
  dialogs, skeletons, selects and OAuth-session helpers. No Plane source or its
  AGPL preview components are imported into the production feature.
- List: Integrations heading and concise description, Slack card with Configure.
- Detail: Back to integrations; Slack header and Install/Connected; personal
  account connection; connected Slack workspace; Conversation connections list.
- Conversation mapping reuses Plane's channel-to-project layout, but maps a Slack
  channel or direct message to an Orvilo Agent. Add/Edit opens a dialog selecting
  a real conversation and Agent; Delete removes that binding. Do not add project
  notification rules,
  DM preferences, credential forms or a setup wizard without a working consumer.
- Empty/loading/error/non-admin states must be explicit. Unconfigured deployment
  shows unavailable installation with an actionable explanation, never a demo
  success. Busy actions prevent duplicates; failed saves retain drafts/state.
- Desktop: single content lane in the existing container. Narrow screens stack
  rows and controls; preserve keyboard focus and accessible labels.
- Geometry and colors follow DESIGN.md roles. Exact pixel parity is not claimed
  because authenticated live Plane computed styles are not available yet.

## API and ownership

`slackIntegration.status({workspaceId})` returns configuration availability,
manage permission, installation, current member's connection, conversation
bindings,
and accessible Agent choices. `startOAuth` accepts workspace/personal mode and a
correlated attempt nonce. Channel and direct-message listing is paginated. Binding
mutations validate the real conversation and Agent; all data is scoped to the
authorized workspace.
Stopping the client's authorization wait does not revoke a provider grant; that
control is labeled Stop waiting. Slack's Cancel returns a denied authorization.

OAuth uses a single-use expiring server state and token exchange; permissions are
rechecked on callback. Tokens are encrypted with the existing vault mechanism.
One Slack team connects to one Orvilo workspace in this initial implementation.
Separate installation, user-link and conversation-binding records carry that
boundary.

The external packages `chat`, `@chat-adapter/slack`, and
`@chat-adapter/state-ioredis` are pinned to `4.42.0`. Use `Chat`,
`createSlackAdapter`, and `createIoRedisState` through their public exports.
The Hono route verifies the original HTTP signature and durably queues the parsed
envelope. After rechecking its installation revision, the trusted worker calls
public `adapter.parseMessage()` and `bot.processMessage()` APIs. It never rebuilds
or re-signs a Slack request and needs no additional listener or Bolt Receiver patch. Reconstruct threads with
`bot.thread(threadId)` and deliver replies through `thread.post()` and the returned
message's `edit()`. Each installation has its own adapter/token/state namespace.
Real Agent runs reuse ResponsesService and existing execution authorization.
Execution sessions also separate the executing Orvilo user. The SDK's thread
subscription alone does not authorize an Orvilo Agent run.

Signed Slack requests are verified before tenant lookup and asynchronous dispatch.
The existing cloud task queue owns background execution so Slack acknowledgments
do not wait for model completion. There is no local-backend fallback.

## Historical verification record (CopilotKit Channels)

The following record predates the Vercel Chat SDK migration and is preserved as
historical evidence. It does not verify the new transport. OAuth consent, cloud
deployment, Agent execution, tests and source inspection are distinct gates.

Scoped backend, database, SDK and frontend checks pass locally. Independent review
found and verified repairs for stale OAuth/binding writes across disconnect,
cross-worker message serialization before SDK deduplication, and stale binding
drafts. Real Redis StateStore conformance runs with a disposable service in the
server CI job; type checking is CI-only.

The former SDK legacy streaming path could swallow some final Slack update errors.
This observation applies to that historical transport and is not a delivery
receipt or an API guarantee for Vercel Chat SDK.

## Deployment configuration

Set server-only `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and
`SLACK_SIGNING_SECRET` through the deployment's secret store. The app and Hatchet
worker must run the same revision and use the same database and Redis namespace.
Database migrations run through the normal deployment startup. Slack migration
`0211_slack_integration` was normally regenerated after the published
`0210_task_completion_live_executor` migration merged. Its generated snapshot
retains all 249 preceding tables, adds the three Slack tables, and links to the
unchanged 0210 snapshot; the 0210 SQL and existing journal entries remain intact.
The regenerated SQL retains the reviewed idempotent table, foreign-key, and
unique-index clauses. This source integration does not claim production migration
application or real Slack OAuth/message delivery.

The Slack App uses HTTP events (Socket Mode off) with OAuth redirect
`<APP_URL>/oauth/slack/callback`. Events and Interactivity both target
`<APP_URL>/api/webhooks/slack`. Enable `app_mention`, `message.channels`,
`message.groups`, and `message.im` events. The installed bot scopes are
`app_mentions:read`, `chat:write`, `channels:read`, `channels:history`, `groups:read`, `groups:history`,
`im:read`, `im:history`, `users:read`, and `files:read`; user OAuth requests
`users:read` to verify the linked identity.
If Slack uses a separate HTTPS ingress, set `SLACK_REDIRECT_URI` to its exact
callback URL on both the app and worker and register that URL with Slack. Keep
`APP_URL` at the application's origin: it also defines the Electron OIDC issuer.
Token rotation is off for this app; rotating grants fail closed instead of
persisting tokens that this implementation cannot refresh.

Existing installations must authorize the added DM scopes before DM setup works.
Open a direct message with the app, then select that conversation in the existing
Agent connection picker. DMs use the other Slack user's ID as their stable label;
no additional profile lookup is required. Group DMs are not supported.

Invite the app to the selected Slack channel (required for private channels).
Only linked Orvilo members who can use the bound Agent execute messages. A
mention or direct message starts a run; replies continue that user's existing
Agent conversation.
Current Slack thread text and directly uploaded attachments are Agent inputs;
attachments are resolved by file ID through the installation before downloading.
When a single pending native question or permission request is available for the
bound Issue Run, Slack displays a thread-scoped reply token. Reply with
`reply <token> <native option ID>` for a permission decision, or
`reply <token> {"question text":"answer"}` for questions (arrays for multiple
selections). Submission revalidates the current Issue assignee scope, Agent Use
permission, exact pending request and native options. Ambiguous or unavailable
requests require opening the Issue in Orvilo. View evidence and accept final
delivery in Orvilo using the Issue link. A run with an ambiguous outcome remains
blocked instead of automatically dispatching it again. Successful source checks
do not prove Slack delivery; record real OAuth, message and Agent evidence for
the migrated revision separately.

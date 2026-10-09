# Slack OAuth and CopilotKit Channels

## Accepted scope

The user selected Plane's integration UI and then explicitly requested real
frontend/backend OAuth using CopilotKit Channels. This replaces the preceding
standalone simulated preview. This implementation lives in Orvilo's existing
workspace settings and retains Orvilo's components, identity and Agent model.

Observable acceptance: a workspace administrator installs the actual Slack App,
returns to a persisted connected workspace, binds a real Slack channel to an
accessible Agent, and a linked Slack user mentions that Agent and receives its
real response through CopilotKit Channels. Reload retains installation/bindings;
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
  account connection; connected Slack workspace; Channel connections list.
- Channel mapping reuses Plane's channel-to-project layout, but maps a Slack
  channel to an Orvilo Agent. Add/Edit opens a dialog selecting a real channel
  and Agent; Delete removes that binding. Do not add project notification rules,
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
manage permission, installation, current member's connection, channel bindings,
and accessible Agent choices. `startOAuth` accepts workspace/personal mode and a
correlated attempt nonce. Channel listing is paginated. Binding mutations validate
the real channel and Agent; all data is scoped to the authorized workspace.
Stopping the client's authorization wait does not revoke a provider grant; that
control is labeled Stop waiting. Slack's Cancel returns a denied authorization.

OAuth uses a single-use expiring server state and token exchange; permissions are
rechecked on callback. Tokens are encrypted with the existing vault mechanism.
One Slack team connects to one Orvilo workspace in this initial implementation.
Separate installation, user-link and channel-binding records carry that boundary.

CopilotKit Channels core/slack are pinned to 0.11.0. The Slack adapter needs a
minimal Bolt Receiver injection patch so the existing server can accept signed
HTTP events without starting another listener. Each installation has its own
adapter/token/state namespace. Real Agent runs reuse ResponsesService and existing
execution authorization. Thread state also separates the executing Orvilo user.

Signed Slack requests are verified before tenant lookup and asynchronous dispatch.
The existing cloud task queue owns background execution so Slack acknowledgments
do not wait for model completion. There is no local-backend fallback.

## Verification record

Implementation and runtime evidence will be recorded here. OAuth consent,
cloud deployment, Agent execution, tests and source inspection are distinct gates.

Scoped backend, database, SDK and frontend checks pass locally. Independent review
found and verified repairs for stale OAuth/binding writes across disconnect,
cross-worker message serialization before SDK deduplication, and stale binding
drafts. Real Redis StateStore conformance runs with a disposable service in the
server CI job; type checking is CI-only.

## Deployment configuration

Set server-only `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and
`SLACK_SIGNING_SECRET` through the deployment's secret store. Set
`COPILOTKIT_TELEMETRY_DISABLED=true` for this integration. The app and Hatchet
worker must run the same revision and use the same database and Redis namespace.
Database migrations run through the normal deployment startup.

The Slack App uses HTTP events (Socket Mode off) with OAuth redirect
`<APP_URL>/oauth/slack/callback`. Events and Interactivity both target
`<APP_URL>/api/webhooks/slack`. Enable `app_mention`, `message.channels`, and
`message.groups` events. The installed bot scopes are `app_mentions:read`,
`chat:write`, `channels:read`, `channels:history`, `groups:read`, `groups:history`,
and `users:read`; user OAuth requests `users:read` to verify the linked identity.
Token rotation is off for this app; rotating grants fail closed instead of
persisting tokens that this implementation cannot refresh.

Invite the app to the selected Slack channel (required for private channels).
Only linked Orvilo members who can use the bound Agent execute messages. A
mention starts a run; replies continue that user's existing Agent conversation.
Attachments and approval resolution are not forwarded; messages explain when
the user must return to Orvilo. A run with an ambiguous outcome remains blocked
instead of automatically dispatching it again. SDK legacy streaming can swallow
some final Slack update errors; successful source checks do not prove delivery.

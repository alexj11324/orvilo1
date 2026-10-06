# GitHub event automations

GitHub PR and CI events use repository Webhooks and the existing automation
dispatch pipeline. A GitHub connection authorizes repository access; it does not
install a Webhook. Setup therefore saves a paused trigger, verifies GitHub's
signed ping, and checks the saved Agent and Device before enabling execution.

## Configure a trigger

1. In the intended workspace, connect GitHub and configure an Agent on an
   enrolled workspace Device. The Device must be online and able to execute the
   selected Agent.
2. Create an automation with an **Event** trigger. Open its settings, select the
   GitHub source, and enter the repository as `owner/repository`.
3. Select a PR or CI event and save the paused trigger. PR actions include
   opened, reopened, updated (`synchronize`), and closed. CI triggers accept
   completed events, with an optional success/failure conclusion filter.
4. Optionally enter an exact branch name. An empty field accepts all branches;
   PRs match their head branch, and CI matches the event's head branch.
5. Copy the callback URL and signing secret from the saved trigger. In the
   repository's **Settings → Webhooks**, add that URL, select
   `application/json`, paste the secret, and select the event shown in Orvilo.
   Configuring repository Webhooks requires GitHub administrator permission.
6. GitHub sends a signed ping. After its delivery succeeds, refresh readiness
   in Orvilo, resolve any reported blockers, and enable the trigger.

The Orvilo server's `APP_URL` must be its externally reachable HTTPS origin.
GitHub cannot deliver to a local HTTP callback. Native events supported here are
`pull_request`, `workflow_run`, `check_run`, and `check_suite`; each saved binding
selects one event. A repository Hook configured for additional events still
receives an acknowledgement, but only the selected event enters the inbox.

## Pausing, stopping, and execution failures

**Pause** prevents new occurrences and does not cancel an already running
occurrence. Events received while paused are skipped; resuming does not replay
them. Readiness checks the saved Device, source authorization, execution
configuration, and an observed worker invocation. An offline saved Device is
retained rather than replaced with a different executor.

**Stop source** revokes the local callback. Remove the repository Webhook in
GitHub as well: Orvilo does not manage the remote Hook. To change the repository
or trigger filters, stop the source and save a new binding. Old callbacks return
an inactive response and cannot dispatch work.

Run history and saved result receipts remain part of the existing automation
history. A failed execution is not a successful result; repeated automatic
failures follow the existing automation fuse policy.

## Receipt and dispatch contract

- `/api/webhooks/github-events/:callbackToken` verifies HMAC-SHA256 over the
  original body bytes, then checks the verified repository ID and Hook identity.
  The per-binding signing secret is encrypted in storage and disclosed only
  through the authorized setup action. Do not put it in logs or screenshots.
- Signed ping activation uses the binding revision. Delivery UUIDs deduplicate
  the durable inbox; an existing UUID with different bytes is rejected.
- Acknowledgement waits for the durable receipt, not for an Agent to start.
  Both accepted and duplicate deliveries wake consumption. Queue mode uses
  Hatchet; queue-free server hosts run the same leased inbox sweep locally.
- Dispatch rechecks trigger state, membership, source authorization and the
  saved GitHub grant identity. Disconnecting or replacing that authorization
  prevents old bindings from admitting new work.
- Native GitHub receipt is separate from the experimental MCP subscription wire
  protocol. The `mcp_event_automations` flag continues to gate MCP sources.

## Acceptance boundary

The actual GitHub → signed receipt → canonical dispatch → bound OpenCode ACP →
saved result path was exercised through Electron for PR #476. The
[recorded evidence](./github-event-automation-evidence/README.md) covers PR first,
duplicate and independent second events, completed CI failure and duplicate,
completion admission, pause without replay, unavailable Device, and failed
execution. It identifies the business revision and the earlier Electron build,
whose affected Automation and Agent settings sources match that revision.

Unit tests, migrated storage, an authenticated GitHub fixture, and a working CLI
are intermediate checks. Review the runtime evidence and its limitations before
claiming the complete path on another configuration or revision.

The local test fixture uses the existing CLI's real GitHub authorization,
encrypted in an isolated database. It does not establish native OAuth UI
acceptance. No signing secret or access token belongs in published evidence.

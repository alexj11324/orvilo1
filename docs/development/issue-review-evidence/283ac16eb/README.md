# Stop and saved-environment checkpoints

Feature: `96cebb5b1daaf8f2e4e76463b03de3046fb30b58`.
Saved-env repair: `640bdd3e6`.
Type-contract repair and refreshed runtime:
`283ac16eb803599a828f61b1bdd22ff203948041`.

The environment is the same isolated real Electron/local backend described in
the [first checkpoint](../96cebb5b1/README.md).

## Three consecutive failures

T-21 automatically ran three assignee attempts and three reviewer sessions.
After the third failure, it stayed In Progress, posted one stop comment and
created one `issue_review_stopped` notification for the human assignee. There
was no fourth assignee attempt. The saved-env fix landed during this loop; the
type-only repairs followed it. The screenshots capture the final stopped state,
not a fresh rerun on the later revision.

- [Verdicts, three attempts, stop comment and Inbox row](three-failures-stop.json)
- [In Progress with the stop comment](three-fails-stopped-light.png)
- [Owner Inbox notification](three-fails-owner-inbox-light.png)

## Saved env after offline queue replay

On a fresh runtime at `283ac16eb`, an ordinary saved OpenCode Agent run queued
while its device was offline. The queue persisted no environment variables.
After reconnect, the same operation ran `printenv XDG_DATA_HOME` and returned
the Agent's saved `/private/tmp/issue769-orchestrator-data` setting. Its frozen
model arguments were `opencode/mimo-v2.6-flash-free`.

[Actual queued request and shell output](saved-env-replay.json)

The preceding hot-update probe returned unset because the existing development
recovery timer retained the pre-fix instrumentation module. Restarting only the
owned test runtime loaded the new code; no additional production code change
was needed.

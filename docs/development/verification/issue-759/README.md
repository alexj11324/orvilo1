# Saved Agent runtimes and user-owned devices — #748 / #759

Electron acceptance captured on 2026-10-12 for PR #750. The application was the
actual Electron desktop renderer (`app://renderer`), with real desktop CLI
execution, device/Agent gateways, isolated PostgreSQL and Redis, and OpenCode
1.19.0 using `opencode/mimo-v2.6-flash-free`.

## Revisions

| Evidence                                                                  | Source revision                            |
| ------------------------------------------------------------------------- | ------------------------------------------ |
| Visibility switching and refused-create editable draft                    | `0c9ef0247fcae76459a63bb68b7d53eb6b58335c` |
| Second-member permission confirmation and successful run                  | `cf5cd6e50973c8659d82ac9ed9e3b3aefebf6033` |
| Immediate offline failure, private run, Agent lists, devices and composer | `eda79373d85df4268d1b668e774d8fe0703b4cfa` |

The earlier creation evidence is reused because subsequent changes corrected
transport ownership, initiating-member authorization and error synchronization;
they did not change the demonstrated creation form behavior. The evidence-only
commit adds no application behavior.

## Observed outcomes

| Outcome                                                                                                                                                                | Evidence                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private and workspace Agents can be created inside the workspace, on the owner's connected device.                                                                     | [Owner Agent list](owner-agents.png), saved configurations in [runtime evidence](runtime-evidence.json)                                                                                                                   |
| Switching visibility preserves Agent type, model and device.                                                                                                           | [Visibility form](visibility-preserves-device.png); switched Only me → Workspace members → Only me                                                                                                                        |
| A refused create shows the server reason and leaves the name editable. Correcting the draft and retrying creates the corrected Agent once.                             | [Refused draft](refusal-remains-editable.png); temporarily removed the fixture's registered device row to provoke admission refusal, then restored registration through Electron and retried as `759 Final Private Agent` |
| A private Agent runs on its saved device and model.                                                                                                                    | [Private reply](private-run.png), completed operation `op_1791838537862_agt_HbpPCnNyytC6_tpc_YwtpPZX3ECAt_UThDbASc`                                                                                                       |
| A second member sees the public Agents and their safe model/device metadata; the owner's private Agents are absent.                                                    | [Member Agent list](member-agents.png)                                                                                                                                                                                    |
| The second member runs the workspace Agent on the owner's device, including a real tool-permission round trip.                                                         | [Member permission confirmation](member-approval.png), [successful reply](member-run.png), completed operation `op_1791837490533_agt_vTbVtEbtvKCk_tpc_bKsQtqXll0Xp_54G2HLOQ`                                              |
| Disconnecting the owner device refuses execution immediately and names the offline device, even while the member's own device remains connected.                       | [Immediate offline failure](owner-offline.png), `DEVICE_OFFLINE` and connection observations in [runtime evidence](runtime-evidence.json)                                                                                 |
| A configured Orchestrator is preselected in a new conversation. The composer offers an Agent and retains working directory/permissions without model/device selection. | [New conversation](orchestrator-default.png), [composer settings](composer-settings.png); `759 OpenCode Private` was saved as this member's Orchestrator/default Agent                                                    |
| Devices have one owned-device list with no workspace-sharing action. The titlebar indicates the connected device.                                                      | [Device settings](devices.png)                                                                                                                                                                                            |

The cross-member run retained `user_759_member` as the operation actor and the
workspace as its authorization context, while dispatch used
`user_agent_testing_001` / `0cc1d9bca3f59b499d6497aaf4278be1` as physical transport
identity. The member selected **Allow once** and submitted the permission
response; the command wrote `/tmp/orvilo-759-token-proof.txt` with
`759 final owner proof` and returned `759 verified owner-device reply`.

The offline send used the same existing conversation. Its assistant error
appeared without reopening or refreshing the page. Admission ended before
dispatch (no model route/remote admission was recorded); it did not fall back to
the member's connected device. The owner's connection was restored afterward.

Two accounts used separate Electron processes, profiles and registered device
IDs on one Linux test host. This verifies account isolation and cross-owner
gateway routing; it is not a test on two physically independent machines. Agent
handoff confirmation used keyboard activation in the existing modal.

## Automated verification

All commands used the repository's scoped `bun run check --lint --test` workflow;
the complete root test suite was not run locally.

| Scope                                                                                                                     | Result                                                |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 148 changed files: creation, saved-runtime resolution, owned-device admission, database models, routers, CLI and UI hooks | 1500 tests passed; lint clean; 2 scopes had no linter |
| Canary integration: unified titlebar hints and removed RPC scope option                                                   | 16 tests passed; lint clean                           |
| Saved-owner CLI dispatch                                                                                                  | 27 tests passed; lint clean                           |
| Desktop initiating-member token identity                                                                                  | 104 tests passed; lint clean                          |
| Existing/new-topic pre-dispatch error synchronization and retired override assertions                                     | 82 tests passed; lint clean                           |

The last command was:

```sh
bun run check --lint --test \
  src/store/chat/slices/agentRun/actions/transports/gateway/gateway.ts \
  src/store/chat/slices/agentRun/actions/__tests__/gateway.test.ts
# ✓ 2 files · lint clean · tests 82 passed
```

The broader check preceded the final targeted transport/token/error fixes. Their
owning tests were checked after each fix. Database regressions cover real rows,
private workspace creation, creator-owned bindings, visibility preservation,
member access and owner departure. Saved-runtime integration tests use real
member preference rows and show removed overrides cannot alter the saved model
or device. Creation-hook tests cover refusal, edited retry and duplicate guards.

Vite production build passed (32,676 modules, 34.62 seconds); CLI and Electron
development main/preload builds passed. The structural Drizzle migration applied
successfully to the isolated database. Commit hooks and `git diff --check` passed.
The full repository Typecheck remains a separate CI gate; no passing local full
typecheck is claimed.

CI subsequently exposed retired fields in existing test fixtures and two
configuration typing gaps. The follow-up removes the remaining private-Agent
restriction from Session creation and the separate event-automation device
selector/pin. Tasks dispatch without task-level model/provider/device overrides;
readiness queries each registered device owner's gateway and uses the Agent's
saved device. The affected Session, transfer, copy, task-run and readiness
regressions passed (287 tests). The final cleanup lint is clean across 50 files.
These follow-up changes reuse the Electron evidence for the unchanged creation,
chat and device surfaces; the event-readiness/dispatch changes have automated
coverage and are not claimed as a live webhook end-to-end test.

Final CI assertion cleanup passed 29 application regressions and 82 gateway
regressions. Task and batch-execution integration passed all 134 tests against a
fresh dedicated local PostgreSQL database with Redis, using serial workers and
a 20-second local runner timeout. Earlier PGlite/default-Redis attempts hit local
timeouts; concurrent initialization also raced migrations, so those attempts
are not reported as passes. No repository timeout or application behavior was
changed for this final test-only cleanup. The frontend build on `40b514d` passed
in 25.90 seconds.

`runtime-evidence.json` contains only whitelisted fixture identifiers, saved
runtime fields, operation outcomes and the named offline error. No login tokens,
environment variables, gateway secrets or private signing keys are included.

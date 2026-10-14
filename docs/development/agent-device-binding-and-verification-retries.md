# Agent device binding and verification retries

Every newly created Agent, including virtual and builtin Agents, must name a registered device in its authorized scope. A device may be offline; that affects dispatch readiness, not whether its identity exists. Public workspace Agents require a public device in the same workspace. Personal Agents require their owner's personal device. Private workspace Agents can retain their authorized personal host.

Migration `0213_agent_device_binding_guard` derives `agents.bound_device_row_id` from the configured identity and applies a PostgreSQL check and foreign key. A caller cannot supply a different registry UUID to bypass validation. The trigger uses `FOR SHARE` to serialize binding creation against retirement and visibility changes. Device identity changes and deletions cannot invalidate existing Agent references.

Historical rows are preserved with `NOT VALID` constraints. Every new insert and update is checked. An old unbound row remains readable but requires explicit runtime configuration before modification or execution. Builtin provisioning copies only an explicitly configured runtime in the same scope, with current configuration access; it retains its own role and tools and never copies source conversation history or environment secrets. An existing configured builtin does not move devices when another member selects a different default.

Run `bun scripts/backfillAgentDeviceBindings.ts --apply` with the intended database environment after the normal schema deployment. The script scans bounded keyset batches; `--after=agt_ID` resumes it. It resolves existing explicit bindings or configured builtin defaults, preserves unresolved rows, and reports counts. It does not select an arbitrary online device. The deployment already applies Drizzle migrations; this optional historical reconciliation is separate from schema deployment.

Scope transfers retain a binding only when it is authorized in the destination. The backend `agent.transferAgents` input accepts an optional `targetDeviceId` for an explicit replacement; missing destination authority blocks the whole transaction rather than stripping the binding. Inbox session bootstrap preserves the builtin runtime rather than replacing it with server model defaults.

Member-to-member ownership handover also checks the recipient's device authority before changing ownership or associated resources. An inaccessible personal or private host blocks handover; the current owner must explicitly select a device both parties can use first. Handover never clears the required binding.

Member removal retires personal shares and private workspace enrollments in the same transaction as permission revocation. Retired devices remain referenced for history, but cannot be selected or dispatched to. A confirmed share with a fresh device-side enrollment may restore a retired row; a passive reconnect cannot. Account deletion preserves another member's referenced workspace registry identity under retired workspace-owner custody.

## Verification recovery

Verifier configuration, device, startup and judgment-binding errors are `errored`, with no delivery verdict. They do not cause worker recovery or automatic delivery repair. The orchestration workflow waits with `verification_unavailable`.

`verify.retryVerification({ operationId })` is restricted to the run creator or an authorized workspace owner and a run whose status is `errored`. It retries the existing operation's recorded delivery, confirmed plan and evidence. Only errored criteria return to pending; passed, failed and skipped criteria remain unchanged. Legacy runs can recover their original assistant reply through its operation provenance; missing provenance is an explicit precondition.

Each pending criterion is claimed once with a UUID attempt identity. All synchronous judgment, startup failure and tracing writes match that identity. A verifier child is bound after its operation row is persisted and before dispatch; its tool writeback and completion callback also match the current child identity. Old attempts cannot overwrite retries. A repaired result releases only a `verification_unavailable` system pause; a user's pause remains intact. Task settlement still checks the original execution contract before applying a late result.

Verifier execution requires its writeback tool, uses a custom toolset, and skips recursive task verification. A missing explicitly pinned reviewer blocks verification rather than silently switching reviewers. Workspace judgments keep their workspace scope and use the bound native runtime; deployment model credentials do not supply missing execution authority.

## Source-backed rationale

- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html): checks and foreign keys enforce writes; a check expression alone can accept null, so this contract explicitly rejects missing bindings and references a real registry row.
- [GitHub Actions self-hosted runners](https://docs.github.com/en/actions/reference/runners/self-hosted-runners): runner labels and groups identify eligible execution hosts; an offline matching runner affects job placement rather than justifying rerunning previously successful work.
- [Temporal error handling](https://docs.temporal.io/best-practices/error-handling): classify configuration errors, preserve failure identity, and retry the failed activity with idempotency. Here verification is a separate activity from delivering the files.

Mandatory device binding on the Agent record is Orvilo's product rule. These sources support database integrity, authorized placement and isolated retries; they do not establish that all competing Agent products use an identical data model.

# Core cloud recovery checkpoint

Cloud workspace: `/workspace/orvilo1`, Linux. Exact baseline:
`28dc3bbad36e4661f8d09154ff8b017cf5cadaeb`.

## Input integrity

All 11 original Core files (1661 lines) have now been restored and their complete
Git blob identities verified against the transferred patch headers. Original text,
individual patches, `all-original.patch` and `manifest.json` are retained in
`/workspace/scratch/core-original`. Subsequent repairs do not modify this snapshot.

The assembled original patch also passed `git apply --cached --check` against a
separate temporary index loaded with the exact baseline. No original file was
reconstructed: the briefly prepared action gateway reconstruction was preserved
separately in scratch and replaced only after comparing the received original.

| File                  | Original Git blob                        |
| --------------------- | ---------------------------------------- |
| actionGateway.test.ts | dfbc36001fdf7a9e94951aff26bdb1c5b71bcf38 |
| actionGateway.ts      | 7ffae3c7ebefdc022a43307002a914bafa905185 |
| contracts.ts          | 96f000e4c8483b9c93230864ee33329cc5448a95 |
| handoff.test.ts       | e3bb598cffaee67b368adf1e81af165194a51dab |
| handoff.ts            | c495d3cefa2f5e80d109cde1c90c6e370ad8fd6c |
| independent.test.ts   | 57ec2ac9f638cef71967212ac7bc3da94504a19b |
| inferenceBroker.ts    | 3020716d8efabf32fcc7de0041a84eb25cc53fbe |
| isolation.test.ts     | ae6d766344f537117f36191d2c2b654731b8254f |
| isolation.ts          | 410a671dee0267745d6a8d72200b8df931bead84 |
| primeRuntime.ts       | c4dcb7a909d663dbe70b8d9c681f472f6291c6b1 |
| verification.ts       | caf930b6e5dce0b82dea93b5ee74d4d18ea54e31 |

## Public integration entries

- `@orvilo/agent-execution`: original public API plus Core contracts/version.
- `@orvilo/agent-execution/controlPlane`: portable contracts and inference/configuration broker guards.
- `@orvilo/agent-execution/controlPlane/server`: trusted host receipt, file action, runtime, handoff and verification implementations.

The portable entry successfully bundles for the browser without filesystem/process
implementations. Provider and Events should implement the existing trusted backend,
authority and EventDispatchAdmission ports, preserving the original schema version.
The text-only inference contract does not yet express Prime tool-call semantics.

## Actual verification

The final consolidated Core scope plus package boundary suite passed **141 tests
in 14 files** on Linux at 16:51 UTC. Scoped strict TypeScript checking of all Core
sources and tests passed. Docker supervision tests include actual confined processes;
SQL receipt tests use disk-backed PGlite and real brokered file writes. Independent
Docker/SQL adversarial probes also passed, including orphan descendants, recovered
termination, withheld drain proof and durable reservation ownership.

The actual pinned Prime artifact completed ACP initialize/session creation and
whole-container shutdown with zero remaining processes. Reproduction, exact image
identity and output are in [protocol acceptance](../../scripts/acceptance/prime-protocol.md).
The build used the upstream fixture catalog fallback; no provider prompt was sent.

These are boundary, disk/SQL/transport tests where specifically documented. They do
not establish production authority integration or real provider execution. See
[isolation evidence](./core-isolation-cloud-evidence.md),
[handoff integration](./core-handoff-integration.md),
[pinned protocol](./core-prime-protocol.md), and
[inference integration](./core-prime-inference-integration.md).

No Mac execution, push, PR, merge, deployment, production credential creation,
external subscription, migration allocation or persistent permission change was
performed. Existing ACP integrations and canonical task completion remain unchanged.

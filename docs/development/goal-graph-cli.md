# Goal Graph CLI prototype

The Goal Graph runtime is intentionally usable without a Graph UI. The CLI is
only a client of the same server application service that a future UI,
scheduler, or signal source can call.

## Lifecycle

`goal tick` advances one deterministic transition:

1. Select the highest-priority non-terminal Work node whose explicit
   `depends_on` targets are resolved.
2. Create and bind exactly one responsible Task when the Work has none.
3. Start that Task through the existing General Agent runtime.
4. While the Task runs, report `waiting_external` without duplicating it.
5. On completion, pin the immutable Task Work version, create a Finding, and
   resolve the Work node.
6. On failure (`paused` with an error included), create a durable Decision node
   and stop at `waiting_human`; a manually paused Task is never restarted by the
   coordinator.
7. Mark the Goal achieved only after every Work node is terminal and no
   Decision is pending.

`goal run` repeatedly calls `tick`. It stops at achieved, a human gate, a
budget/no-progress boundary, or failure. It can be safely invoked again after a
restart because lifecycle state lives in PostgreSQL rather than in the CLI
process.

## Ornith reproduction scenario

```bash
orvilo goal create "Reproduce the Ornith self-improvement training system" \
  --requirement "A reproducible minimal training loop, frozen-set evaluation, and evidence that capability improves without verifier leakage" \
  --work \
    "Recover and validate the public training specification" \
    "Implement the minimal training loop" \
    "Build a frozen-set verifier and adversarial checks"

orvilo goal graph <goal-id>
orvilo goal run <goal-id>
```

When a failed Work opens a gate:

```bash
orvilo goal decisions <goal-id>
orvilo goal decide <goal-id> <decision-id> --option retry --reason "Harden the verifier first"
orvilo goal run <goal-id>
```

The graph can evolve during exploration instead of requiring all branches at
creation time:

```bash
orvilo goal add-node <goal-id> work "Run leakage-resistant frozen-set evaluation"
orvilo goal add-edge <goal-id> <finding-node-id> <new-work-node-id> leads_to
orvilo goal run <goal-id>
```

Budget exhaustion pauses coordination and is resumable:

```bash
orvilo goal set-budget <goal-id> --max-rounds 20 --max-cost 10
orvilo goal resume <goal-id>
orvilo goal run <goal-id>
```

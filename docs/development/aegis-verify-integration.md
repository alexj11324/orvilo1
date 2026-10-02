# Aegis method-pack integration (verify fusion)

The [Aegis](https://github.com/GanyuanRan/Aegis) execution-discipline method
pack is vendored into Orvilo and wired into the heterogeneous-agent verify /
artifact pipeline. Aegis is **prompt discipline, not a runtime** — everything
on the Orvilo side is a deterministic contract: what the agent emits, where it
lands, and how the verify gate treats it. Server-side verification stays
authoritative; Aegis evidence is advisory input only.

The pack is pinned at commit `aef06c242414fc05bb50589ef41d2309017d4a12`
(v2.12.0, MIT). See `packages/heterogeneous-agents/vendor/aegis/VENDORED.md`
for the update procedure.

## Opt-in

Per agent, via the provider config on `project_agents.agency_config`:

```json
{ "heterogeneousProvider": { "type": "claude-code", "methodPacks": { "aegis": true } } }
```

`methodPacks.aegis === true` is the single opt-in bit — nothing is default-on.
Only local CLI families (claude-code / codex / opencode / kimi-code /
codebuddy / builtin `orvilo` engines) support it; remote platform types ignore
the flag.

When enabled, `dispatchHeteroAgent` does three things:

1. Stamps `agent_operations.metadata.aegis.enabled = true` at `recordStart` —
   survives a run that dies before `heteroFinish`, so "enabled but produced
   nothing" stays distinguishable from "not enabled".
2. Appends `AEGIS_ORVILO_CONTRACT` to the run's agent system context — the
   agent gets the exact artifact contract the gate later evaluates.
3. Sets `ORVILO_AEGIS_PACK=1` on the spawned `lh hetero exec` env (both the
   device `dispatchAgentRun` path and the cloud `spawnHeteroSandbox` path).
   Env — not a CLI flag — carries the bit so an older device-side `lh` ignores
   it instead of dying on an unknown option.

Standalone runs can also opt in with `lh hetero exec --aegis`.

## What the agent sees / writes

Inside the spawned workspace, `lh hetero exec` (`apps/cli`):

- Materializes the vendored pack into `.agents/skills/aegis/` plus the
  host-native skills dir (`.claude/skills/aegis`, `.opencode/skills/aegis`,
  `.codebuddy/skills/aegis`, `.kimi/skills/aegis`) and sets
  `AEGIS_ACTIVATION_MODE=auto` for the spawned agent process.
- At finish (success or error), collects `<cwd>/.aegis/**` plus
  `<cwd>/docs/aegis/**/*.json`, bounded to 64 files / 128 KB each / 2 MB
  total, binary-skipping, and ships them in
  `heteroFinish.params.aegis = { enabled: true, files: [{path, content}] }`.
  `{ enabled: true, files: [] }` is meaningful: "opted in, produced nothing".

The completion contract the contract text requires from the agent:

```jsonc
// .aegis/closeout.json
{
  "schema": "orvilo.aegis-closeout.v0",
  "confidence": "A | B | C", // A = evidence + regression; B = bounded residual; C = partial
  "goalClosure": "done | blocked | needs-verification | scope-exceeded",
  "summary": "what was delivered and how it was verified",
  "evidence": [
    { "action": "...", "result": "...", "covered": "...", "uncovered": "...", "residual": "..." },
  ],
}
```

## Where it lands

`heteroFinish` merges the report into `agent_operations.metadata.aegis`
(`recordAegisMetadata` — a nested jsonb merge that preserves the dispatch
`enabled` stamp) **before** `completeOperation` fans out, so the verify
lifecycle, the advisory gate and work registration all read the same durable
record:

```
metadata.aegis = { enabled, artifacts: [{path, content}], collectedAt, packRevision? }
```

## How the gate treats it

Two consumers in `apps/server/src/services/verify/`:

- `aegisEvidence.ts` → `appendAegisDeliverableEvidence` inlines the closeout
  summary and remaining reports into the deliverable text inside
  `executeVerifyLifecycle`, so the recorded evidence rows, the LLM judge and
  the verify report all see the agent's self-report — marked as advisory.
- `aegisEvidence.ts` → `evaluateAegisEvidenceRequirement` is the advisory
  gate consulted by `driveTaskFromVerify` (settle.ts). When a run **passed**
  verify on an Aegis-enabled operation but the closeout is missing,
  unparseable, reports `confidence: 'C'`, or reports
  `goalClosure !== 'done'`, the outcome downgrades to
  `aegis_evidence_required` and the task pauses with
  `AEGIS_EVIDENCE_REQUIRED_ERROR` — which deliberately has no Goal recovery
  branch, so it lands on the human decision gate.

The semantics, precisely: Aegis can **withhold auto-accept**, never pass or
hard-fail a run. The verify verdict stays `passed`; only the task's
auto-completion is downgraded to requires-review. Missing or low-confidence
evidence is never retried automatically (a retry could produce the same
missing evidence) and never silently accepted.

## Artifacts → Works

`registerAegisArtifactWorks` (workRegistration) persists each metadata
artifact as a `file` Work on the task: the content is already server-side, so
it uploads verbatim to storage under a per-(operation, path) immutable key
(`aegis-artifacts/<date>/<topicId>/<sha>-<basename>`) and registers through
the same `registerFileWork` path as entity files with dedup key
`aegis:<operationId>:<path>` — one version per operation, retry-idempotent,
counted into the same `{ attempted, failed }` completion backstop. Drift and
retirement reports the agent leaves under `.aegis/` (or `docs/aegis/**.json`)
land as task artifacts the same way. The Work display anchor is stamped on
the round's final assistant message even when the run produced no tool-call
records.

## Stretch note (tier alignment)

Aegis's trivial-task fast path does **not** feed `agentTier` routing: the
classification only exists once the agent has already run — its closeout
arrives at `heteroFinish`, too late for dispatch-time tier decisions. Feeding
it in would require a pre-dispatch hint channel (e.g. persisting the previous
run's classification on the agent config and reading it at dispatch). Kept
out of this change deliberately.

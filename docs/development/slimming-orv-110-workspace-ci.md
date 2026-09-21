# ORV-110 — workspace/build graph shrink + anti-regression CI

Scope: prune residual workspace/build-graph tails, reconcile the capability ledger against the
shipped stack, and wire `scripts/slimming/census.mjs --check` into the required quality gate.

## What changed

### CI — `slimming-boundary` job (`.github/workflows/test.yml`)

- New `Slimming Boundary` job runs `node scripts/slimming/census.mjs --check` on every code-area
  change (`changes.outputs.code == 'true'`). The script is pure Node (fs/git only) — no `pnpm
install`, so the job completes in seconds.
- Added to `required-quality-gate` (`needs`, `required`, `area_of[slimming-boundary]=code`), so a
  skipped-due-to-filter run passes the gate like every other leaf job, while a real failure keeps
  the required check red.
- Effect: live code can never again import into a retired surface without failing the required
  gate — the DELETE capability globs in `scripts/slimming/boundary.json` double as
  forbidden-import guards for reintroduced paths.
- Path/domain-aware CI was already in place (`Detect changed areas` + per-area job filters); this
  job plugs into the same planner rather than adding a full-repo step per area.

### `scripts/slimming/` promoted onto the stack

`census.mjs` + `boundary.json` previously lived only on the standalone `chore/slimming-census-ledger`
branch (#195). They are vendored here so the gate exists on the stack itself; contents are
identical modulo the boundary reconciliation below.

### Ledger reconciliation (`boundary.json`)

The census `--check` on the post-ORV-101…109 tree initially failed: several DELETE capability globs
still matched files the stack deliberately kept. The ledger (authored in ORV-100 as a plan) was
reconciled to the implemented boundary:

| Capability                        | Before             | After                                                                              | Reconciliation                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legacy-model-runtime`            | DELETE (382 files) | DELETE (0 files, guards only) + new KEEP cap `model-runtime` (385 files)           | `packages/model-runtime`, `apps/server/src/modules/ModelRuntime`, `packages/business-server/src/model-runtime*` are the ACP execution path — kept. DELETE globs narrowed to the removed BYOK tails (`aiProviderAccess*`, `image/video-generation`, `src/services/chat/{ModelRuntime,…}`, `webapi/chat`) so they now act as reintroduction guards.                                              |
| `provider-byok`                   | DELETE (4 files)   | DELETE (0 files, guards)                                                           | Deployment-scoped provider helpers kept: `src/store/aiInfra/slices/aiProvider/**` (already under `conversation-surface`), `packages/business-server/src/{getProviderContentPolicyErrorMessage,recordModelCompletionFailure,trackProviderContentPolicyViolation}.ts` (moved to `model-runtime`).                                                                                                |
| `acceptance-surface`              | DELETE (169 files) | DELETE (0 files, guards `src/routes/**/acceptance*/**`, `src/store/acceptance/**`) | The canonical task-acceptance surface — `features/Acceptance`, verify acceptance services, `acceptance`/`acceptanceComment` routers, `builtin-tool-acceptance-evidence` — is the in-boundary Task Review flow and moved to `tasks-caid` (KEEP). ORV-103 had already removed only the standalone storefront residuals.                                                                          |
| `skill-store`                     | DELETE (30 files)  | DELETE (0 files, guards)                                                           | Kept: per-agent skill management (`AgentSkillStore`/`AgentSkillDetail`, `profile/features/store`, `agentSkills`/`composio`/`plugin` routers → `agent-tools`), harness-native `builtin-tool-skill-maintainer`, and the external market proxy. Guards cover the removed storefront: `AgentMarketSubmission`, `(backend)/market`, `klavis`, `skillStore*` services, `discover` storefront slices. |
| `market-service`                  | INVESTIGATE        | KEEP                                                                               | Resolved: the external marketplace product is intentionally retained — `routers/lambda/market/{agent,creds,oidc,user}` + `tools/market` + `services/market` feed tool-install/connector paths with only in-boundary importers. Added the market routers/tools globs to the cap.                                                                                                                |
| `eval-surface`                    | DELETE (50 files)  | KEEP                                                                               | Eval runs execute through the ACP agent runtime and back the public OpenAPI eval endpoints (`packages/openapi` eval services). The standalone eval UI routes were removed earlier; the backend eval infra is in-boundary.                                                                                                                                                                      |
| `model-runtime-adjacent-packages` | INVESTIGATE        | KEEP                                                                               | `context-engine` / `prompts` / `model-bank` are live shared primitives (model catalog, prompt registry, context assembly).                                                                                                                                                                                                                                                                     |

Two orphaned files the census surfaced (DELETE globs still matching, zero importers) were deleted:

- `src/business/server/bot/featureAccess.ts` — bot feature-gating types left over from ORV-105.
- `src/features/ChiefAgent/artwork.ts` — artwork catalog left over from ORV-106.

### Workspace / build graph

- Workspace membership is glob-driven (`pnpm-workspace.yaml`: `packages/**`, `apps/*`, `e2e`); the
  six emptied package husks (`packages/chat-adapter-*`, `packages/builtin-tool-image-generation`)
  carried no git-tracked files after ORV-105/106 — nothing to unlist. Their on-disk `node_modules`
  husks were removed locally.
- `test-packages` matrix, `tsconfig` path aliases, `next.config.ts`, `vite.config.ts`, and
  `knip.ts` were audited: every referenced package/path still exists; no dead entries to remove.
- Existing `no-restricted-imports` boundary blocks (boot path, barrel imports, NavPanel/Sidebar
  ownership) remain the fine-grained import guards; `census --check` adds the coarse
  capability-level guard on top.

## Before → after (generated census)

| Metric                             | Pre-stack (ORV-99 census) | Now    | Δ             |
| ---------------------------------- | ------------------------- | ------ | ------------- |
| Source files                       | 12 849                    | 11 953 | −896          |
| Workspace packages                 | 115                       | 108    | −7            |
| Next.js routes                     | 42                        | 36     | −6            |
| SPA route entries                  | 186                       | 178    | −8            |
| Lambda routers                     | 96                        | 81     | −15           |
| DB tables                          | 214                       | 205    | −9            |
| Locale files                       | 972                       | 880    | −92           |
| Default namespaces                 | 56                        | 48     | −8            |
| Doc files                          | 598                       | 446    | −152          |
| Test files                         | 3 437                     | 3 153  | −284          |
| Store files                        | 857                       | 824    | −33           |
| DELETE caps with open inbound deps | 5                         | 0      | closure-clean |

## Verification

- `node scripts/slimming/census.mjs --check` → `0 DELETE caps with open inbound deps` (exit 0).
- `bun run check .github/workflows/test.yml scripts/slimming/*` → lint clean.
- `bunx tsgo --noEmit` — unchanged surface; the two deletions had zero importers.

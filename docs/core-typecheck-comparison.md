# Core full dependency-graph typecheck comparison

Both complete root-project compiler runs finished on Linux on 2026-09-30. **Neither passed:** both exited 2 with 7,854 diagnostics. The final candidate adds no diagnostic sites under this identical environment and configuration. This is a measured baseline comparison, not a full-repository typecheck pass or a substitute for CI.

## Exact source and environment

- Baseline commit: `28dc3bbad36e4661f8d09154ff8b017cf5cadaeb`.
- Final candidate commit: `84c4d4c9205ce6611fc9832e2fe6355984c7b49f`.
- Candidate tree: `5a6d045d9b694d229f5e79546884518912c5a294`.
- Node: `v24.19.0`; TypeScript: `6.0.3` (repository-pinned version).
- Compiler implementation SHA-256: `1c59e77a54b186ec43fa7f3e0d3c4bb15ca5eb5ba43e96b1d3a267139eddd3e3`.
- Root `tsconfig.json` is byte-identical in both snapshots: SHA-256 `870ad95a4a7649adddd560bbc44fcc924c4898422b5d18f82d6d8bc2404d5d12`.

The baseline uses a detached worktree at `/workspace/scratch/tsc-base`; the candidate is an exact Git archive at `/workspace/scratch/tsc-latest`. Neither changed the working branch/base. All 99 root/package/app `node_modules` directories were mirrored from the same installed cloud dependency tree. External dependency files are shared; `@orvilo` workspace links are remapped to the matching snapshot, so baseline imports cannot accidentally read candidate workspace source. No installation or dependency-version update occurred between the compared runs.

Both use the repository's full root include patterns and transitive imports, not `noResolve` or an isolated stub graph. Existing strict/noEmit/skipLibCheck settings and project references are inherited. The identical comparison configuration only disables incremental checking and enables `preserveSymlinks` for the dependency mirror; its exclude list repeats the root list. This explicit symlink option is part of the evidence and need not match CI's default. Comparison-config SHA-256: `c2d87c44fc0aa1602f48d54a0c9552b779eefb0b0a4a21d2c6c8b1751f8c7700`.

Command, executed serially from each snapshot root:

```bash
node --max-old-space-size=12000 /workspace/orvilo1/node_modules/typescript/bin/tsc \
  --project tsconfig.comparison.json --pretty false
```

## Diagnostic multiset result

| Measurement                        | Baseline | Candidate |
| ---------------------------------- | -------: | --------: |
| Exit code                          |        2 |         2 |
| Complete diagnostic records        |    7,854 |     7,854 |
| Raw added / removed records        |        — |   83 / 83 |
| Normalized added / removed records |        — |     3 / 3 |
| Added / removed diagnostic sites   |        — |     0 / 0 |

Normalization preserves each diagnostic's filename, TypeScript code, full message/continuation text and multiplicity. It replaces snapshot absolute path prefixes and removes diagnostic line/column coordinates only. A separate site comparison retains `(file, line, column, error code)` and ignores message text. It found no added or removed sites.

The entire remaining normalized multiset difference is these three existing `TS2339` diagnostics, whose messages still say `Property 'not' does not exist on type 'Assertion...'`:

| Existing diagnostic site                                                                | Multiplicity | Exact message-text change                                                         |
| --------------------------------------------------------------------------------------- | -----------: | --------------------------------------------------------------------------------- |
| `apps/server/src/routers/lambda/__tests__/integration/task.integration.test.ts:1180:25` |            1 | Inferred task-topic snapshot type changes `... 24 more ...` to `... 26 more ...`. |
| `packages/database/src/models/__tests__/taskTopic.test.ts:964:19`                       |            1 | Inferred task-topic row type changes `... 22 more ...` to `... 24 more ...`.      |
| `packages/database/src/models/__tests__/taskTopic.test.ts:986:59`                       |            1 | Same `22` to `24` row-field count change.                                         |

These are paired old/new messages at unchanged sites, caused by the two additive run-control columns. They have not been hidden or fixed by changing unrelated tests. The other normalized diagnostic records are identical, including multiplicity. Major shared categories are TS2339 (6,037), TS7006 (772), TS2305 (399), TS2347 (274), TS2307 (131) and TS2322 (63). These counts describe this actual cloud setup; they are not a claim that all errors are inherent source defects independent of dependency/compiler configuration.

## Repairs and limits

An earlier complete-install candidate tree `c033ab06570b77a154e94d3823ba495f2ad0ee18` produced 7,887 diagnostics: 33 genuinely new candidate diagnostics plus the same three changed-message pairs. Those 33 were repaired before the final run: explicit nullable-state control flow in the canonical handoff model/tests, callback-updated isolation state reads in the host, and the deliberate child-environment type boundary. No runtime admission checks were removed, strictness was not disabled, and child processes did not inherit ambient credentials. Owners reran the affected PostgreSQL and real host acceptance tests separately; this report concerns compiler evidence.

An initial attempt against checkpoint `097a909f` omitted package-local dependency mirrors. Its logs are explicitly named `*-incomplete-install.log` and are **not** the final baseline comparison. The corrected full baseline was rerun after all package-level links were restored, then compared with the final exact source commit above.

The repository still has 7,854 diagnostics under this configuration. The result is “no new diagnostic sites,” not “typecheck passed.” Later documentation-only commits do not change this source evidence; any subsequent source change needs its own verification.

## Retained evidence

Local evidence directory: `/workspace/scratch/core-validation/`.

- `tsc-base-full.log`, `tsc-candidate-full.log`: unabridged final compiler output.
- `tsc-exact-added.txt`, `tsc-exact-removed.txt`: raw complete-record multiset differences.
- `tsc-normalized-added.txt`, `tsc-normalized-removed.txt`: the three paired message differences.
- `tsc-diff-summary.json`, `tsc-comparison-manifest.json`: counts, identities, configuration and tool metadata.
- `compare-tsc.py`, `mirror-dependencies.py`: comparison and dependency-mirroring helpers.
- `latest-tree-files.txt`: candidate Git path/blob manifest.
- `tsc-candidate-c033-before-final-repairs.log`: preserved failing candidate evidence.

Raw thousands-line diagnostics are deliberately retained outside the repository; this document contains the complete normalized difference summary.

# Independent matched typecheck methodology audit

Baseline worktree `<baseline>` is clean at `f2a9d4283fe206044918a9bf496274a2ddbc60bb`. Candidate `<candidate>` is at `15466979a6320f531071a6eca272bae4962d3d90`.

Read-only review of prepare.py, compare.py and both generated configurations confirmed normalized configurations are identical. Both select the same 14 changed-file roots plus source/test ambient declarations and the common Next ambient shim; three newly added tests naturally do not exist in the baseline. Generated .next route declarations and full-project references are excluded consistently. This is scoped diagnostic comparison, not the repository's full CI typecheck.

Dependency source parity: inspected 352 @orvilo source symlinks per worktree across root/package/application node_modules; each resolves inside its corresponding worktree, with no observed baseline→candidate or newer-source leakage. External dependency versions are shared intentionally, and source manifests/locks have no task changes. Compiler artifact hash is recorded in compiler.sha256 (TypeScript 6.0.3 per invocation setup).

The comparator normalizes checkout roots and compares diagnostic multisets by file, TS code, full message, ignoring line/column shifts caused by edits while retaining locations in evidence. Reviewer flagged file-less diagnostics/compiler failures as a potential blind spot; parent added exit-code (0/2) and unparsed-error guards. Compiler logs are still running at this audit stage; final delta is not yet asserted.

## Completed-log verification

Independently parsed completed logs without rerunning either compiler. `base.exit` and `candidate.exit` both equal 2. Baseline has 230 diagnostics; candidate has 230; all 230 match as normalized full-message multisets. New diagnostics: 0. Resolved diagnostics: 0. No unparsed `error TS` line was encountered. The same existing transitive diagnostic set remains; this is evidence of no new scoped diagnostics under matched dependencies/configuration, not a passing TypeScript check or clean-install/full-CI gate.

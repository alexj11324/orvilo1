# Pinned Prime session resume observations

Use the exact image/build procedure in `prime-protocol.md`. The image exercised here was
`sha256:d2c7e387be5c372b52c675327d33ca351065e5b9a8fd5f76109da700c69f9c36`, containing
Prime TypeScript 0.9.8 at `7d442aafa985f9342134fac16c2ef41f03fb45c1`. All child processes
ran inside the restricted Docker supervisor. No provider prompt, credentials, host kernel
execution or task effects were allowed.

Reproduce the immediate same-path RPC-client restart experiment:

```sh
node node_modules/tsx/dist/cli.mjs scripts/acceptance/prime-resume.ts sha256:IMAGE_ID
```

Reproduce the separate-daemon copied-file experiment without the racy same-path restart:

```sh
node node_modules/tsx/dist/cli.mjs scripts/acceptance/prime-resume.ts sha256:IMAGE_ID --cold-only
```

The container-side harness creates a session, persists its name, inspects the actual JSONL
file, creates another session and issues `switch_session` back to the saved path. The
separate-daemon experiment copies the persisted file, launches Prime with a new HOME and
explicit distinct `--daemon-socket`, and passes `--resume` with that copied path. It requires
the returned session ID, name and file path to match. Finally the supervisor proves whole
container termination and removes its owned stopped container.

## Actual results, 2026-09-30

- `prime-resume-live-evidence.jsonl`: RPC `switch_session` and CLI `--resume` restored the
  original session ID and name. This was an RPC-client restart; its daemon could remain alive.
- `prime-resume-restart-failure.jsonl`: a later immediate same-path client restart failed
  with `Lock file is already being held`. This failure is retained, not retried into success.
- An intermediate copied-file experiment without a distinct socket failed with
  `supervisor_generation_stale`, demonstrating that changing HOME alone was insufficient.
- `prime-resume-cold-evidence.jsonl`: the corrected, separate-daemon experiment with an
  explicit unique socket succeeded, including original session ID/name and copied file path.
  The source daemon was not killed before restore. Both daemons were killed with their
  container afterward, with zero remaining processes proven.

These are **named empty-session** results (`messageCount:0`, 671-byte file), not proof of
restoring model reasoning, kernel state, tools in flight, or a killed whole-container runtime.
The runtime adapter therefore still advertises ACP `loadSession:false` and `resume:none`.
No ACP capability has been fabricated.

The smallest viable future recovery path is a trusted, tenant-scoped immutable session
snapshot handed to a fresh isolated daemon with a distinct socket, after authoritative
source quiescence and owner/fence transfer. Production enablement still requires safe
snapshot export/import, revocation checks, action receipt reconciliation, postconditions,
and nonempty-session/crash recovery acceptance. The transient Docker `/tmp` storage in
this probe deliberately is not a production session store.

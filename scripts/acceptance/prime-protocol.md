# Pinned Prime protocol acceptance

This manual Linux probe launches the actual compiled TypeScript Prime 0.9.8 source at
`7d442aafa985f9342134fac16c2ef41f03fb45c1`. It sends only `initialize` and `session/new`
through `PrimeExecutionRuntime`, then shuts down the entire container tree. It does not
send a prompt or provide credentials. Its local authority and empty action drain are
explicit fixtures; this does not validate production authority, inference, actions or resume.

Build a dedicated clean checkout at that exact SHA. Install with `npm ci --ignore-scripts`
and run `npm run build` in that checkout. Both operations are build operations, not a
Prime kernel launch. The upstream optional catalog fetch may fall back to a deterministic
fixture catalog. Record that fact if it occurs; do not claim provider catalog acceptance.

Build the image with this repository's Dockerfile and the pinned checkout as its context:

```sh
docker build --network none -f /path/to/orvilo/scripts/acceptance/PrimeProtocol.Dockerfile -t orvilo-prime-protocol:7d442aa /path/to/pinned-prime
```

The Dockerfile pins the Node base by digest. It copies the compiled artifact/dependencies
and sets read permissions inside the image for the unprivileged runtime user. Its pin
labels describe this trusted build; labels alone are not independent source verification.
Pass the resulting immutable image ID (not a mutable tag) to the probe:

```sh
node node_modules/tsx/dist/cli.mjs scripts/acceptance/prime-protocol.ts sha256:IMAGE_ID
```

The supervisor supplies a new empty read-only workspace, network `none`, read-only root,
UID 65534, no capabilities, no privilege escalation, PID cap, 1 GiB memory/swap cap,
and a noexec temporary filesystem. The script never connects the Docker socket or
host credentials to the container. It records start/shutdown results and Docker state,
then removes only its stopped owned container and new temporary directory.

A passing probe requires successful start and shutdown. `end_turn` is not a task done
transition. ACP `loadSession:false` and `resume:none` remain deliberately unchanged.

## Recorded cloud execution

On 2026-09-30 at 16:50:39–16:50:40 UTC, the protocol probe exited zero against image
`sha256:d2c7e387be5c372b52c675327d33ca351065e5b9a8fd5f76109da700c69f9c36`.
The exact output is in `prime-protocol-evidence.jsonl`: real pinned startup/session creation
succeeded, shutdown proved zero processes, Docker reported exited/PID 0, no OOM,
network none and read-only root. The candidate included the supervisor shutdown-race fix;
this record covers these candidate files and the immutable image, not later edits.

Earlier attempts failed due to copied build-directory permissions, then the original
256 MiB memory limit, then a supervisor kill/exit race. These were investigated and fixed;
the final success does not erase those failures. The build used the upstream deterministic
fixture catalog because the optional public catalog fetch failed. No provider prompt,
inference call, production authority adapter, or CLI/RPC resume was exercised.

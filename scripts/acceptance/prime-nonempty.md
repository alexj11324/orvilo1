# Nonempty pinned session across container replacement

Run with the immutable pinned image built by `PrimeProtocol.Dockerfile`:

```sh
node node_modules/tsx/dist/cli.mjs scripts/acceptance/prime-nonempty.ts sha256:IMAGE_ID
```

The seed container imports the official compiled Prime 0.9.8 `SessionManager` API and
writes fixture history: a user message, an assistant tool call, its completed tool-result
record, and an assistant tool call with no result. These are fixture historical records,
**not successful model inference or executed tool effects**. It flushes the real JSONL
session and exports those known fixture bytes. The host records their SHA-256.

The source container must stop, prove zero processes and zero admitted actions, and be
removed before the successor is launched. A new container receives only the fixture
snapshot through a read-only workspace, copies it into its private temporary session
directory and starts the exact pinned Prime CLI with `--resume` and a new daemon socket.
It uses actual RPC `get_state` and `get_messages`, checking:

- The original session ID, name and user history survived.
- The historical completed tool result and its tool-call identity survived.
- The pending historical tool call remains in history without starting streaming.
- Its sentinel filesystem effect has not happened.

Both containers use the existing no-network, non-root, read-only-root Docker supervisor.
No provider prompts, credentials or host kernel execution are involved. The local empty
action drain is valid only because this probe exposes no effect broker.

## Actual evidence

On 2026-09-30 at 17:16:12–17:16:32 UTC, the pinned image
`sha256:d2c7e387be5c372b52c675327d33ca351065e5b9a8fd5f76109da700c69f9c36`
restored the nonempty fixture in a different container after source termination. Output
in `prime-nonempty-evidence.jsonl` reports message count 5 and roles
`user, assistant, toolResult, assistant, custom`; the extra custom record is upstream
restoration bookkeeping. The pending call was retained, streaming was false, the sentinel
was absent, and both container quiescence proofs reported zero remaining processes.

The preceding failure is retained in `prime-nonempty-path-failure.jsonl`. Placing the file
at `/tmp/restored.jsonl` made upstream derive `/session-artifacts/<id>`, which the read-only
root correctly rejected. Moving the fixture to `/tmp/sessions/restored.jsonl` gave upstream
its expected sibling artifact directory beneath writable private `/tmp`. No isolation was
relaxed to fix this.

This establishes provider-free history serialization and cold-container reload, including
nonexecution of the pending fixture call at startup. It does not establish Python kernel
memory recovery, reconciliation of a real partially-applied tool effect, post-resume model
behavior, production tenant-scoped snapshot persistence or permission to resume mutations.
`PrimeExecutionRuntime` therefore continues advertising `resume:none` and ACP
`loadSession:false` until the production recovery and authority contracts are implemented.

The minimum supported alternative is a fresh ACP session under the newly registered
owner and fence, with explicitly selected historical context supplied by the trusted
host. Keep task authority, receipts and pending-effect reconciliation outside the
Prime session. That path must reauthorize every new action and must not replay an
ambiguous receipt. It resumes task work, not the prior Python heap or ACP transport;
the existing atomic handoff host already provides the fresh-session boundary.

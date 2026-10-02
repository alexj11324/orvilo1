# CLI rename: `lh` → `orvilo`

The `@orvilo/cli` binary was renamed from `lh` to `orvilo`. `lh` was a leftover
name from the lobehub upstream fork; there is **no compatibility alias** — the
`lh` bin entry, its man page, and every `lh` invocation spelling are gone.

## Breaking surface

- **Binary**: `lh` is no longer installed or resolved. Update scripts, shell
  aliases, CI jobs, and runbooks that invoke `lh <command>` to `orvilo <command>`.
- **`package.json` bin**: `{ "orvilo": "./dist/index.js" }` only.
- **Man page**: `lh.1` removed; `orvilo.1` is now the real page (previously an
  alias page pointing at `lh.1`).
- **Env var**: `LH_CLI_PATH` → `ORVILO_CLI_PATH` (CLI e2e tests).
- **Sandbox / device images**: container images and device installs that ship
  only the `lh` binary must be rebuilt/reinstalled — sandboxed `hetero exec`
  spawns now invoke `orvilo`, so a stale image fails with command-not-found.
  Rebuilding those images is a deploy step outside the code change.

## What still accepts `lh`

Deliberately, two interception layers keep matching `lh` so **stale scripts**
get the sane path instead of a raw command-not-found:

- `preprocessLhCommand` (server): the sandbox command shim matches
  `(?:lh|orvilo)` in command position and defines both shell functions —
  `orvilo()` carries the injected `ORVILO_JWT`/`ORVILO_SERVER`/workspace env;
  `lh()` forwards to it.
- `SIMPLE_LH_PREFIX` (desktop): the in-app CLI route keeps matching both names.

Everything else — documentation, prompts, builtin skills, comments, e2e mocks,
identifier names that described the binary — says `orvilo`.

# Runtime setup

## Candidate: the shared Electron app

Verify in the real Electron app connected to `https://orvilo.aspectlylabs.com`.
Preserve the existing cloud sign-in and workspace. A local Vite renderer may serve
the intended worktree; verify its cloud API target before recording evidence.
Never start a local backend by default or fall back to one after a cloud connection
failure. UI/code work does not authorize databases, gateways, migrations or seeds.

One Electron instance is shared across worktrees; each worktree runs only its own
Vite renderer. Inspect the running setup before changing it. `dev:env up` starts
local dependencies and a backend, so it is excluded from the default cloud path.

```bash
bun run dev:env status                      # what runs where: ports, processes, worktrees
bun run dev:env switch <worktree>           # point the running Electron at <worktree>'s renderer
bun run dev:env cdp <port> app://renderer <expr|@file> [--viewport 1440x900] [--shot out.png]
```

`dev:env` lives in `.agents/scripts/dev/cli.ts`. If it is missing on your branch, its PR has not landed; attach Playwright with `connectOverCDP` to the Electron remote-debugging port instead. Before recording evidence, read back which worktree and commit the renderer serves, verify that the selected server is the cloud, and record the cloud deployment commit separately. Evidence is only valid for the revisions it came from; local HEAD does not prove that backend changes are deployed.

## Reference: the signed-in Linear browser

The reference browser is the user's own browser session. Open your own window with `bun run dev:env ref open <url>`, and close it with `bun run dev:env ref close <targetId>` when done. Never close, navigate, or reuse the user's tabs.

Linear is read-only. Popovers and menus may be opened to observe them and closed with Escape. Do not create, edit, or delete Linear records without explicit authorization. Linear screenshots and snapshots stay local: never commit, attach, or publish them.

## Mutating Orvilo data

Cloud interaction checks that write (status change, create, delete) require specific
user authorization for those actions and records. The `dev:spa` Debug Proxy points
to production; it is not a disposable fixture environment. Preserve shared records
and leave unauthorized mutation checks unverified. Local seeded users, cookies,
data and mocks cannot establish cloud identity or cloud acceptance.

## Local backend acceptance: explicit opt-in

Only when the user explicitly requests local backend development or local backend
acceptance, use the isolated parity acceptance database:

```bash
bun run dev:env up /absolute/path/to/worktree # opt-in local deps, backend and shared Electron
# Add --migrate only when local migrations are requested.
```

For that local path, mutation checks use isolated local fixtures. Shared fixture
records used by other agents must be left as found; restore checked values and
read them back. This proves the local environment only, not the cloud deployment.

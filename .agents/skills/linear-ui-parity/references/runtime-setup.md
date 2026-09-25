# Runtime setup

## Candidate: the shared Electron app

Verify in the desktop app, not a separate browser (browsers cost too much on this machine). One Electron instance is shared across worktrees; each worktree runs only its own Vite renderer.

```bash
bun run dev:env status                      # what runs where: ports, processes, worktrees
bun run dev:env up <worktree> [--migrate]   # deps, backend, one shared Electron showing <worktree>
bun run dev:env switch <worktree>           # point the running Electron at <worktree>'s renderer
bun run dev:env cdp <port> app://renderer <expr|@file> [--viewport 1440x900] [--shot out.png]
```

`dev:env` lives in `.agents/scripts/dev/cli.ts`. If it is missing on your branch, its PR has not landed; attach Playwright with `connectOverCDP` to the Electron remote-debugging port instead. Before recording evidence, read back which worktree and commit the renderer serves: several worktrees can serve the same app, and evidence is only valid for the revision it came from.

## Reference: the signed-in Linear browser

The reference browser is the user's own browser session. Open your own window with `bun run dev:env ref open <url>`, and close it with `bun run dev:env ref close <targetId>` when done. Never close, navigate, or reuse the user's tabs.

Linear is read-only. Popovers and menus may be opened to observe them and closed with Escape. Do not create, edit, or delete Linear records without explicit authorization. Linear screenshots and snapshots stay local: never commit, attach, or publish them.

## Mutating Orvilo data

Interaction checks that write (status change, create, delete) run only against an isolated local database, the parity acceptance database served by the `dev:env` backend. Never exercise writes through the `dev:spa` Debug Proxy: it points the local SPA at the production backend. Shared fixture records used by other agents (seeded issues, dates, milestones) must be left as found; when a write is part of the check, restore the value and read it back.

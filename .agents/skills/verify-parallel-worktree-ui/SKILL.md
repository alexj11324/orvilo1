---
name: verify-parallel-worktree-ui
description: Verify a UI change that lives in a different worktree than the running dev env — boot a second instance with auto-allocated ports sharing the seeded DB, reuse the signed-in localhost session, and use data-insp-path DOM forensics + CDP a11y queries to prove which component actually rendered and whether aria/keyboard attributes landed.
---

# Verifying UI changes in a parallel worktree

Use when a dev env already runs from worktree A but the change under test is in
worktree B (e.g. `orvilo1-parity-issue` vs `orvilo1-parity-btns`). Prereq: the
dockerless stack from `acceptance-dockerless-env` (Postgres + Redis + seeded DB).

## Boot a second instance — never kill the running one

`init-dev-env.sh dev` auto-allocates ports per worktree. From worktree B run the
same recipe as the running env but OMIT `SERVER_PORT`/`SPA_PORT`:

```bash
cd ~/repos/<other-worktree>
DATABASE_URL=postgresql://devin@localhost:5432/<same-seeded-db> \
  REDIS_URL=redis://localhost:6379 DB_PORT=5432 REDIS_PORT=6379 \
  nohup bash .agents/acceptance/scripts/init-dev-env.sh dev > /tmp/orvilo-dev-b.log 2>&1 &
cat .records/env/agent-testing-ports.env   # → ALLOC_SERVER_PORT / ALLOC_SPA_PORT
```

Each worktree persists its own ports file, so both instances coexist; they share
Postgres/Redis/s3rver and the seeded DB (fixtures, agents, tasks are shared).

## The login session carries across ports

Cookies are host-scoped (port ignored) and `init-dev-env.sh` defaults
`AUTH_SECRET` identically, so a Chrome profile signed into
`http://localhost:<port-A>/signin` is also signed into
`http://localhost:<port-B>` — just open `http://localhost:<port-B>/` and it
lands on `/tasks` already authed. The candidate Chrome keeps
`--remote-debugging-port=9223`.

## Drive it with CDP a11y queries

The computer tool's `browser` target accepts `cdp_port: 9223` against that
Chrome: `query`/`act` work with `@ref`s (focus, press\_key). For raw attribute
ground truth, evaluate JS over the CDP websocket (Node ≥22 has a global
WebSocket) — fetch `http://localhost:9223/json/list`, find the page target, send
`Runtime.evaluate` to its `webSocketDebuggerUrl`.

## data-insp-path forensics — which component actually rendered

Dev builds stamp `data-insp-path="src/.../File.tsx:LINE:COL:Component"` on
rendered elements. When an on-screen control doesn't match the diff, dump its
`outerHTML` via Runtime.evaluate and read `data-insp-path` — this is how a
visually identical row turned out to come from a DIFFERENT component than the
one the PR edited (a fix that landed on the wrong file produces zero DOM diff).

## Ghost-row / aria checks that screenshots can't do

`role`, `tabindex`, `aria-label`, `aria-expanded`, `onkeydown` are invisible:
verify via Runtime.evaluate (`el.getAttribute`, `!!el.onkeydown`) and the a11y
tree (`[expanded]`, `[focused]` states), then prove Enter/Space by `act focus` +
`press_key` on the @ref. Selector pickers: `disabled` rows render with reduced
opacity and swallows clicks — click anyway to prove no popup opens.

# Vendored Prime Agent

Source snapshot of [`PrimeIntellect-ai/prime-agent`](https://github.com/PrimeIntellect-ai/prime-agent)
v0.9.8, vendored under MIT license terms (see `LICENSE`, preserved verbatim in this directory).

This tree is a **source-of-truth snapshot, not a dependency**: `@orvilo/prime-harness` bundles its
container runner from these sources with esbuild (aliasing `@earendil-works/*` to `packages/*/src`).
No vendored file is imported by the TypeScript program, the test suite, or the shipped application
code directly — only the bundle produced from it is deployed.

## Pin

- Commit: `7d442aafa985f9342134fac16c2ef41f03fb45c1`
- Upstream version: `0.9.8`
- License: MIT (upstream `LICENSE`; each package `README.md`/`CHANGELOG.md` retained for attribution)

The exact file inventory and SHA-256 hashes live in `MANIFEST.json` beside this file; regenerate or
verify with:

```bash
node packages/prime-harness/scripts/vendor-manifest.mjs          # write MANIFEST.json
node packages/prime-harness/scripts/vendor-manifest.mjs --check  # verify hashes
```

## Tree trimming

Relative to the upstream checkout, this snapshot keeps only:

- `package.json` (edited: `workspaces` narrowed to `packages/*`; scripts/devDeps dropped — the
  lockfile is the authoritative dependency pin for `npm ci --ignore-scripts`)
- `package-lock.json` (upstream, unmodified — pins the npm dependency closure)
- `tsconfig.base.json` (reference for esbuild tsconfig resolution)
- `packages/{ai,agent,coding-agent,tui}` — `src/`, `package.json`, `README.md`, `CHANGELOG.md`,
  `tsconfig.build.json`, plus `coding-agent/postinstall.cjs` (never executed here; vendored for
  provenance completeness)

Dropped: tests, docs, examples, scripts, installers, sandbox assets, and every other file.

`pi-tui` is included because `packages/coding-agent/src/core/tools/*`,
`core/extensions/*`, and `core/keybindings.ts` import `@earendil-works/pi-tui`, and
`core/sdk.ts` pulls `tools/index.js` transitively — esbuild resolves the whole graph.

## Build recipe

Per `scripts/acceptance/prime-protocol.md`:

```bash
cd vendor/prime
npm ci --ignore-scripts          # materializes node_modules/ from the vendored lockfile
```

then `node packages/prime-harness/scripts/build.mjs` bundles `dist/runner.mjs` — the single
artifact `verifyArtifact` hashes before `DockerProcessTreeSupervisor.launch`.

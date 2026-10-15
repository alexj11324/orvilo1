# Standalone server

Build from the repository root after `pnpm install --frozen-lockfile`:

```sh
pnpm --filter @orvilo/server build
pnpm --filter @orvilo/server check:dependencies
pnpm --filter @orvilo/server smoke:deployment
```

The server declares its direct dependencies and the external dependencies retained in
its bundled artifact. `check:dependencies` rejects undeclared external imports after
building. Workspace implementation code is bundled; deployment publishes only `dist`.

The smoke check deploys production dependencies into a temporary directory outside the
repository, starts the real standalone entry, and verifies `/health`. It uses an
unreachable local database and disables Redis, so background recovery failures are
expected during this check. It removes the deployment and stops the process afterward.
This checks packaging and startup, not database-backed API behavior.

The backend's mutually dependent internal modules share a runtime chunk. Keep the
startup smoke check when changing chunk boundaries: separate chunks previously caused
initialization-order failures even though the build succeeded. OpenTelemetry's API
remains external so its singleton initialization belongs to the published package.

Dependency updates must include the root `pnpm-lock.yaml`. The Docker image's
supplemental native dependencies have their own manifest, lockfile and build-script
policy under `docker/runtime-deps`; update those together when their versions change.

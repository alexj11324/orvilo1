# Enforced architecture boundaries

The application remains a modular monolith. These boundaries keep reusable code
independent of application state and let each transport adapt the same use case.

## Dependencies and builds

Commit the root `pnpm-lock.yaml`. CI and release builds install with
`pnpm install --frozen-lockfile`. Dependency changes update manifests and the
lockfile together; do not turn off frozen installs to fix a stale lockfile.

`apps/server/package.json` declares the standalone server's direct dependencies.
Its production build and deployment smoke check verify an artifact outside the
repository, without borrowing root source files or root `node_modules`.

## Database and cryptography

`packages/database` must not import application server, feature, or store code.
Encryption uses the `SecretCipher` contract from `@orvilo/secret-cipher`. The
application owns environment configuration and passes its cipher factory when
constructing encryption-aware models/repositories. The shared AES-GCM
implementation preserves the existing `iv:tag:ciphertext` format.

Run the boundary check with:

```sh
node scripts/architecture/check-database-boundaries.mjs
```

## Agent manager runtime

`@orvilo/agent-manager-runtime` receives its host capabilities explicitly. Browser
OAuth, UI state, connector installation and Zustand access belong in
`src/services/agentManagerRuntime`. New hosts implement the same capabilities;
they must not make the core import an application adapter.

```sh
node scripts/architecture/check-runtime-boundaries.mjs
```

## Task mutations

`TaskMutationService` owns the complete task update and batch-parent use cases,
including revision checks, assignment rules, graph locks and transactions.
Transport adapters validate input and map domain errors. Retain the existing
member-before-graph lock order and transaction/outbox atomicity when extending a
use case. Direct service tests must exercise authorization and failed-batch
rollback, as well as router integration tests.

This is an incremental domain boundary: other task routes retain their existing
owners until their complete use cases are migrated. Do not split transactions
between a router and a service for a new mutation.

## Frontend requests

Feature components and stores consume domain services, never raw tRPC clients.
Explicit workspace clients are constructed in the device service; query bindings
that must retain React Query provider semantics are exposed by domain adapters.
Read lifecycle and cache keys use the existing SWR wrappers and domain key
factories. Keep form drafts local, but do not recreate server data, polling and
request ordering inside a page component.

```sh
node scripts/ci/checkFrontendDataBoundaries.mjs
```

## Type-checking

See [Typecheck boundaries](typecheck-boundaries.md) for the independent units,
source/declaration contracts, affected-package commands and remaining full-CI
coverage. A successful partial check must never be presented as a full package
or application check.

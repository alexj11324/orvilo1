# Typecheck boundaries

`tsconfig.base.json` contains only shared compiler semantics. Application aliases,
Next.js plugins, DOM libraries and test globals stay in their owning configs. The
root configuration and full CI typecheck remain unchanged in scope.

Run `node scripts/type-check-affected.mjs` for changed workspace packages and their
transitive consumers. Use `--base <revision>` for committed branch changes or
`--all` to check every migrated unit. The command reports unmigrated consumers;
its success does not replace the full CI gate. Dependency traversal includes
production, development and peer dependencies. Root compiler/manifest/lock changes
invalidate every package.

Current independent units:

- `pnpm --filter @orvilo/secret-cipher type-check`: composite declaration build
  with an enforced source root and no application aliases.
- `pnpm exec tsc -b tsconfig.packages.json`: builds the cipher and its database
  adapter. The adapter consumes emitted declarations with source redirects
  disabled. This checks only the database cipher boundary, not all database code.
- `pnpm --filter @orvilo/database type-check`: all database production source,
  with aliases restricted to foundational packages. Tests remain covered by the
  original full CI gate. Existing Markdown asset declarations come from their
  owning agent-templates package.
- `pnpm --filter @orvilo/agent-manager-runtime type-check`: core runtime and tests
  without application aliases or browser stores. It consumes public entrypoints
  of types, prompts, model-bank and const; those dependencies still expose source.

An initial runtime compiler file-list check loaded 430 repository files across
those five packages. It
no longer loads frontend or server code, but is not yet a declaration-only build.
Migrating the shared types/prompts/model-bank exports to composite declarations
is the next prerequisite to reducing that closure further. The database package
still consumes source from shared dependencies; its test files remain in the full
CI check. Do not narrow
its includes and call that package isolation.

New independent packages should extend the base, declare their direct dependencies,
use a composite build with `rootDir`, and validate their generated declaration entry.
The cipher keeps source exports for normal workspace consumers so fresh installs
do not require generated files; its composite database consumer explicitly resolves
the emitted declarations.
Build referenced declarations before checking consumers. Build outputs and
`.tsbuildinfo` remain ignored.

The `orviloTypecheck` manifest contract declares each project's compiler, build/check
mode and coverage (`full`, `production`, or `partial`). The affected runner keeps
production-only and partial packages on the full-CI-required list. It reads workspace
patterns from pnpm, includes nested packages and the root application, and bounds
tsgo memory/concurrency by default (overridable with GOMEMLIMIT/GOMAXPROCS).

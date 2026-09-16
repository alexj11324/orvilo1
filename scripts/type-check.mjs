/**
 * CI-only gate for full-repo type-checks.
 *
 * `tsgo --noEmit` on the root tsconfig needs several GB of memory and gets
 * OOM-killed on developer machines, so it only runs in the `Typecheck` job of
 * .github/workflows/test.yml. Local `bun run type-check` / `bun run check --type`
 * fail fast here instead of after a 15-minute run.
 *
 * Usage: node scripts/type-check.mjs <command...>   (default: tsgo --noEmit)
 */
import { spawnSync } from 'node:child_process';

const isCI = Boolean(process.env.GITHUB_ACTIONS || process.env.CI);

if (!isCI) {
  console.error(
    '✗ Full-repo type-check runs in CI only — it OOMs developer machines.\n' +
      '  See the `Typecheck` job in .github/workflows/test.yml.\n' +
      '  For local verification use `bun run check <files>` (lint + related tests),\n' +
      '  or a scoped package check like `cd apps/server && pnpm type-check`.',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const [command, ...rest] = args.length > 0 ? args : ['tsgo', '--noEmit'];
const { status } = spawnSync(command, rest, { shell: true, stdio: 'inherit' });
process.exit(status ?? 1);

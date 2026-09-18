// @vitest-environment node
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the self-built OAuth app console retirement (HS-50).
 *
 * The console let a user mint OIDC clients of their own — an object with no
 * task / run / project behind it — so the router and every write path into the
 * `oidcClients` table were withdrawn. The *capabilities* that were never built
 * on it stay: sign-in is better-auth, GitHub goes through the Market OAuth
 * proxy, Linear runs its own PKCE flow, and the device flow the CLI uses comes
 * from the static `defaultClients` in `src/libs/oidc-provider/config.ts`.
 *
 * The router module itself is gone, so this guard cannot assert on its
 * procedure list — it asserts the stronger, structural fact instead: there is
 * no module left to mount, and nothing under the server tree can write an OIDC
 * client through `OidcClientModel` any more.
 *
 * See `docs/development/hidden-surface-retirement.md` (HS-50 / HS-51).
 */
const repoRoot = path.resolve(import.meta.dirname, '../../../../../..');

const exists = (relativePath: string) =>
  lstatSync(path.join(repoRoot, relativePath), { throwIfNoEntry: false }) !== undefined;

/** The two server subtrees a resurrected console would be rebuilt in. */
const SERVER_TREES = ['apps/server/src/routers', 'apps/server/src/services'];

const sourceFilesUnder = (relativeDir: string): string[] => {
  const files: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(entryPath);
        continue;
      }
      if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(entryPath);
    }
  };

  walk(path.join(repoRoot, relativeDir));
  return files;
};

describe('the OAuth app console router stays retired', () => {
  it('no longer ships a router module to mount', () => {
    expect(exists('apps/server/src/routers/lambda/oauthApp.ts'), 'the console router is back').toBe(
      false,
    );
  });

  it('leaves no server code path that can write an OIDC client', () => {
    // `OidcClientModel` was the console's write surface: create / update /
    // setEnabled / delete on the `oidcClients` table. It survives as a model (the
    // provider still *reads* clients), but a non-test importer under the server
    // trees means an API can mint user-created clients again.
    const importers = SERVER_TREES.flatMap(sourceFilesUnder).filter((file) =>
      readFileSync(file, 'utf8').includes('OidcClientModel'),
    );

    expect(importers, 'a server module still writes OIDC clients').toEqual([]);
  });
});

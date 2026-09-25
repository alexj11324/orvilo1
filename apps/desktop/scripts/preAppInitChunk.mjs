/**
 * `src/main/pre-app-init.ts` must run before any module reads `app.getPath('userData')`
 * (`@/const/dir` captures it at module top level). ESM source order is not enough:
 * Rolldown hoists chunk `require()`s above the statements it inlines into the entry,
 * so an inlined pre-app-init ran only after `main-app` had already captured the
 * default userData dir.
 *
 * Two things together keep it first:
 * - pre-app-init lives in its own chunk, which the entry requires before `main-app`;
 * - that chunk imports nothing but externals (node builtins, `electron`) and Rolldown's
 *   interop runtime. Any shared first-party import would make it require `main-app`
 *   itself, re-breaking the order.
 *
 * `preAppInitOrderGuard` fails the build if either invariant is broken.
 */

export const PRE_APP_INIT_CHUNK = 'pre-app-init';

/** @param {string} id */
export const isPreAppInitModule = (id) =>
  /apps\/desktop\/src\/main\/pre-app-init\.ts$/.test(id.replaceAll('\\', '/').split('?')[0]);

const LOCAL_REQUIRE = /\brequire\(\s*(["'`])\.\/([^"'`]+)\1\s*\)/g;

// Rolldown's interop helpers (`__toESM` & co.) carry no app code, so requiring them
// first is harmless. (pre-app-init avoids needing them by using named node imports.)
const isRuntimeOnlyChunk = (chunk) =>
  chunk?.type === 'chunk' &&
  chunk.moduleIds.length > 0 &&
  chunk.moduleIds.every((id) => id.startsWith('\0rolldown/runtime'));

/**
 * @param {Record<string, any>} bundle
 * @returns {string[]} the reasons the invariant does not hold (empty when it does)
 */
export const findPreAppInitOrderViolations = (bundle) => {
  const chunks = Object.values(bundle).filter((output) => output.type === 'chunk');
  const entry = chunks.find((chunk) => chunk.isEntry);
  const preAppInit = chunks.find((chunk) => chunk.name === PRE_APP_INIT_CHUNK);

  if (!entry) return ['no entry chunk was emitted'];
  if (!preAppInit) return [`no "${PRE_APP_INIT_CHUNK}" chunk was emitted`];

  const violations = [];

  const localImports = preAppInit.imports.filter(
    (fileName) => fileName in bundle && !isRuntimeOnlyChunk(bundle[fileName]),
  );
  if (localImports.length > 0) {
    violations.push(
      `"${preAppInit.fileName}" imports bundled chunks (${localImports.join(', ')}); ` +
        'pre-app-init may only import node builtins and electron',
    );
  }

  const firstLocalRequire = [...entry.code.matchAll(LOCAL_REQUIRE)]
    .map((match) => match[2])
    .find((fileName) => !isRuntimeOnlyChunk(bundle[fileName]));
  if (firstLocalRequire !== preAppInit.fileName) {
    violations.push(
      `"${entry.fileName}" requires "${firstLocalRequire ?? '(nothing)'}" ` +
        `before "${preAppInit.fileName}"`,
    );
  }

  return violations;
};

/** @returns {import('vite').Plugin} */
export const preAppInitOrderGuard = () => ({
  apply: 'build',
  generateBundle(_options, bundle) {
    const violations = findPreAppInitOrderViolations(bundle);
    if (violations.length > 0) {
      this.error(
        `pre-app-init must run before the rest of the main process:\n- ${violations.join('\n- ')}`,
      );
    }
  },
  name: 'orvilo-desktop:pre-app-init-order-guard',
});

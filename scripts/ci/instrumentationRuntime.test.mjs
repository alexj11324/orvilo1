import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import swc from 'next/dist/build/swc/index.js';
import swcOptions from 'next/dist/build/swc/options.js';
import nextWebpack from 'next/dist/compiled/webpack/webpack.js';

const root = path.resolve(import.meta.dirname, '../..');
const filename = path.join(root, 'src/instrumentation.ts');
const { webpack } = nextWebpack;
await swc.loadBindings();

for (const runtime of ['edge', 'nodejs']) {
  for (const enabled of [false, true]) {
    test(`${runtime} instrumentation with telemetry ${enabled ? 'enabled' : 'disabled'}`, async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'orvilo-instrumentation-'));
      try {
        const source = await readFile(filename, 'utf8');
        const { code } = await swc.transform(
          source,
          swcOptions.getLoaderSWCOptions({
            configDir: root,
            development: true,
            filename,
            hasReactRefresh: false,
            isPageFile: false,
            isServer: true,
            relativeFilePathFromRoot: path.relative(root, filename),
          }),
        );
        await writeFile(path.join(directory, 'instrumentation.js'), code);
        await mkdir(path.join(directory, 'libs'));
        await writeFile(path.join(directory, 'libs/debug-file-logger.js'), 'export {};');
        // Isolate telemetry startup while retaining the Node-only dependencies that Edge must prune.
        await writeFile(
          path.join(directory, 'instrumentation.node.js'),
          "import 'stream'; import 'worker_threads'; globalThis.__orviloTelemetryImports++;",
        );
        const stats = await new Promise((resolve, reject) => {
          webpack(
            {
              devtool: false,
              entry: path.join(directory, 'instrumentation.js'),
              mode: 'development',
              output: { filename: 'bundle.cjs', library: { type: 'commonjs2' }, path: directory },
              plugins: [
                new webpack.DefinePlugin({
                  'process.env.DATABASE_URL': '""',
                  'process.env.ENABLE_TELEMETRY': JSON.stringify(enabled ? '1' : ''),
                  'process.env.ENABLE_TELEMETRY_IN_DEV': '"1"',
                  'process.env.NEXT_RUNTIME': JSON.stringify(runtime),
                }),
              ],
              target: runtime === 'edge' ? 'webworker' : 'node',
            },
            (error, result) => (error ? reject(error) : resolve(result)),
          );
        });
        const compilation = stats.toJson({ all: false, errors: true, modules: true });
        assert.equal(
          stats.hasErrors(),
          false,
          compilation.errors.map((error) => error.message).join('\n'),
        );
        const importsTelemetry = compilation.modules.some((module) =>
          module.name?.includes('instrumentation.node.js'),
        );
        assert.equal(importsTelemetry, runtime === 'nodejs' && enabled);
        if (runtime === 'nodejs') {
          globalThis.__orviloTelemetryImports = 0;
          await createRequire(import.meta.url)(path.join(directory, 'bundle.cjs')).register();
          assert.equal(globalThis.__orviloTelemetryImports, enabled ? 1 : 0);
        }
      } finally {
        delete globalThis.__orviloTelemetryImports;
        await rm(directory, { force: true, recursive: true });
      }
    });
  }
}

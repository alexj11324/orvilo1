import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { build } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  isPreAppInitModule,
  PRE_APP_INIT_CHUNK,
  preAppInitOrderGuard,
} from '../preAppInitChunk.mjs';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const realPreAppInit = path.join(desktopRoot, 'src/main/pre-app-init.ts');

// Records whether `setPath('userData')` came after something already read it —
// Electron silently ignores such a late `setPath`.
const FAKE_ELECTRON = `
const paths = { appData: '/fake/appData', userData: '/fake/default-userData' };
const read = new Set();
module.exports = {
  app: {
    getPath(name) { read.add(name); return paths[name]; },
    setName() {},
    setPath(name, value) {
      if (read.has(name)) process.stdout.write('LATE_SET_PATH\\n');
      paths[name] = value;
    },
  },
};
`;

// Mirrors the real main graph: entry imports pre-app-init first, then the App,
// whose graph captures userData at module top level (like `@/const/dir`) and
// shares `@/utils/platform` with the rest of the process.
const FIXTURE = {
  'src/main/const/dir.ts': `
import { app } from 'electron';
export const userDataDir = app.getPath('userData');
`,
  'src/main/core/App.ts': `
import { userDataDir } from '@/const/dir';
import { dev } from '@/utils/platform';
export class App { start() { process.stdout.write('userData=' + userDataDir + ' dev=' + dev() + '\\n'); } }
`,
  'src/main/index.ts': `
import './pre-app-init';
import { App } from './core/App';
new App().start();
`,
  'src/main/utils/platform.ts': `
export const dev = (): boolean => process.env.ELECTRON_IS_DEV === '1';
`,
};

let root;

const put = async (file, content) => {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
};

const buildFixture = () =>
  build({
    build: {
      emptyOutDir: true,
      lib: { entry: path.join(root, 'apps/desktop/src/main/index.ts'), formats: ['cjs'] },
      minify: false,
      outDir: path.join(root, 'apps/desktop/dist/main'),
      rolldownOptions: {
        external: ['electron', /^node:/, 'side-effect-pkg'],
        output: {
          // Same chunk boundaries as vite.main.config.ts.
          manualChunks(id) {
            if (isPreAppInitModule(id)) return PRE_APP_INIT_CHUNK;
            if (/apps\/desktop\/src\/main\/core\/App\.ts$/.test(id.replaceAll('\\', '/'))) {
              return 'main-app';
            }
          },
        },
      },
      ssr: true,
    },
    configFile: false,
    logLevel: 'silent',
    plugins: [preAppInitOrderGuard()],
    resolve: { alias: { '@': path.join(root, 'apps/desktop/src/main') } },
    root: path.join(root, 'apps/desktop'),
  });

const runBuiltEntry = async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [path.join(root, 'apps/desktop/dist/main/index.js')],
    {
      env: {
        ...process.env,
        ELECTRON_IS_DEV: '1',
        ORVILO_DESKTOP_USER_DATA_DIR: '/tmp/orvilo-electron-pool/ud-10',
      },
    },
  );
  return stdout;
};

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'orvilo-pre-app-init-'));
  await put('node_modules/electron/index.js', FAKE_ELECTRON);
  for (const [file, content] of Object.entries(FIXTURE)) {
    await put(`apps/desktop/${file}`, content);
  }
});

afterEach(async () => {
  await rm(root, { force: true, recursive: true });
});

describe('pre-app-init bundle order', () => {
  it('sets the per-instance userData before the app graph captures it', async () => {
    await mkdir(path.join(root, 'apps/desktop/src/main'), { recursive: true });
    await copyFile(realPreAppInit, path.join(root, 'apps/desktop/src/main/pre-app-init.ts'));

    await buildFixture();
    const stdout = await runBuiltEntry();

    expect(stdout).not.toContain('LATE_SET_PATH');
    expect(stdout).toContain('userData=/tmp/orvilo-electron-pool/ud-10 dev=true');

    const entry = await readFile(path.join(root, 'apps/desktop/dist/main/index.js'), 'utf8');
    const outputs = await readdir(path.join(root, 'apps/desktop/dist/main'));
    const preAppInitFile = outputs.find((file) => file.startsWith(`${PRE_APP_INIT_CHUNK}-`));
    expect(preAppInitFile).toBeDefined();
    expect(entry.indexOf(`require("./${preAppInitFile}")`)).toBeLessThan(
      entry.indexOf('require("./main-app-'),
    );
  });

  it('fails the build when pre-app-init imports a module shared with main-app', async () => {
    await put(
      'apps/desktop/src/main/pre-app-init.ts',
      `
import { app } from 'electron';
import { dev } from '@/utils/platform';
if (dev()) app.setPath('userData', process.env.ORVILO_DESKTOP_USER_DATA_DIR!);
`,
    );

    await expect(buildFixture()).rejects.toThrow(/pre-app-init must run before/);
  });

  it('fails the build when pre-app-init requires a non-builtin external', async () => {
    await put(
      'apps/desktop/src/main/pre-app-init.ts',
      `
import { app } from 'electron';
require('side-effect-pkg');
app.setPath('userData', process.env.ORVILO_DESKTOP_USER_DATA_DIR!);
`,
    );

    await expect(buildFixture()).rejects.toThrow(/imports side-effect-pkg/);
  });
});

describe('pre-app-init source', () => {
  it('imports or requires only node builtins and electron', async () => {
    const source = await readFile(realPreAppInit, 'utf8');
    const specifiers = [
      ...source.matchAll(/^\s*import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/gm),
      ...source.matchAll(/\b(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1]);

    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier === 'electron' || specifier.startsWith('node:')).toBe(true);
    }
  });
});

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

import {
  decodeActualScreenshotRGBA,
  restoreActualRGBATransfer,
} from './actual-rgba-byte-transfer.mjs';
import gate from './public-asset-ready-gate.cjs';
import { installPublicDocumentAssetRoute } from './public-document-asset-routes.mjs';
import { installPublicFileIconAssetRoute } from './public-fileicon-asset-routes.mjs';
import { installPublicStylesheetFontRoutes } from './public-stylesheet-font-routes.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url)),
  root = process.env.ORVILO_PRODUCT_ROOT,
  output = process.env.ORVILO_NATIVE_OUTPUT;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const binding = JSON.parse(fs.readFileSync(path.join(directory, 'binding.json'), 'utf8'));
const checks = [],
  screenshots = [],
  errors = [],
  network = [],
  warnings = [];
const write = (name, value) =>
  fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const check = (id, value, detail = {}) => {
  checks.push({ id, passed: !!value, detail });
  assert(value, id);
};
function verify() {
  assert.equal(git('rev-parse', 'HEAD'), binding.head);
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(
    hash(execFileSync('git', ['-C', root, 'ls-files', '-s', '-z'], { maxBuffer: 4 * 1024 * 1024 })),
    binding.gitIndexSHA256,
  );
  for (const [file, sha] of Object.entries(binding.productFiles))
    assert.equal(hash(fs.readFileSync(path.join(root, file))), sha, file);
  for (const [file, sha] of Object.entries(binding.sourceFiles))
    assert.equal(hash(fs.readFileSync(path.join(directory, file))), sha, file);
}
verify();
assert.equal(process.env.ORVILO_EXPECTED_HEAD, binding.head);
assert.equal(process.env.ORVILO_NATIVE_SCOPE, 'sdk942-first');
const requireRoot = createRequire(path.join(root, 'package.json'));
const { createServer } = await import(pathToFileURL(requireRoot.resolve('vite')).href);
const { _electron } = await import(pathToFileURL(process.env.ORVILO_PLAYWRIGHT_MODULE).href);
let server,
  electron,
  page,
  routes = [];
const capture = async (label) => {
  const png = await page.screenshot({ path: path.join(output, label + '.png'), fullPage: false });
  const actual = await page.evaluate(decodeActualScreenshotRGBA, png.toString('base64'));
  const rgba = restoreActualRGBATransfer(actual);
  fs.writeFileSync(path.join(output, label + '.rgba.gz'), gzipSync(rgba));
  screenshots.push({
    label,
    pngSHA256: hash(png),
    rgbaSHA256: hash(rgba),
    width: actual.width,
    height: actual.height,
    rgbaBytes: rgba.length,
  });
};
let passed = false;
try {
  server = await createServer({
    configFile: path.join(directory, 'vite.config.mts'),
    mode: 'development',
  });
  write('actual-resolved-optimizer-config.json', {
    entries: server.config.optimizeDeps.entries,
    include: server.config.optimizeDeps.include,
    exclude: server.config.optimizeDeps.exclude,
    noDiscovery: server.config.optimizeDeps.noDiscovery ?? false,
    cacheDir: server.config.cacheDir,
    plugins: server.config.plugins.map((plugin) => plugin.name),
    css: server.config.css,
    resolve: { alias: server.config.resolve.alias, dedupe: server.config.resolve.dedupe },
    productionCSSParityClaimed: false,
  });
  for (const forbidden of ['antd', '@ant-design/icons', '@lobehub/ui', '@lobehub/ui/base-ui'])
    assert(
      !server.config.optimizeDeps.include.includes(forbidden),
      'Unconsumed full UI barrel must not be restored to explicit optimizer include: ' + forbidden,
    );
  await server.listen();
  const url = `http://127.0.0.1:${process.env.ORVILO_NATIVE_PORT || 5179}/`;
  // Warm actual external fixture and globals through the same Desktop renderer pipeline; no production rebuild.
  await server.transformRequest('/@fs/' + path.join(directory, 'fixture.tsx').replace(/^\//, ''));
  electron = await _electron.launch({
    executablePath: process.env.ORVILO_ELECTRON_PATH,
    chromiumSandbox: true,
    args: [path.join(directory, 'electron-main.cjs')],
    timeout: 60000,
    env: { ...process.env, ORVILO_NATIVE_URL: url },
  });
  page = await electron.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on('requestfailed', (request) =>
    network.push({ url: request.url(), failure: request.failure() }),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) network.push({ url: response.url(), status: response.status() });
  });
  const font = await installPublicStylesheetFontRoutes(page, { fixtureURL: url }),
    folder = await installPublicFileIconAssetRoute(page, { fixtureURL: url }),
    document = await installPublicDocumentAssetRoute(page, { fixtureURL: url });
  routes = [font, folder, document];
  const groups = [
    ['fonts', font, 'public-stylesheet-font-routes.mjs'],
    ['folder', folder, 'public-fileicon-asset-routes.mjs'],
    ['document', document, 'public-document-asset-routes.mjs'],
  ];
  const manifests = groups.map(([group, route, helper]) => {
    const s = route.snapshot();
    assert(s.ready);
    return {
      group,
      manifestSHA256: s.manifestSHA256,
      helperSHA256: hash(fs.readFileSync(path.join(directory, helper))),
      count: group === 'fonts' ? 104 : 1,
    };
  });
  const webContentsId = await electron.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.id,
  );
  const payload = {
    schema: 'verified-native-public-asset-route-readiness-v1',
    rootHead: binding.head,
    scope: 'sdk942-first',
    fixtureOrigin: new URL(url).origin,
    webContentsId,
    manifests,
  };
  check(
    'trusted-main-ready',
    await electron.evaluate(({ app }, { event, payload }) => app.emit(event, payload), {
      event: gate.READY_EVENT,
      payload,
    }),
  );
  await page.waitForFunction(() => window.sdk942?.resolvedTheme);
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1240, 390])
    for (const theme of ['light', 'dark']) {
      const prefix = `${theme}-${width}`;
      await page.setViewportSize({ width, height: 960 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'no-preference' });
      await page.locator(`[data-theme-button="${theme}"]`).click();
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      const background = await page
        .locator('main')
        .evaluate((node) => getComputedStyle(node).backgroundColor);
      check(
        prefix + '-actual-theme',
        await page.evaluate((theme) => window.sdk942.resolvedTheme === theme, theme),
        { background },
      );
      check(
        prefix + '-nontransparent-theme-surface',
        background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent',
        { background },
      );
      await page.locator('[data-scene="image"]').click();
      await page.getByAltText('Native test image', { exact: true }).waitFor();
      check(
        prefix + '-image-decoded',
        await page
          .getByAltText('Native test image', { exact: true })
          .evaluate(
            (image) => image.complete && image.naturalWidth === 640 && image.naturalHeight === 480,
          ),
      );
      await capture(prefix + '-image');
      await page.getByAltText('Native test image', { exact: true }).click();
      const viewport = page.locator('[data-image-viewport]');
      await viewport.waitFor();
      check(
        prefix + '-image-open-callback',
        await page.evaluate(() =>
          window.sdk942.records
            .filter(
              (row) =>
                row.context === `${document.documentElement.dataset.theme}-${window.innerWidth}`,
            )
            .some((row) => row.kind === 'image-open' && row.value === true),
        ),
      );
      await capture(prefix + '-image-open');
      await page.keyboard.press('Escape');
      await viewport.waitFor({ state: 'hidden' });
      check(
        prefix + '-image-close-callback',
        await page.evaluate(() =>
          window.sdk942.records
            .filter(
              (row) =>
                row.context === `${document.documentElement.dataset.theme}-${window.innerWidth}`,
            )
            .some((row) => row.kind === 'image-open' && row.value === false),
        ),
      );
      await page.locator('[data-scene="panel"]').click();
      await page.locator('[data-open-panel]').click();
      const panel = page.getByRole('dialog', { name: 'Native review panel' });
      await panel.waitFor();
      await page.getByLabel('Panel draft').fill('真实 Native draft');
      check(
        prefix + '-panel-real-input',
        (await page.getByLabel('Panel draft').inputValue()) === '真实 Native draft',
      );
      check(
        prefix + '-panel-real-focus',
        await page.getByLabel('Panel draft').evaluate((node) => document.activeElement === node),
      );
      await capture(prefix + '-panel');
      const handle = page.locator('[data-floating-panel-resize-handle="topLeft"]'),
        box = await handle.boundingBox();
      assert(box);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 });
      await page.mouse.up();
      await page.waitForFunction(() =>
        window.sdk942.records
          .filter(
            (row) =>
              row.context === `${document.documentElement.dataset.theme}-${window.innerWidth}`,
          )
          .some((row) => row.kind === 'panel-resize-end'),
      );
      check(
        prefix + '-panel-pointer-resize',
        await page.evaluate(() =>
          window.sdk942.records
            .filter(
              (row) =>
                row.context === `${document.documentElement.dataset.theme}-${window.innerWidth}`,
            )
            .some(
              (row) =>
                row.kind === 'panel-resize' && row.value.width >= 280 && row.value.height >= 320,
            ),
        ),
      );
      await page.locator('[data-panel-toast]').click();
      await page.getByText('Native panel toast', { exact: true }).waitFor();
      await capture(prefix + '-panel-resized-toast');
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden' });
      await page.waitForFunction(() =>
        window.sdk942.records
          .filter(
            (row) =>
              row.context === `${document.documentElement.dataset.theme}-${window.innerWidth}`,
          )
          .some((row) => row.kind === 'panel-after-close'),
      );
      check(
        prefix + '-panel-close-lifecycle',
        await page.evaluate(() =>
          window.sdk942.records
            .filter(
              (row) =>
                row.context === `${document.documentElement.dataset.theme}-${window.innerWidth}`,
            )
            .some((row) => row.kind === 'panel-close'),
        ),
      );
      await page.locator('[data-scene="sheet"]').click();
      const sheet = page.locator('[data-floating-sheet]'),
        separator = sheet.getByRole('separator');
      await separator.waitFor();
      await page.getByLabel('Sheet draft').fill('Sheet retained 用户');
      await capture(prefix + '-sheet');
      await separator.focus();
      await page.keyboard.press('ArrowUp');
      await page.waitForFunction(() =>
        window.sdk942.records
          .filter(
            (row) =>
              row.context === `${document.documentElement.dataset.theme}-${window.innerWidth}`,
          )
          .some((row) => row.kind === 'sheet-snap' && row.value === 600),
      );
      await page.waitForFunction(
        () =>
          Math.abs(
            document.querySelector('[data-floating-sheet]').getBoundingClientRect().height - 600,
          ) < 0.05,
      );
      check(prefix + '-sheet-real-snap', Math.abs((await sheet.boundingBox()).height - 600) < 0.05);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() =>
        window.sdk942.records
          .filter(
            (row) =>
              row.context === `${document.documentElement.dataset.theme}-${window.innerWidth}`,
          )
          .some((row) => row.kind === 'sheet-open' && row.value === false),
      );
      await page.locator('[data-open-sheet]').click();
      check(
        prefix + '-sheet-retained-draft',
        (await page.getByLabel('Sheet draft').inputValue()) === 'Sheet retained 用户',
      );
      await page.locator('[data-motion="disabled"]').click();
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector('[data-floating-sheet]')).transitionProperty ===
          'none',
      );
      check(
        prefix + '-sheet-user-motion-stop',
        await sheet.evaluate((node) => getComputedStyle(node).transitionProperty === 'none'),
      );
      await page.locator('[data-motion="agile"]').click();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(
        () =>
          getComputedStyle(document.querySelector('[data-floating-sheet]')).transitionProperty ===
          'none',
      );
      check(
        prefix + '-sheet-system-motion-stop',
        await sheet.evaluate((node) => getComputedStyle(node).transitionProperty === 'none'),
      );
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await capture(prefix + '-sheet-restored');
    }
  verify();
  check('zero-renderer-errors', errors.length === 0, { errors });
  check('zero-failed-network', network.length === 0, { network });
  const dangerous = [
    'renderer-gone.jsonl',
    'did-fail-load.jsonl',
    'external-request-denied.jsonl',
    'public-asset-gate-failed.jsonl',
  ];
  for (const file of dangerous)
    check(
      'fatal-artifact-' + file,
      !fs.existsSync(path.join(output, file)) || fs.statSync(path.join(output, file)).size === 0,
    );
  check('exact-primary-and-state-captures', screenshots.length === 24);
  passed = true;
} catch (error) {
  errors.push({ message: String(error), stack: error.stack });
  if (page)
    try {
      await capture('failure');
    } catch {
      // Preserve the primary failure when its diagnostic screenshot is unavailable.
    }
} finally {
  for (const route of routes)
    try {
      await route.dispose();
    } catch (error) {
      errors.push(String(error));
      passed = false;
    }
  if (electron)
    try {
      await electron.close();
    } catch (error) {
      errors.push(String(error));
      passed = false;
    }
  if (server) {
    try {
      const metadata = path.join(server.config.cacheDir, 'deps', '_metadata.json');
      if (fs.existsSync(metadata))
        write(
          'actual-finite-optimizer-metadata.json',
          JSON.parse(fs.readFileSync(metadata, 'utf8')),
        );
      else
        write('actual-finite-optimizer-metadata-unavailable.json', {
          metadata,
          reason: 'Run did not commit optimizer metadata; do not infer successful prewarming',
        });
    } catch (error) {
      errors.push(String(error));
      passed = false;
    }
    try {
      await server.close();
    } catch (error) {
      errors.push(String(error));
      passed = false;
    }
  }
  if (errors.length || network.length) passed = false;
  write('runtime-report.json', {
    head: binding.head,
    scope: 'sdk942-first',
    passed,
    checks,
    screenshots,
    errors,
    network,
    warnings,
    contexts: 4,
    sceneCount: 3,
    sdk942PrimaryCaptures: 12,
    supplementaryCaptures: 12,
    replacesOriginal440Matrix: false,
    productionCSSParityClaimed: false,
    businessRoutedAcceptanceClaimed: false,
  });
}
process.exitCode = passed ? 0 : 1;

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const expectedManifestSHA256 = 'dbe75cacb2ba21612723e04a270573eca9447bbc78307e3cd93deea11a65972d';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Exact unchanged original stylesheet and declared font bytes. This helper
// supplies immutable public transport data, not new CSS or a font substitute.
export async function installPublicStylesheetFontRoutes(page, { fixtureURL }) {
  const fixture = new URL(fixtureURL);
  assert.equal(fixture.protocol, 'http:');
  assert.equal(fixture.hostname, '127.0.0.1');
  const fixtureOrigin = fixture.origin;
  const manifestPath = path.join(directory, 'public-stylesheet-font-manifest.json');
  assert(lstatSync(manifestPath).isFile() && !lstatSync(manifestPath).isSymbolicLink());
  const manifestBytes = readFileSync(manifestPath);
  assert.equal(
    sha256(manifestBytes),
    expectedManifestSHA256,
    'Only the frozen official CSS/font closure is permitted',
  );
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.schema, 'finite-genuine-public-stylesheet-font-transport-v1');
  assert.equal(manifest.assets.length, 104);
  assert.equal(manifest.rootStylesheetURLs.length, 4);
  assert.equal(manifest.unplannedExternalRequestsAllowed, false);
  assert.equal(manifest.cssBytesChanged, false);
  assert.equal(manifest.fontBytesSubstituted, false);
  const byURL = new Map();
  for (const asset of manifest.assets) {
    assert(!byURL.has(asset.url), 'No duplicate or ambiguous public asset URL');
    const url = new URL(asset.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'registry.npmmirror.com');
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.equal(asset.method, 'GET');
    assert.equal(asset.navigationAllowed, false);
    assert(['stylesheet', 'font'].includes(asset.resourceType));
    const bodyPath = path.resolve(directory, asset.bodyPath);
    assert(bodyPath.startsWith(path.join(directory, 'public-stylesheet-font-data') + path.sep));
    const stat = lstatSync(bodyPath);
    assert(stat.isFile() && !stat.isSymbolicLink());
    assert.equal(realpathSync(bodyPath), bodyPath, 'No symlinked/substituted asset body directory');
    // Validate serially and discard each buffer; never preload all fonts into
    // the Node heap or change the original runner heap/concurrency budget.
    const body = readFileSync(bodyPath);
    assert.equal(body.length, asset.bytes);
    assert.equal(sha256(body), asset.sha256);
    byURL.set(asset.url, { ...asset, bodyPath });
  }
  const registeredURLs = [],
    fulfilled = [],
    rejected = [];
  const handler = async (route) => {
    const request = route.request(),
      asset = byURL.get(request.url());
    let frameOrigin = null,
      sameMainFrame = false;
    try {
      const frame = request.frame();
      frameOrigin = new URL(frame.url()).origin;
      sameMainFrame = frame === page.mainFrame();
    } catch {
      // Detached requests retain the default unknown frame and fail closed.
    }
    const requestOrigin = request.headers().origin ?? null;
    const row = {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      navigation: request.isNavigationRequest(),
      frameOrigin,
      sameMainFrame,
      requestOrigin,
    };
    if (
      !asset ||
      row.method !== 'GET' ||
      row.resourceType !== asset.resourceType ||
      row.navigation ||
      !sameMainFrame ||
      frameOrigin !== fixtureOrigin ||
      (requestOrigin !== null && requestOrigin !== fixtureOrigin)
    ) {
      rejected.push({
        ...row,
        reason: 'Unplanned method/resource/frame/origin for a known immutable public asset',
      });
      await route.abort('blockedbyclient');
      return;
    }
    const body = readFileSync(asset.bodyPath);
    assert.equal(body.length, asset.bytes);
    assert.equal(
      sha256(body),
      asset.sha256,
      'The original CSS/font bytes must stay frozen for the run',
    );
    await route.fulfill({
      status: 200,
      contentType: asset.contentType,
      body,
      headers: {
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        // Genuine cross-origin public fonts use CORS. Permit this exact fixture
        // origin only; no credential flag, wildcard origin or security bypass.
        'access-control-allow-origin': fixtureOrigin,
        'vary': 'Origin',
      },
    });
    fulfilled.push({
      ...row,
      package: asset.package,
      version: asset.version,
      archiveMember: asset.archiveMember,
      responseStatus: 200,
      responseBytes: body.length,
      responseSHA256: asset.sha256,
      registryArchiveSha256: asset.registryArchiveSha256,
      registrySRI: asset.registrySRI,
      suppliedBy:
        'Playwright immutable transport fulfillment of full-SRI-verified official npm bytes',
      liveRemoteHTTPResponseClaimed: false,
    });
  };
  // Each of the 104 finite literal original URLs is registered individually.
  // No host/network wildcard and no route.fetch/continue is introduced.
  try {
    for (const asset of manifest.assets) {
      await page.route(asset.url, handler);
      registeredURLs.push(asset.url);
    }
  } catch (error) {
    for (const url of registeredURLs) await page.unroute(url, handler);
    throw error;
  }
  const snapshot = () => ({
    ready: registeredURLs.length === 104,
    fixtureOrigin,
    manifestSHA256: expectedManifestSHA256,
    exactRegisteredURLs: [...registeredURLs],
    rootStylesheetURLs: [...manifest.rootStylesheetURLs],
    fulfilled: structuredClone(fulfilled),
    rejected: structuredClone(rejected),
    source:
      'Exact original four CSS artifacts and their 100 literal declared font files; unchanged package bytes',
    declaredFontsAllDownloadedByBrowserClaimed: false,
    glyphOrFontAcceptanceClaimed: false,
    liveRemoteHTTPResponseClaimed: false,
    electronExternalOriginGuardChanged: false,
  });
  return {
    snapshot,
    dispose: async () => {
      for (const url of registeredURLs) await page.unroute(url, handler);
      registeredURLs.length = 0;
    },
  };
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const exactURL =
  'https://registry.npmmirror.com/@lobehub/assets-fileicon/1.0.0/files/assets/document.svg';
const expectedSHA256 = 'b68c0053030eb4a05bd61c22efe807044c8f75e2b21ca8f2c314bfe3d19b151a';
const expectedBytes = 291;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Immutable genuine public package data only. This changes transport, never
// the SDK URL, component, provider, SVG bytes, dimensions, style or callbacks.
export async function installPublicDocumentAssetRoute(page, { fixtureURL }) {
  const fixture = new URL(fixtureURL);
  assert.equal(fixture.protocol, 'http:');
  assert.equal(fixture.hostname, '127.0.0.1');
  const fixtureOrigin = fixture.origin;
  const manifestPath = path.join(directory, 'public-document-asset-manifest.json');
  const manifestStat = lstatSync(manifestPath);
  assert(
    manifestStat.isFile() && !manifestStat.isSymbolicLink(),
    'Asset manifest must be an ordinary frozen file',
  );
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.schema, 'finite-genuine-public-document-asset-transport-v1');
  assert.equal(manifest.assets.length, 1, 'Only the actual observed document asset is planned');
  const [asset] = manifest.assets;
  assert.equal(asset.url, exactURL);
  assert.equal(asset.package, '@lobehub/assets-fileicon');
  assert.equal(asset.version, '1.0.0');
  assert.equal(asset.member, 'package/assets/document.svg');
  assert.equal(asset.bodyPath, 'public-document-asset-data/document.svg');
  assert.equal(asset.sha256, expectedSHA256);
  assert.equal(asset.bytes, expectedBytes);
  assert.equal(asset.contentType, 'image/svg+xml');
  assert.equal(asset.method, 'GET');
  assert.equal(asset.resourceType, 'image');
  assert.equal(asset.navigationAllowed, false);
  assert.equal(
    asset.registryArchiveSha256,
    '2e0cab77d95e7114c3b5bb43f1bd90adb027a727eec924efdb9e2c27c04938ea',
  );
  assert.equal(
    asset.registrySRI,
    'sha512-7U8Aj6WfC/Ve6ysYziFBVCC0veID7ES/B8pEtVAzxkq1zY9MXwSXZtplYgjbNx4l2dCsvB6wEK9TBabgo0knpA==',
  );
  assert.equal(manifest.unplannedExternalRequestsAllowed, false);
  const bodyPath = path.join(directory, asset.bodyPath);
  const bodyStat = lstatSync(bodyPath);
  assert(
    bodyStat.isFile() && !bodyStat.isSymbolicLink(),
    'Genuine asset body must be an ordinary frozen file',
  );
  assert.equal(
    realpathSync(bodyPath),
    bodyPath,
    'No symlinked asset directory or substituted external body',
  );
  const body = readFileSync(bodyPath);
  assert.equal(body.length, expectedBytes);
  assert.equal(sha256(body), expectedSHA256);
  const fulfilled = [],
    rejected = [];
  let registered = false;
  const handler = async (route) => {
    const request = route.request();
    let frameOrigin = null,
      sameMainFrame = false;
    try {
      const frame = request.frame();
      frameOrigin = new URL(frame.url()).origin;
      sameMainFrame = frame === page.mainFrame();
    } catch {
      // Detached requests retain the default unknown frame and fail closed.
    }
    const row = {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      navigation: request.isNavigationRequest(),
      frameOrigin,
      sameMainFrame,
    };
    if (
      row.url !== exactURL ||
      row.method !== 'GET' ||
      row.resourceType !== 'image' ||
      row.navigation ||
      !sameMainFrame ||
      frameOrigin !== fixtureOrigin
    ) {
      rejected.push({
        ...row,
        reason: 'Unplanned method/resource/frame/origin for the exact public asset',
      });
      await route.abort('blockedbyclient');
      return;
    }
    assert.equal(
      sha256(readFileSync(bodyPath)),
      expectedSHA256,
      'Asset file must stay immutable during the run',
    );
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
      body,
    });
    fulfilled.push({
      ...row,
      responseStatus: 200,
      responseBytes: body.length,
      responseSHA256: expectedSHA256,
      suppliedBy:
        'Playwright transport fulfillment with full-SRI-verified official npm package bytes',
      liveRemoteHTTPResponseClaimed: false,
      package: asset.package,
      version: asset.version,
      registryArchiveSha256: asset.registryArchiveSha256,
    });
  };
  // Exact string match only: no CDN host wildcard and no route.continue/fetch.
  await page.route(exactURL, handler);
  registered = true;
  const snapshot = () => ({
    ready: registered,
    fixtureOrigin,
    exactURL,
    manifestSHA256: sha256(manifestBytes),
    sourceAsset: {
      package: asset.package,
      version: asset.version,
      member: asset.member,
      bytes: body.length,
      sha256: expectedSHA256,
      registrySRI: asset.registrySRI,
      registryArchiveSha256: asset.registryArchiveSha256,
    },
    fulfilled: structuredClone(fulfilled),
    rejected: structuredClone(rejected),
    boundary:
      'Only the independent exact ready gate admits this URL; unplanned external requests and RPC origin checks remain enforced',
    liveRemoteHTTPResponseClaimed: false,
  });
  return {
    snapshot,
    dispose: async () => {
      await page.unroute(exactURL, handler);
      registered = false;
    },
  };
}

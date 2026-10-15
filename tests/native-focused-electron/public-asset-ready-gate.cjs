const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const READY_EVENT = 'orvilo-verified-public-asset-routes-ready';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pinned = {
  fonts: {
    manifest: 'public-stylesheet-font-manifest.json',
    manifestSHA256: 'dbe75cacb2ba21612723e04a270573eca9447bbc78307e3cd93deea11a65972d',
    helper: 'public-stylesheet-font-routes.mjs',
    helperSHA256: '92c2e2a066f92d685cfcbddd0ba4b75190163e71c9d8a8528cc5efeaa5cee8ac',
    schema: 'finite-genuine-public-stylesheet-font-transport-v1',
    count: 104,
    prefix: 'public-stylesheet-font-data/',
  },
  document: {
    manifest: 'public-document-asset-manifest.json',
    manifestSHA256: '3187e11d5feba8cfbd16ec8c9289996ae4ae99d3ef7db3e772a1632e7f0ab413',
    helper: 'public-document-asset-routes.mjs',
    helperSHA256: 'e9809368846a13396a6ec873773dca319856b2b9f34883952474d2bd778939bd',
    schema: 'finite-genuine-public-document-asset-transport-v1',
    count: 1,
    prefix: 'public-document-asset-data/',
  },
  folder: {
    manifest: 'public-asset-manifest.json',
    manifestSHA256: 'f9cdb038ba2ff9e5605f73fe4d9ba66e1fa86a14ec1d9bf902ecac0e1114dcd9',
    helper: 'public-fileicon-asset-routes.mjs',
    helperSHA256: '5f913de0611ccc00e827b708b7e516625f6397cfd349e5fb195fa802767817ee',
    schema: 'finite-genuine-public-asset-transport-manifest-v1',
    count: 1,
    prefix: 'public-asset-data/',
  },
};
const readOrdinary = (filename) => {
  const stat = fs.lstatSync(filename);
  assert(stat.isFile() && !stat.isSymbolicLink(), 'Frozen ordinary source/data file required');
  assert.equal(fs.realpathSync(filename), filename, 'No symlinked body/source directory');
  return fs.readFileSync(filename);
};

// Main process reads independent immutable descriptors and genuine body bytes;
// a caller's "ready" boolean never defines the allowlist or its identities.
function createPublicAssetReadyGate({ directory, fixtureURL, root, scope, webContents }) {
  const fixture = new URL(fixtureURL);
  assert.equal(fixture.protocol, 'http:');
  assert.equal(fixture.hostname, '127.0.0.1');
  const origin = fixture.origin;
  const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    maxBuffer: 4096,
  }).trim();
  assert(/^[a-f0-9]{40}$/.test(head));
  const groups = ['fonts', 'folder', 'document'];
  const assets = new Map(),
    manifests = [];
  for (const group of groups) {
    const spec = pinned[group];
    const manifestBytes = readOrdinary(path.join(directory, spec.manifest));
    assert.equal(sha256(manifestBytes), spec.manifestSHA256);
    assert.equal(sha256(readOrdinary(path.join(directory, spec.helper))), spec.helperSHA256);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    assert.equal(manifest.schema, spec.schema);
    assert.equal(manifest.assets.length, spec.count);
    assert.equal(manifest.unplannedExternalRequestsAllowed, false);
    for (const asset of manifest.assets) {
      assert(!assets.has(asset.url));
      const url = new URL(asset.url);
      assert.equal(url.protocol, 'https:');
      assert.equal(url.hostname, 'registry.npmmirror.com');
      assert.equal(url.search, '');
      assert.equal(url.hash, '');
      assert.equal(asset.method, 'GET');
      assert.equal(asset.navigationAllowed, false);
      assert(
        group !== 'fonts'
          ? asset.resourceType === 'image'
          : ['stylesheet', 'font'].includes(asset.resourceType),
      );
      assert(asset.bodyPath.startsWith(spec.prefix));
      const bodyPath = path.resolve(directory, asset.bodyPath);
      assert(bodyPath.startsWith(path.resolve(directory, spec.prefix) + path.sep));
      const body = readOrdinary(bodyPath);
      assert.equal(body.length, asset.bytes);
      assert.equal(sha256(body), asset.sha256);
      assert(typeof asset.registrySRI === 'string' && asset.registrySRI.startsWith('sha512-'));
      assets.set(asset.url, {
        method: asset.method,
        resourceType: asset.resourceType,
        bodyPath,
        sha256: asset.sha256,
        bytes: asset.bytes,
        group,
      });
    }
    manifests.push({
      group,
      manifestSHA256: spec.manifestSHA256,
      helperSHA256: spec.helperSHA256,
      count: spec.count,
    });
  }
  const expected = {
    schema: 'verified-native-public-asset-route-readiness-v1',
    rootHead: head,
    scope,
    fixtureOrigin: origin,
    webContentsId: webContents.id,
    manifests,
  };
  let ready = false;
  const admitOnce = (payload) => {
    assert.equal(ready, false, 'Readiness may be admitted once only');
    assert.deepEqual(
      payload,
      expected,
      'Trusted main-process fixture control must bind the exact head/scope/window/manifests',
    );
    assert(!webContents.isDestroyed());
    assert(
      ['', 'about:blank'].includes(webContents.getURL()),
      'No fixture navigation may precede asset readiness',
    );
    assert.equal(
      execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
        maxBuffer: 4096,
      }).trim(),
      head,
    );
    // Recheck every immutable body/source immediately before admission, after
    // Playwright has registered the exact helpers in its independent process.
    for (const group of groups) {
      const spec = pinned[group];
      assert.equal(sha256(readOrdinary(path.join(directory, spec.manifest))), spec.manifestSHA256);
      assert.equal(sha256(readOrdinary(path.join(directory, spec.helper))), spec.helperSHA256);
    }
    for (const asset of assets.values())
      assert.equal(sha256(readOrdinary(asset.bodyPath)), asset.sha256);
    ready = true;
    return {
      ...expected,
      ready: true,
      verifiedAssetCount: assets.size,
      beforeFirstFixtureLoadURL: true,
    };
  };
  const permits = (details) => {
    const asset = assets.get(details.url);
    if (
      !ready ||
      !asset ||
      webContents.isDestroyed() ||
      details.webContentsId !== webContents.id ||
      details.method !== asset.method ||
      details.resourceType !== asset.resourceType
    )
      return false;
    try {
      if (new URL(webContents.getURL()).origin !== origin) return false;
      // Electron43.2 supplies frame when available; a missing/retired frame
      // does not weaken the independently required owning window/main origin.
      if (details.frame && new URL(details.frame.url).origin !== origin) return false;
    } catch {
      return false;
    }
    assert.equal(
      sha256(readOrdinary(asset.bodyPath)),
      asset.sha256,
      'Admitted public body must remain frozen',
    );
    return true;
  };
  return {
    expected,
    admitOnce,
    permits,
    snapshot: () => ({ ...expected, ready, verifiedAssetCount: assets.size }),
  };
}
module.exports = { READY_EVENT, createPublicAssetReadyGate };

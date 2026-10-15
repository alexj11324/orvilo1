import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isLocalDeviceGatewayUrl,
  parseGatewayEnv,
  PRODUCTION_DEVICE_GATEWAY_HOST,
} from './local-device-gateway.mjs';

test('parseGatewayEnv reads the URL and the token file path', () => {
  const parsed = parseGatewayEnv(`
export DEVICE_GATEWAY_URL=http://localhost:8787
export DEVICE_GATEWAY_SERVICE_TOKEN="$(cat '/tmp/device-gateway.token')"
# Start Electron with DEVICE_GATEWAY_URL=http://localhost:8787 as well.
`);
  assert.equal(parsed.url, 'http://localhost:8787');
  assert.equal(parsed.tokenFile, '/tmp/device-gateway.token');
});

test('parseGatewayEnv rejects output that omits the URL or token file', () => {
  assert.throws(
    () => parseGatewayEnv('export DEVICE_GATEWAY_URL=http://localhost:8787\n'),
    /token file/,
  );
  assert.throws(() => parseGatewayEnv('export FOO=bar\n'), /DEVICE_GATEWAY_URL/);
});

test('isLocalDeviceGatewayUrl accepts loopback HTTP and rejects the production host', () => {
  assert.equal(isLocalDeviceGatewayUrl('http://localhost:8787'), true);
  assert.equal(isLocalDeviceGatewayUrl('http://127.0.0.1:8787'), true);
  assert.equal(isLocalDeviceGatewayUrl(`https://${PRODUCTION_DEVICE_GATEWAY_HOST}`), false);
  assert.equal(isLocalDeviceGatewayUrl('http://user:pass@localhost:8787'), false);
  assert.equal(isLocalDeviceGatewayUrl('not a url'), false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isLocalDeviceGatewayUrl,
  parseAgentGatewayEnv,
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

test('parseAgentGatewayEnv reads the URL, the enable flag, and the token file path', () => {
  const parsed = parseAgentGatewayEnv(`
export ENABLE_AGENT_GATEWAY=1
export AGENT_GATEWAY_URL=http://localhost:8788
export AGENT_GATEWAY_SERVICE_TOKEN="$(cat '/tmp/agent-gateway.token')"
`);
  assert.equal(parsed.url, 'http://localhost:8788');
  assert.equal(parsed.tokenFile, '/tmp/agent-gateway.token');
  assert.throws(
    () =>
      parseAgentGatewayEnv(
        'export AGENT_GATEWAY_URL=http://localhost:8788\nexport AGENT_GATEWAY_SERVICE_TOKEN="$(cat \'/tmp/agent-gateway.token\')"\n',
      ),
    /ENABLE_AGENT_GATEWAY/,
  );
});

test('isLocalDeviceGatewayUrl accepts loopback HTTP and rejects the production host', () => {
  assert.equal(isLocalDeviceGatewayUrl('http://localhost:8787'), true);
  assert.equal(isLocalDeviceGatewayUrl('http://127.0.0.1:8787'), true);
  assert.equal(isLocalDeviceGatewayUrl(`https://${PRODUCTION_DEVICE_GATEWAY_HOST}`), false);
  assert.equal(isLocalDeviceGatewayUrl('http://user:pass@localhost:8787'), false);
  assert.equal(isLocalDeviceGatewayUrl('not a url'), false);
});

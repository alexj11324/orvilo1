// Start the local Next backend (behind the Clerk stub) and Electron, then sign the
// existing seed user in — renderer and main process — without a browser.
import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { localServerUrl, seedElectronLogin } from './electron-seed-login.mjs';
import {
  isLocalDeviceGatewayUrl,
  LOCAL_AGENT_GATEWAY_SETUP,
  LOCAL_DEVICE_GATEWAY_SETUP,
  parseAgentGatewayEnv,
  parseGatewayEnv,
  PRODUCTION_DEVICE_GATEWAY_HOST,
  waitForLocalPort,
} from './local-device-gateway.mjs';

try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (process.env.NODE_ENV === 'production')
  throw new Error('Local seed login is disabled in production');
const serverUrl = localServerUrl(process.env.SERVER_URL || 'http://localhost:3010/');
if (serverUrl.port !== '3010')
  throw new Error(
    'dev:next listens on localhost:3010; use dev:desktop:login-local for another local port',
  );
const cdpPort = process.env.ORVILO_DESKTOP_CDP_PORT || '9263';
if (!Number.isInteger(Number(cdpPort)) || Number(cdpPort) < 1 || Number(cdpPort) > 65535) {
  throw new Error('Invalid Electron CDP port');
}
const listening = (port) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: Number(port) });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(true);
    });
  });
if (await listening(cdpPort)) throw new Error(`Electron CDP port ${cdpPort} is already in use`);
const gatewayPort = process.env.GATEWAY_PORT || '8787';
if (
  !Number.isInteger(Number(gatewayPort)) ||
  Number(gatewayPort) < 1 ||
  Number(gatewayPort) > 65535
) {
  throw new Error('Invalid local device gateway port');
}
if (await listening(gatewayPort)) {
  throw new Error(
    `Local device gateway port ${gatewayPort} is already in use; stop that process or set GATEWAY_PORT. skip-login does not use the production gateway.`,
  );
}
const agentGatewayPort = process.env.AGENT_GATEWAY_PORT || '8788';
if (
  !Number.isInteger(Number(agentGatewayPort)) ||
  Number(agentGatewayPort) < 1 ||
  Number(agentGatewayPort) > 65535
) {
  throw new Error('Invalid local agent gateway port');
}
if (agentGatewayPort === gatewayPort) {
  throw new Error('The agent gateway and the device gateway need different local ports');
}
if (await listening(agentGatewayPort)) {
  throw new Error(
    `Local agent gateway port ${agentGatewayPort} is already in use; stop that process or set AGENT_GATEWAY_PORT. skip-login does not use the production agent gateway.`,
  );
}
if (!process.env.JWKS_KEY) {
  const keyFile = '.records/env/agent-testing-jwks.json';
  try {
    process.env.JWKS_KEY = (await readFile(keyFile, 'utf8')).trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const key = await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        ['scripts/generate-oidc-jwk.mjs'],
        { encoding: 'utf8' },
        (error, stdout) => {
          // The generator also prints the private key to stderr; never surface its output.
          if (error) reject(new Error('Local signing key generation failed'));
          else resolve(stdout.trim());
        },
      );
    });
    await mkdir(path.dirname(keyFile), { recursive: true, mode: 0o700 });
    await chmod(path.dirname(keyFile), 0o700);
    await writeFile(keyFile, key, { flag: 'wx', mode: 0o600 });
    process.env.JWKS_KEY = key;
  }
  if (!process.env.JWKS_KEY) throw new Error('Local signing key is empty');
}
const clerkStubPort = process.env.CLERK_STUB_PORT || '3411';
const userDataDir = mkdtempSync(path.join(tmpdir(), 'orvilo-electron-seed-'));
// Electron writes its authorization request here instead of opening a browser.
const authUrlFile = path.join(userDataDir, 'desktop-auth-url');
const children = [];
let closing = false;
let cleaned = false;

function cleanup() {
  if (cleaned || children.some((child) => !child.seedLoginClosed)) return;
  cleaned = true;
  rmSync(userDataDir, { recursive: true, force: true });
}

function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* The child already exited. */
    }
  }
  process.exitCode = code;
  cleanup();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());

const desktopLog = { text: '' };
const GATEWAY_CONNECTION_LOG = 'services:GatewayConnectionSrv';

// Main-process info goes through the `debug` package and stays silent unless this
// namespace is enabled. The ready check reads that line from the desktop output.
function desktopDebug(existing = '') {
  const parts = existing
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    parts.some((part) => part === '*' || part === GATEWAY_CONNECTION_LOG || part === 'services:*')
  ) {
    return existing;
  }
  return [...parts, GATEWAY_CONNECTION_LOG].join(',');
}

function start(script, env = {}, command = ['bun', 'run', script], { capture = false } = {}) {
  const child = spawn(command[0], command.slice(1), {
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    detached: process.platform !== 'win32',
    env: { ...process.env, ...env },
  });
  children.push(child);
  if (capture) {
    const onChunk = (chunk, write) => {
      desktopLog.text += chunk.toString();
      write(chunk);
    };
    child.stdout?.on('data', (chunk) => onChunk(chunk, (data) => process.stdout.write(data)));
    child.stderr?.on('data', (chunk) => onChunk(chunk, (data) => process.stderr.write(data)));
  }
  child.on('error', (error) => {
    console.error(`${script}: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!closing) stop(code || 1);
  });
  child.on('close', () => {
    child.seedLoginClosed = true;
    cleanup();
  });
  return child;
}

const gatewayEnvOutput = execFileSync('bash', [LOCAL_DEVICE_GATEWAY_SETUP, 'env'], {
  encoding: 'utf8',
  env: { ...process.env, GATEWAY_PORT: gatewayPort },
});
const { tokenFile, url: gatewayUrl } = parseGatewayEnv(gatewayEnvOutput);
if (!isLocalDeviceGatewayUrl(gatewayUrl)) {
  throw new Error(
    `Local device gateway env printed ${gatewayUrl}; skip-login does not use the production gateway.`,
  );
}
const gatewayToken = (await readFile(tokenFile, 'utf8')).trim();
if (!gatewayToken) throw new Error('Local device gateway service token is empty');

start('local-device-gateway', { GATEWAY_PORT: gatewayPort, JWKS_KEY: process.env.JWKS_KEY }, [
  'bash',
  LOCAL_DEVICE_GATEWAY_SETUP,
  'start',
]);
try {
  await waitForLocalPort(gatewayPort, { shouldStop: () => closing });
} catch (error) {
  console.error(error.message);
  stop(1);
}

let agentGatewayToken = '';
let agentGatewayUrl = '';
if (!closing) {
  const agentGatewayEnvOutput = execFileSync('bash', [LOCAL_AGENT_GATEWAY_SETUP, 'env'], {
    encoding: 'utf8',
    env: { ...process.env, GATEWAY_PORT: agentGatewayPort, SERVER_URL: serverUrl.origin },
  });
  const parsed = parseAgentGatewayEnv(agentGatewayEnvOutput);
  agentGatewayUrl = parsed.url;
  if (!isLocalDeviceGatewayUrl(agentGatewayUrl)) {
    throw new Error(
      `Local agent gateway env printed ${agentGatewayUrl}; skip-login does not use the production agent gateway.`,
    );
  }
  agentGatewayToken = (await readFile(parsed.tokenFile, 'utf8')).trim();
  if (!agentGatewayToken) throw new Error('Local agent gateway service token is empty');
  start(
    'local-agent-gateway',
    {
      GATEWAY_PORT: agentGatewayPort,
      JWKS_KEY: process.env.JWKS_KEY,
      SERVER_URL: serverUrl.origin,
    },
    ['bash', LOCAL_AGENT_GATEWAY_SETUP, 'start'],
  );
  try {
    await waitForLocalPort(agentGatewayPort, {
      label: 'Local agent gateway',
      shouldStop: () => closing,
    });
  } catch (error) {
    console.error(error.message);
    stop(1);
  }
}

// Seed sessions are only accepted while the server asks the stub about them; it
// forwards every other Clerk call, so a normal sign-in keeps working.
if (!closing && !(await listening(clerkStubPort)))
  start('clerk-stub', { CLERK_STUB_PORT: clerkStubPort }, [
    'node',
    '.agents/acceptance/scripts/clerk-stub.mjs',
  ]);
if (!closing)
  start('dev:next', {
    CLERK_API_URL: `http://127.0.0.1:${clerkStubPort}`,
    // The server requires a key before calling the stub; seed sessions need no real key.
    AGENT_GATEWAY_SERVICE_TOKEN: agentGatewayToken,
    AGENT_GATEWAY_URL: agentGatewayUrl,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || 'local-seed-stub',
    DEVICE_GATEWAY_SERVICE_TOKEN: gatewayToken,
    DEVICE_GATEWAY_URL: gatewayUrl,
    ENABLE_AGENT_GATEWAY: '1',
    PORT: serverUrl.port,
  });
const desktopChild = closing
  ? undefined
  : start(
      'dev:desktop',
      {
        DEBUG: desktopDebug(process.env.DEBUG),
        DEVICE_GATEWAY_URL: gatewayUrl,
        ORVILO_DESKTOP_AUTH_URL_FILE: authUrlFile,
        ORVILO_DESKTOP_CDP_PORT: cdpPort,
        ORVILO_DESKTOP_USER_DATA_DIR: userDataDir,
        ORVILO_IPC_ID: `orvilo-seed-${process.pid}`,
      },
      ['bun', 'run', 'dev:desktop'],
      { capture: true },
    );

function ownsCdpPort() {
  if (process.platform === 'win32' || !desktopChild?.pid) return false;
  try {
    const pids = execFileSync('lsof', ['-nP', `-tiTCP:${cdpPort}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      timeout: 2000,
    })
      .trim()
      .split(/\s+/);
    return (
      pids.length === 1 &&
      pids.every((pid) => {
        let current = Number(pid);
        for (let depth = 0; depth < 20 && current > 1; depth++) {
          if (current === desktopChild.pid) return true;
          current = Number(
            execFileSync('ps', ['-o', 'ppid=', '-p', String(current)], {
              encoding: 'utf8',
              timeout: 2000,
            }).trim(),
          );
        }
        return false;
      })
    );
  } catch {
    return false;
  }
}

async function ready() {
  try {
    // Signed out, this answers 401: any answer below 500 means the server is up.
    const response = await fetch(new URL('/api/auth/session', serverUrl), {
      signal: AbortSignal.timeout(2000),
    });
    if (response.status >= 500) return false;
    const cdp = await fetch(`http://127.0.0.1:${cdpPort}/json/list`, {
      signal: AbortSignal.timeout(2000),
    });
    return (
      cdp.ok &&
      (await cdp.json()).some((target) => target.type === 'page' && target.url.startsWith('app://'))
    );
  } catch {
    return false;
  }
}

const deadline = Date.now() + 180_000;
while (!closing && Date.now() < deadline && !(await ready())) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!closing) {
  if (Date.now() >= deadline) {
    console.error('Local Next and Electron did not become ready within 180 seconds');
    stop(1);
  } else {
    try {
      const { userId } = await seedElectronLogin({
        serverUrl: serverUrl.href,
        authUrlFile,
        cdpPort,
        requireLocalGateway: false,
        verifyTarget: ownsCdpPort,
      });
      const expected = `Connecting to device gateway: ${gatewayUrl}`;
      const connectDeadline = Date.now() + 30_000;
      while (!closing && Date.now() < connectDeadline) {
        if (desktopLog.text.includes(PRODUCTION_DEVICE_GATEWAY_HOST)) {
          throw new Error(
            `Electron connected to the production device gateway; skip-login must use ${gatewayUrl}`,
          );
        }
        if (desktopLog.text.includes(expected)) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (desktopLog.text.includes(PRODUCTION_DEVICE_GATEWAY_HOST)) {
        throw new Error(
          `Electron connected to the production device gateway; skip-login must use ${gatewayUrl}`,
        );
      }
      if (!desktopLog.text.includes(expected)) {
        throw new Error(`Electron did not connect to ${gatewayUrl} after seed login`);
      }
      console.log(
        `Electron development ready; local seed user ${userId} is signed in, the main process is authorized, and the device gateway is ${gatewayUrl}`,
      );
    } catch (error) {
      console.error(`Electron local login failed: ${error.message}`);
      stop(1);
    }
  }
}

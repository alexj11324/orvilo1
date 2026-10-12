// Start the local Next backend (behind the Clerk stub) and Electron, then sign the
// existing seed user in — renderer and main process — without a browser.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { localServerUrl, seedElectronLogin } from './electron-seed-login.mjs';

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

function start(script, env = {}, command = ['bun', 'run', script]) {
  const child = spawn(command[0], command.slice(1), {
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    env: { ...process.env, ...env },
  });
  children.push(child);
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

// Seed sessions are only accepted while the server asks the stub about them; it
// forwards every other Clerk call, so a normal sign-in keeps working.
if (!(await listening(clerkStubPort)))
  start('clerk-stub', { CLERK_STUB_PORT: clerkStubPort }, [
    'node',
    '.agents/acceptance/scripts/clerk-stub.mjs',
  ]);
start('dev:next', {
  CLERK_API_URL: `http://127.0.0.1:${clerkStubPort}`,
  PORT: serverUrl.port,
});
const desktopChild = start('dev:desktop', {
  ORVILO_DESKTOP_AUTH_URL_FILE: authUrlFile,
  ORVILO_DESKTOP_CDP_PORT: cdpPort,
  ORVILO_DESKTOP_USER_DATA_DIR: userDataDir,
  ORVILO_IPC_ID: `orvilo-seed-${process.pid}`,
});

function ownsCdpPort() {
  if (process.platform === 'win32') return false;
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
        verifyTarget: ownsCdpPort,
      });
      console.log(
        `Electron development ready; local seed user ${userId} is signed in and the main process is authorized`,
      );
    } catch (error) {
      console.error(`Electron local login failed: ${error.message}`);
      stop(1);
    }
  }
}

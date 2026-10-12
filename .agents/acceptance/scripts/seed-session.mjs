#!/usr/bin/env node
/**
 * seed-session.mjs — create a signed-in session for the seeded local user.
 *
 * Writes what a real sign-in leaves behind: the user's Clerk account binding
 * and an `auth_sessions` row holding the token digest plus the Clerk session
 * identity. The server only accepts it while CLERK_API_URL points at
 * `clerk-stub.mjs`, which vouches for seed sessions.
 *
 * Usage:
 *   seed-session.mjs                       # print the session token on stdout
 *   seed-session.mjs --electron <cdpPort>  # also sign a running Electron instance in
 *   seed-session.mjs --electron <cdpPort> --desktop-auth <file>
 *       # and authorize its main process, which is what connects this machine as
 *       # a device. Start Electron with ORVILO_DESKTOP_AUTH_URL_FILE=<file> first.
 *
 * Env:
 *   DATABASE_URL  (required)  Postgres the dev server uses
 *   SEED_EMAIL    (default agent-testing@orvilo.aspectlylabs.com)  existing local user
 *   SERVER_URL    (default http://localhost:3010)  dev server; must be on localhost
 *
 * Exit behavior: 0 on success; 1 with a one-line reason on stderr otherwise.
 * The token is a credential for the local server: capture it, do not log it.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { seedClerkIdentity } from './clerk-stub.mjs';
import { completeAuthorization, readAuthUrl } from './desktop-authorize.mjs';

const require = createRequire(import.meta.url);

export const createSeedSession = async ({ databaseUrl, email }) => {
  const pg = require('pg');
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows.length)
      throw new Error(`no local user for ${email} — run init-dev-env.sh seed-user first`);
    const userId = rows[0].id;
    const clerk = seedClerkIdentity(userId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    // The server only looks up 64-character tokens and stores their digest.
    const token = randomBytes(48).toString('base64url');
    const digest = `sha256:${createHash('sha256').update(token).digest('hex')}`;

    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO accounts (id, account_id, provider_id, user_id, created_at, updated_at)
         VALUES ($1, $2, 'clerk', $3, $4, $4) ON CONFLICT (id) DO NOTHING`,
        [`clerk:${clerk.upstreamUserId}`, clerk.upstreamUserId, userId, now.toISOString()],
      );
      await client.query(
        `INSERT INTO auth_sessions (id, token, user_id, expires_at, created_at, updated_at, clerk_session_id, clerk_user_id)
         VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`,
        [
          randomBytes(9).toString('base64url'),
          digest,
          userId,
          expiresAt.toISOString(),
          now.toISOString(),
          clerk.sessionId,
          clerk.upstreamUserId,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    return { token, userId };
  } finally {
    await client.end();
  }
};

const localServer = (value) => {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== 'localhost')
    throw new Error('SERVER_URL must be http://localhost:<port>');
  return url;
};

const assertAccepted = async (server, token, userId) => {
  const response = await fetch(new URL('/api/auth/session', server), {
    headers: { cookie: `orvilo_auth=${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  const body = response.ok ? await response.json() : null;
  if (body?.user?.id !== userId)
    throw new Error(
      `dev server rejected the seed session (HTTP ${response.status}) — is it running with CLERK_API_URL pointing at clerk-stub.mjs? (ORVILO_CLERK_STUB=1 dev-up.sh restart)`,
    );
};

const cdpPage = async (port) => {
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })
  ).json();
  const pages = targets.filter((t) => t.type === 'page' && t.url.startsWith('app://'));
  if (pages.length !== 1) throw new Error(`expected one Electron app page, found ${pages.length}`);
  const socket = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { reject, resolve });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  return { close: () => socket.close(), evaluate, send };
};

const signElectronIn = async ({ cdpPort, server, token, userId }) => {
  const page = await cdpPage(cdpPort);
  try {
    await page.send('Network.enable');
    await page.evaluate(
      `window.electronAPI.invoke('remoteServer.setRemoteServerConfig', ${JSON.stringify({ active: true, remoteServerUrl: server.origin, storageMode: 'selfHost' })})`,
    );
    const cookie = await page.send('Network.setCookie', {
      httpOnly: true,
      name: 'orvilo_auth',
      url: server.href,
      value: token,
    });
    if (!cookie.success) throw new Error('Electron rejected the session cookie');
    await page.evaluate('location.reload()');
    const probe = `(async () => {
      const input = encodeURIComponent(JSON.stringify({ json: {} }));
      const response = await fetch('/trpc/lambda/user.getUserState?input=' + input, { credentials: 'include' });
      return response.status;
    })()`;
    const deadline = Date.now() + 60_000;
    let status = 0;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        status = await page.evaluate(probe);
        if (status === 200) return;
      } catch {
        /* The renderer may still be reloading. */
      }
    }
    throw new Error(`Electron renderer is not authenticated for ${userId} (last HTTP ${status})`);
  } finally {
    page.close();
  }
};

// The renderer's cookie does not sign the main process in: it holds its own
// tokens, obtained by an authorization request only it can start.
const authorizeMainProcess = async ({ cdpPort, server, token, urlFile }) => {
  const page = await cdpPage(cdpPort);
  try {
    const config = { active: true, remoteServerUrl: server.origin, storageMode: 'selfHost' };
    const started = await page.evaluate(
      `window.electronAPI.invoke('auth.requestAuthorization', ${JSON.stringify(config)})`,
    );
    if (!started?.success)
      throw new Error(`Electron could not start the authorization (${started?.error})`);
    await completeAuthorization({ authUrl: await readAuthUrl(urlFile), server, token });

    // Electron polls the handoff every few seconds, then exchanges the code.
    const deadline = Date.now() + 60_000;
    let error = 'timed out';
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const result = await page.evaluate(`window.electronAPI.invoke('gatewayConnection.connect')`);
      if (result?.success) return;
      error = result?.error ?? error;
    }
    throw new Error(`the Electron main process is not authorized (${error})`);
  } finally {
    page.close();
  }
};

const flagValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : (process.argv[index + 1] ?? '');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const electronFlag = process.argv.indexOf('--electron');
  const cdpPort = electronFlag === -1 ? undefined : Number(process.argv[electronFlag + 1]);
  try {
    if (process.env.NODE_ENV === 'production') throw new Error('refusing to run in production');
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    if (electronFlag !== -1 && !Number.isInteger(cdpPort))
      throw new Error('--electron needs a CDP port');
    const urlFile = flagValue('--desktop-auth');
    if (urlFile !== undefined && (!urlFile || cdpPort === undefined))
      throw new Error('--desktop-auth needs a file path and --electron <cdpPort>');
    const server = localServer(process.env.SERVER_URL || 'http://localhost:3010');
    const { token, userId } = await createSeedSession({
      databaseUrl: process.env.DATABASE_URL,
      email: process.env.SEED_EMAIL || 'agent-testing@orvilo.aspectlylabs.com',
    });
    await assertAccepted(server, token, userId);
    if (cdpPort === undefined) process.stdout.write(token);
    else {
      await signElectronIn({ cdpPort, server, token, userId });
      console.log(`signed in ${userId} on CDP ${cdpPort} against ${server.origin}`);
      if (urlFile) {
        await authorizeMainProcess({ cdpPort, server, token, urlFile });
        console.log(`authorized the Electron main process on CDP ${cdpPort}`);
      }
    }
  } catch (error) {
    console.error(`seed-session: ${error.message}`);
    process.exit(1);
  }
}

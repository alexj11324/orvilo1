// Sign an existing local seed user into an already running Electron dev instance.
// This never creates users or changes the database.
import { pathToFileURL } from 'node:url';

const allowedCookie = /^(?:__Secure-)?better-auth\.session_(?:token|data)$/;

export function localServerUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== 'localhost' ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('SERVER_URL must be http://localhost:<port>/');
  }
  return url;
}

export function sessionCookies(headers) {
  const cookies = headers
    .getSetCookie()
    .map((line) => {
      const [pair, ...attributes] = line.split(';');
      const equal = pair.indexOf('=');
      if (equal < 1) return null;
      const name = pair.slice(0, equal).trim();
      if (!allowedCookie.test(name)) return null;
      return {
        name,
        value: pair.slice(equal + 1),
        httpOnly: attributes.some((attribute) => attribute.trim().toLowerCase() === 'httponly'),
        secure: attributes.some((attribute) => attribute.trim().toLowerCase() === 'secure'),
      };
    })
    .filter(Boolean);
  if (!cookies.some((cookie) => cookie.name.endsWith('session_token'))) {
    throw new Error('Local sign-in did not return a session token');
  }
  return cookies;
}

async function connectCdp(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Electron CDP returned ${response.status}`);
  const targets = await response.json();
  const pages = targets.filter(
    (target) => target.type === 'page' && target.url.startsWith('app://'),
  );
  if (pages.length !== 1)
    throw new Error(`Expected one Electron app renderer, found ${pages.length}`);
  const endpoint = new URL(pages[0].webSocketDebuggerUrl);
  if (endpoint.hostname !== '127.0.0.1' && endpoint.hostname !== 'localhost') {
    throw new Error('Electron CDP endpoint must be loopback');
  }
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Electron CDP connection timed out')), 5000);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('Electron CDP connection failed'));
      },
      { once: true },
    );
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const key = ++id;
      const timer = setTimeout(() => {
        pending.delete(key);
        reject(new Error(`${method} timed out`));
      }, 10000);
      pending.set(key, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: key, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  return { send, evaluate, close: () => socket.close() };
}

export async function seedElectronLogin({
  serverUrl = process.env.SERVER_URL || 'http://localhost:3010/',
  cdpPort = process.env.ORVILO_DESKTOP_CDP_PORT || '9263',
  email = process.env.SEED_EMAIL || 'agent-testing@orvilo.aspectlylabs.com',
  password = process.env.SEED_PASSWORD || 'TestPassword123!',
  verifyTarget = () => true,
} = {}) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Local seed login is disabled in production');
  const url = localServerUrl(serverUrl);
  const port = Number(cdpPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid Electron CDP port');
  const client = await connectCdp(port);
  try {
    if (!verifyTarget()) throw new Error('Electron CDP target is not the launched instance');
    const signIn = await fetch(new URL('/api/auth/sign-in/email', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': url.origin },
      body: JSON.stringify({ callbackURL: '/', email, password }),
      signal: AbortSignal.timeout(15000),
    });
    if (!signIn.ok) throw new Error(`Local seed sign-in failed (HTTP ${signIn.status})`);
    const cookies = sessionCookies(signIn.headers);
    const cookieHeader = cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
    const session = await fetch(new URL('/api/auth/get-session', url), {
      headers: { cookie: cookieHeader },
      signal: AbortSignal.timeout(10000),
    });
    const identity = session.ok ? await session.json() : null;
    if (!identity?.user?.id) throw new Error('Local server did not accept the seed session');
    await client.send('Network.enable');
    await client.evaluate(
      `window.electronAPI.invoke('remoteServer.setRemoteServerConfig', ${JSON.stringify({ active: true, storageMode: 'selfHost', remoteServerUrl: url.origin })})`,
    );
    for (const cookie of cookies) {
      const result = await client.send('Network.setCookie', { ...cookie, url: url.href });
      if (!result.success) throw new Error(`Electron rejected ${cookie.name} cookie`);
    }
    await client.evaluate('location.reload()');
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const state = await client.evaluate(`(async () => {
          const u = window.__ORVILO_STORES?.user?.();
          if (!u?.isSignedIn || !u.isUserStateInit || u.user?.id !== ${JSON.stringify(identity.user.id)}) return false;
          const input = encodeURIComponent(JSON.stringify({ json: {} }));
          const response = await fetch('/trpc/lambda/user.getUserState?input=' + input, { credentials: 'include' });
          return response.status === 200;
        })()`);
        if (state) return { userId: identity.user.id, serverUrl: url.origin };
      } catch {
        /* Renderer may be reloading. */
      }
    }
    throw new Error('Electron did not reach an authenticated, initialized state');
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedElectronLogin().then(
    ({ userId, serverUrl }) => console.log(`Electron signed in as ${userId} on ${serverUrl}`),
    (error) => {
      console.error(`Electron local login failed: ${error.message}`);
      process.exitCode = 1;
    },
  );
}

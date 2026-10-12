/**
 * desktop-authorize.mjs — finish a desktop authorization request without a browser.
 *
 * Electron's main process starts the request (PKCE and state stay in its memory)
 * and, when launched with ORVILO_DESKTOP_AUTH_URL_FILE, writes the authorize URL
 * to that file. This module walks the same redirects a browser would, holding a
 * seeded session: authorize, accept consent, land on the desktop callback. Electron
 * then collects the code through the handoff endpoint and exchanges it itself, so
 * the tokens it keeps are ones the server issued to it.
 *
 * Local development only. Used by `seed-session.mjs --desktop-auth <file>`.
 */
import { readFile, rm } from 'node:fs/promises';

const MAX_HOPS = 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait for Electron to write the authorize URL, then consume the file. */
export const readAuthUrl = async (file, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = await readFile(file, 'utf8').catch(() => '');
    if (url) {
      await rm(file, { force: true });
      return url.trim();
    }
    await sleep(250);
  }
  throw new Error(
    `Electron wrote no authorize URL to ${file} — was it started with ORVILO_DESKTOP_AUTH_URL_FILE set to that path?`,
  );
};

/**
 * Follow the authorization from `authUrl` to the desktop callback.
 * `token` is the seeded session token; `server` is the dev server URL.
 */
export const completeAuthorization = async ({ authUrl, fetchImpl = fetch, server, token }) => {
  const cookies = new Map([['orvilo_auth', token]]);
  let url = new URL(authUrl);
  if (url.origin !== server.origin || url.pathname !== '/oidc/auth')
    throw new Error('the authorize URL does not belong to the local dev server');
  let body;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const response = await fetchImpl(url, {
      body,
      headers: {
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
        origin: server.origin,
      },
      method: body ? 'POST' : 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) cookies.set(name, value);
      else cookies.delete(name);
    }

    const location = response.headers.get('location');
    if (!location)
      throw new Error(`authorization stopped at ${url.pathname} (HTTP ${response.status})`);
    const next = new URL(location, url);
    if (next.origin !== server.origin)
      throw new Error('authorization redirected away from the local dev server');

    if (next.pathname === '/oauth/callback/success') return;
    if (next.pathname.startsWith('/oauth/callback/'))
      throw new Error(
        `the server refused the authorization (${next.searchParams.get('reason') ?? 'unknown reason'})`,
      );
    if (next.pathname.startsWith('/signin'))
      throw new Error('the dev server did not accept the seeded session');

    if (next.pathname.startsWith('/oauth/consent/')) {
      // The consent page is a form; answer it the way its Accept button does.
      url = new URL('/oidc/consent', server);
      body = new URLSearchParams({ consent: 'accept', uid: next.pathname.split('/').pop() });
    } else {
      url = next;
      body = undefined;
    }
  }
  throw new Error(`authorization did not finish within ${MAX_HOPS} redirects`);
};

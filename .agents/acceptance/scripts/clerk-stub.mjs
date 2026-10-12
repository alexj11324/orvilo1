#!/usr/bin/env node
/**
 * clerk-stub.mjs — local Clerk Backend API stand-in for seeded test sessions.
 *
 * The server revalidates every session against Clerk (`GET /v1/sessions/:id`),
 * so a seeded `auth_sessions` row is only accepted when Clerk vouches for it.
 * This stub vouches for seed sessions and forwards everything else to the real
 * Clerk Backend API unchanged, so a normal Google sign-in on the same dev
 * server keeps working.
 *
 * Point the dev server at it with CLERK_API_URL=http://127.0.0.1:<port>
 * (`dev-up.sh` does this when ORVILO_CLERK_STUB=1).
 *
 * Usage: clerk-stub.mjs
 *
 * Env:
 *   CLERK_STUB_PORT      (default 3411)                    loopback port to listen on
 *   CLERK_STUB_UPSTREAM  (default https://api.clerk.com)   where other requests go
 *
 * Exit behavior: runs until killed; exits 1 when NODE_ENV=production or the
 * port is taken.
 */
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { pathToFileURL } from 'node:url';

export const SEED_SESSION_PREFIX = 'sess_local_seed_';
export const SEED_CLERK_USER_PREFIX = 'clerk_local_seed_';

/** The Clerk identity a seeded local session carries for `userId`. */
export const seedClerkIdentity = (userId) => ({
  sessionId: `${SEED_SESSION_PREFIX}${userId}`,
  upstreamUserId: `${SEED_CLERK_USER_PREFIX}${userId}`,
});

/** The session Clerk would report for a seed session id, or null for any other id. */
export const seedSessionFor = (sessionId) => {
  if (!sessionId.startsWith(SEED_SESSION_PREFIX)) return null;
  const userId = sessionId.slice(SEED_SESSION_PREFIX.length);
  if (!/^[\w-]+$/.test(userId)) return null;
  return {
    expire_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
    id: sessionId,
    status: 'active',
    user_id: seedClerkIdentity(userId).upstreamUserId,
  };
};

const forward = (req, res, upstream) => {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  const target = new URL(req.url, upstream);
  const proxy = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
    target,
    {
      headers,
      method: req.method,
      signal: AbortSignal.timeout(10_000),
    },
    (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.on('error', () => res.destroy());
      response.pipe(res);
    },
  );
  proxy.on('error', () => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end('{"error":"clerk_upstream_unavailable"}');
  });
  req.pipe(proxy);
};

export const startClerkStub = ({ port, upstream }) =>
  new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const path = new URL(req.url, 'http://localhost').pathname;
      const seed =
        req.method === 'GET' && path.startsWith('/v1/sessions/')
          ? seedSessionFor(path.slice('/v1/sessions/'.length))
          : null;
      if (seed) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(seed));
        return;
      }
      void forward(req, res, upstream);
    });
    server.once('error', reject);
    // Loopback only: the stub answers for seed sessions without checking a key.
    server.listen(port, '127.0.0.1', () => resolve(server));
  });

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.NODE_ENV === 'production') {
    console.error('clerk-stub is a local test tool and refuses to run in production');
    process.exit(1);
  }
  const port = Number(process.env.CLERK_STUB_PORT || 3411);
  const upstream = process.env.CLERK_STUB_UPSTREAM || 'https://api.clerk.com';
  startClerkStub({ port, upstream })
    .then(() => console.log(`[clerk-stub] listening on http://127.0.0.1:${port} → ${upstream}`))
    .catch((error) => {
      console.error(`[clerk-stub] failed to start: ${error.message}`);
      process.exit(1);
    });
}

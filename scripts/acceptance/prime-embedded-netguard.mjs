/**
 * Denied-network guard for the Prime embedded runner — loaded into the runner
 * process via `node --import <this file> dist/runner.mjs`.
 *
 * Builtin module namespaces are frozen, so the interception point is the
 * prototype every outbound path funnels through: `net.Socket.prototype.connect`
 * covers net.connect/createConnection, tls/https, http.request/get, and undici
 * `fetch`; `dgram.Socket.prototype.send` covers UDP (incl. DNS datagrams).
 * Each attempt is appended to `ORVILO_NETGUARD_LOG` as
 * `{kind:'net', module, detail}` and refused with ENETUNREACH — the failure a
 * `--network none` container would surface. Bare `dns.lookup` calls (resolver
 * without a socket) are not intercepted; the runner has no code path that
 * issues one — see prime-embedded-acceptance.md for the residual gap.
 *
 * FS writes outside `ORVILO_NETGUARD_FS_WRITE_ALLOW` (colon-separated
 * prefixes, default `/tmp/`) are logged as `{kind:'fs-write', ...}` — audit
 * only, so the runner's real behavior is measured, not the guard's policy.
 *
 * Evidence: a clean run produces a log with one `guard` entry and zero `net`
 * entries.
 */
import * as dgram from 'node:dgram';
import { appendFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as net from 'node:net';
import * as tls from 'node:tls';

const LOG = process.env.ORVILO_NETGUARD_LOG;
const FS_WRITE_WHITELIST = (process.env.ORVILO_NETGUARD_FS_WRITE_ALLOW ?? '/tmp/')
  .split(':')
  .filter(Boolean)
  // The guard's own log file is not a runner write.
  .concat(LOG ? [LOG] : []);

const record = (entry) => {
  if (!LOG) return;
  try {
    appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
  } catch {
    /* Logging must never break the runner under test. */
  }
};

if (LOG) {
  try {
    writeFileSync(LOG, '');
  } catch {
    /* Unwritable log path — the caller asserts on the file anyway. */
  }
}

const socketDenied = (module, proto, method) => {
  const original = proto[method];
  proto[method] = function deniedConnect(...args) {
    record({ kind: 'net', module, detail: JSON.stringify(args[0] ?? '').slice(0, 400) });
    const error = new Error(`network access denied by acceptance guard (${module})`);
    error.code = 'ENETUNREACH';
    throw error;
  };
  return original;
};

socketDenied('net.Socket.connect', net.Socket.prototype, 'connect');
socketDenied('tls.TLSSocket.connect', tls.TLSSocket.prototype, 'connect');
socketDenied('dgram.send', dgram.Socket.prototype, 'send');

const deniedFetch = (input) => {
  record({ kind: 'net', module: 'fetch', detail: String(input).slice(0, 400) });
  const error = new Error('network access denied by acceptance guard (fetch)');
  error.code = 'ENETUNREACH';
  return Promise.reject(error);
};
if (typeof globalThis.fetch === 'function') globalThis.fetch = deniedFetch;

const fsWriteHook = (path) => {
  const resolved = String(path);
  if (FS_WRITE_WHITELIST.some((prefix) => resolved.startsWith(prefix))) return;
  record({ kind: 'fs-write', module: 'fs', detail: resolved.slice(0, 400) });
};
const wrapFsWrite = (obj, names) => {
  for (const name of names) {
    const original = obj[name];
    if (typeof original !== 'function') continue;
    obj[name] = function audited(...args) {
      fsWriteHook(args[0]);
      return original.apply(this, args);
    };
  }
};
// Builtin ESM namespaces are frozen; the CJS exports object underneath them is
// mutable and the namespace getters read through it, so patch via require().
const require = createRequire(import.meta.url);
wrapFsWrite(require('node:fs/promises'), [
  'writeFile',
  'appendFile',
  'mkdir',
  'rename',
  'copyFile',
]);
wrapFsWrite(require('node:fs'), [
  'writeFileSync',
  'appendFileSync',
  'mkdirSync',
  'renameSync',
  'copyFileSync',
]);

record({ kind: 'guard', module: 'init', detail: 'netguard armed' });

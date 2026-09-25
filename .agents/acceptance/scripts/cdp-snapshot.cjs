#!/usr/bin/env node
/**
 * Dump the *rendered* DOM of a page to a file — every element, with computed styles,
 * geometry and interactivity, in one pass.
 *
 * Why this instead of "downloading the site": Linear (and Orvilo) are client-rendered SPAs.
 * Fetching the HTML gets an empty shell plus JS bundles — none of the milestones, properties
 * or members exist until the app boots and the API answers. The thing worth having offline is
 * therefore not the served HTML but the POST-RENDER tree, which is exactly what this writes.
 *
 * Why this instead of ad-hoc cdp-inspect queries: each round trip re-renders nothing but costs
 * a websocket hop and a wait, and every question you did not anticipate needs another hop. One
 * snapshot turns all later analysis into local grep/diff, and makes the two sides comparable
 * with the same code.
 *
 * Usage:
 *   node cdp-snapshot.cjs --port 9333 --viewport 1440x900 --out /tmp/ref.json
 *   node cdp-snapshot.cjs --port 9333 --outline   # compact indented tree on stdout
 */
const http = require('node:http');
const fs = require('node:fs');
const { buildSnapshotScript } = require('./cdp-page-collector.cjs');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const PORT = Number(arg('port', '9222'));
const OUT = arg('out', '');
const VIEWPORT = arg('viewport', '');
const MATCH = arg('match', '');
// Per-CDP-call deadline; see the note on `send`. A snapshot walks the whole tree, so it gets a
// longer default than cdp-inspect, but it is still finite: a wedged renderer answers nothing.
const CALL_TIMEOUT = Number(arg('call-timeout', '60000'));
const OUTLINE = process.argv.includes('--outline');
const MAX_ELEMENTS = Number(arg('max', '20000'));

// The expression runs inside the page. Kept as one string so the page does the walking and
// only the (large) result crosses the wire. It is also exported for connector clients and tests.
const PAGE_SCRIPT = buildSnapshotScript({ maxElements: MAX_ELEMENTS });

const getJson = (path) =>
  new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`bad JSON from ${path}: ${String(error)}`));
        }
      });
    });
    req.on('error', reject);
  });

const outlineOf = (snap) => {
  const lines = [];
  for (const e of snap.elements) {
    if (!e.visible) continue;
    const bits = [];
    if (e.role) bits.push(`role=${e.role}`);
    if (e.id) bits.push(`#${e.id}`);
    if (e.behavior.isAnchor && e.behavior.href) bits.push(`→ ${e.behavior.href.slice(0, 80)}`);
    else if (e.behavior.closestAnchorHref)
      bits.push(`↳a ${e.behavior.closestAnchorHref.slice(0, 60)}`);
    if (e.behavior.isButton) bits.push('[button]');
    if (e.ownText) bits.push(`"${e.ownText.slice(0, 60)}"`);
    const paint =
      e.paint && (e.paint.computedFill !== 'none' || e.paint.computedStroke !== 'none')
        ? ` paint=${e.paint.computedFill}/${e.paint.computedStroke}`
        : '';
    lines.push(
      `${'  '.repeat(Math.min(e.depth, 12))}${e.tag} ${e.box.w}x${e.box.h}@${e.box.x},${e.box.y} ` +
        `${e.style.fontSize || ''}/${e.style.fontWeight || ''} ${e.style.color || ''}${paint} ${bits.join(' ')}`,
    );
  }
  return lines.join('\n');
};

const main = async () => {
  if (process.argv.includes('--print-script')) {
    process.stdout.write(`${PAGE_SCRIPT}\n`);
    return;
  }

  const targets = await getJson('/json/list');
  const pages = targets.filter(
    (t) => t.type === 'page' && !/^(?:devtools|chrome-extension)/.test(t.url),
  );

  if (process.argv.includes('--list')) {
    process.stdout.write(
      `${JSON.stringify(
        pages.map((t) => ({ title: t.title, url: t.url })),
        null,
        2,
      )}\n`,
    );
    return;
  }

  // See cdp-inspect.cjs: --match lets several agents share one browser by owning separate tabs.
  // Taking the first page instead would silently point two collectors at the same tab.
  const page = MATCH ? pages.find((t) => t.url.includes(MATCH)) : pages[0];
  if (!page) {
    const have = pages.map((t) => t.url).join(', ') || 'none';
    throw new Error(
      `no page target on :${PORT}${MATCH ? ` matching ${JSON.stringify(MATCH)}` : ''} (have: ${have})`,
    );
  }

  const WebSocket = require('ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  let nextId = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      // A wedged renderer answers nothing, so without a deadline this waits forever and the
      // silence reads as "still working" rather than as a failure. See cdp-inspect.cjs.
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        const error = new Error(
          `${method} got no response in ${CALL_TIMEOUT}ms — the page's main thread is likely ` +
            `wedged. Close that tab and open a new one; do not read this as slowness.`,
        );
        error.code = 'CALL_TIMEOUT';
        reject(error);
      }, CALL_TIMEOUT);
      pending.set(id, {
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  await send('Runtime.enable');

  if (VIEWPORT) {
    const [w, h] = VIEWPORT.split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await new Promise((r) => setTimeout(r, 600));
  }
  // No clearing here: `Emulation.clearDeviceMetricsOverride` reports success on this build and
  // does not restore the window (measured on :9224). See cdp-inspect.cjs.

  // Record the viewport the snapshot was actually taken at, and say so when it may be inherited.
  const effective = await send('Runtime.evaluate', {
    expression: '`${innerWidth}x${innerHeight}@dpr${devicePixelRatio}`',
    returnByValue: true,
  });
  const inherited = VIEWPORT
    ? ''
    : " (INHERITED — no --viewport given; may be another caller's override, not the window)";
  process.stderr.write(`viewport: ${effective.result?.value ?? 'unknown'}${inherited}\n`);

  const res = await send('Runtime.evaluate', {
    expression: PAGE_SCRIPT,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    process.stderr.write(`EXCEPTION: ${res.exceptionDetails.text}\n`);
    process.stderr.write(`${res.exceptionDetails.exception?.description ?? ''}\n`);
    process.exit(2);
  }

  const snap = res.result.value;
  process.stderr.write(
    `snapshot ${snap.meta.url}\n  ${snap.meta.elementCount}/${snap.meta.totalElements} elements` +
      `${snap.meta.truncated ? ' (TRUNCATED)' : ''}, viewport ${snap.meta.viewport.w}x${snap.meta.viewport.h}\n`,
  );

  if (OUT) {
    fs.writeFileSync(OUT, JSON.stringify(snap));
    process.stderr.write(`wrote ${OUT}\n`);
    fs.writeFileSync(`${OUT}.outline.txt`, outlineOf(snap));
    process.stderr.write(`wrote ${OUT}.outline.txt\n`);
  }
  if (OUTLINE) process.stdout.write(`${outlineOf(snap)}\n`);
  ws.close();
};

module.exports = { buildSnapshotScript, outlineOf };

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    // 124 matches the shell's convention for "killed by timeout": a caller can branch on a hung
    // browser without matching the message. `cmd | tail` then reading `$?` reports tail's status.
    process.exit(error.code === 'CALL_TIMEOUT' ? 124 : 1);
  });
}

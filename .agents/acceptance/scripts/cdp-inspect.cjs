#!/usr/bin/env node
/**
 * One-shot CDP evaluator: runs a JS expression in the page and prints the JSON result.
 *
 * Why this exists next to cdp-dom-probe.cjs: the probe answers "what is the shape of the
 * whole page". Behaviour parity (is this thing clickable, where does it navigate, what does
 * the cursor say) and pixel questions (what colour is this, what x does it start at) are
 * per-element questions, and re-running a whole-page probe to answer one of them is both
 * slow and lossy — the probe deliberately collapses wrappers and drops signal-free leaves,
 * so the very element you want to interrogate may already be gone from its output.
 *
 * Usage:
 *   node cdp-inspect.cjs --port 9333 --expr-file /tmp/q.js
 *   node cdp-inspect.cjs --port 9333 --expr "document.title"
 *   node cdp-inspect.cjs --port 9333 --expr "..." --click "selector"   # click first, then evaluate
 *   node cdp-inspect.cjs --port 9333 --list                             # show page targets and exit
 *   node cdp-inspect.cjs --port 9333 --match /inbox --expr "..."        # address one tab by URL
 *
 * Several agents can share one browser by owning separate tabs: navigation is per-target, so
 * distinct tabs never contend. Pass `--match <url-substring>` so the tab you drive is the one
 * you mean — without it the first page target wins, and two agents silently share a tab.
 *
 * The expression is wrapped: it may use `return` at top level, and is awaited, so
 * `await new Promise(r => setTimeout(r, 300))` works for post-click settling.
 *
 * YOU MUST WRITE `return`. The wrapper is `(async () => { <source> })()`, so a bare expression
 * is evaluated and thrown away, and the caller gets no value. That used to print `null`, which
 * is indistinguishable from an expression that legitimately returned null — so "I forgot return"
 * and "the element is not there" read identically, at exit 0. The two are now separated: a
 * discarded value prints `<undefined>` (never `null`) and warns on stderr. Callers that treat a
 * `null` result as absence are safe; callers that see `<undefined>` know they measured nothing.
 */
const http = require('node:http');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const PORT = Number(arg('port', '9222'));
const EXPR = arg('expr', '');
const EXPR_FILE = arg('expr-file', '');
const CLICK = arg('click', '');
const SHOT = arg('shot', '');
const VIEWPORT = arg('viewport', '');
const MATCH = arg('match', '');
const TIMEOUT = Number(arg('timeout', '20000'));
// Per-CDP-call deadline; see the note on `send`. Generous by default because an expression is
// allowed to await a settle delay, but finite so a dead renderer cannot stall forever.
const CALL_TIMEOUT = Number(arg('call-timeout', '30000'));

const loadSource = () => {
  if (EXPR_FILE) return require('node:fs').readFileSync(EXPR_FILE, 'utf8');
  if (EXPR) return EXPR;
  // Read from stdin so multi-line expressions survive, instead of fighting shell quoting.
  return require('node:fs').readFileSync(0, 'utf8');
};

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
    req.setTimeout(TIMEOUT, () => {
      req.destroy(new Error(`timeout talking to :${PORT}`));
    });
  });

const main = async () => {
  const targets = await getJson('/json/list');
  const pages = targets.filter(
    (t) => t.type === 'page' && !/^(?:devtools|chrome-extension)/.test(t.url),
  );

  if (process.argv.includes('--list')) {
    process.stdout.write(
      `${JSON.stringify(pages.map((t) => ({ title: t.title, url: t.url })), null, 2)}\n`,
    );
    return;
  }

  // --match exists so several agents can share one browser: each owns a different tab, and
  // navigation is per-target, so two collectors on distinct tabs never contend. Without it this
  // takes the first page, which silently hands two agents the same tab — the second navigates
  // out from under the first, and both report confidently on a page neither meant to measure.
  const page = MATCH ? pages.find((t) => t.url.includes(MATCH)) : pages[0];
  if (!page) {
    const have = pages.map((t) => t.url).join(', ') || 'none';
    throw new Error(
      `no page target on :${PORT}${MATCH ? ` matching ${JSON.stringify(MATCH)}` : ''} (have: ${have})`,
    );
  }
  process.stderr.write(`target: ${page.url}\n`);

  const WebSocket = require('ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
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
      // Every CDP call needs its own deadline. A wedged renderer answers nothing — not even
      // `return 1+1` — so without this the process waits forever, and that silence is
      // indistinguishable from a slow page, which is how a hung browser gets recorded as
      // "still running" rather than as a failure. TIMEOUT only covers the /json/list hop.
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
    // Pin BOTH sides to the same viewport before measuring: parity evidence is only comparable
    // at equal widths, and Linear re-lays-out its rail between breakpoints (the milestone
    // progress reads "100% of 2" on one layout and "2 issues · 100%" on another).
    const [w, h] = VIEWPORT.split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await new Promise((r) => setTimeout(r, 500));
  }

  if (CLICK) {
    // A real Input.dispatchMouseEvent click, not element.click(): the latter skips hit-testing,
    // so it would "work" on an element that a user cannot actually reach, which is exactly the
    // painted-shell failure mode this check exists to catch.
    const box = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(CLICK)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      })()`,
      returnByValue: true,
    });
    const b = box.result?.value;
    if (!b || b.w === 0) throw new Error(`click target not hittable: ${CLICK}`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', {
        type,
        x: Math.round(b.x),
        y: Math.round(b.y),
        button: 'left',
        clickCount: 1,
      });
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  if (SHOT) {
    // A screenshot is the one layer no attribute query can fake: an element can carry the right
    // tag, the right computed style and still be invisible (display:none on an ancestor reports
    // `display: inline` on the descendant). Capture it so "it's on screen" is never inferred.
    await send('Page.enable');
    // captureBeyondViewport matters here: Linear puts a second milestone surface well below the
    // fold (~y=2044), so a viewport-only shot silently omits the thing being compared.
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: process.argv.includes('--full'),
    });
    require('node:fs').writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
    process.stderr.write(`shot: ${SHOT}\n`);
  }

  // Don't call loadSource() with nothing to read: a bare `readFileSync(0)` on an interactive
  // terminal blocks forever waiting for EOF, which looks identical to a hung browser.
  if (!EXPR && !EXPR_FILE && process.stdin.isTTY) {
    if (!SHOT) process.stderr.write('nothing to do: pass --expr, --expr-file, or --shot\n');
    ws.close();
    return;
  }

  const wrapped = `(async () => { ${loadSource()} })()`;
  const res = await send('Runtime.evaluate', {
    expression: wrapped,
    awaitPromise: true,
    returnByValue: true,
  });

  if (res.exceptionDetails) {
    process.stderr.write(`EXCEPTION: ${res.exceptionDetails.text}\n`);
    process.stderr.write(`${res.exceptionDetails.exception?.description ?? ''}\n`);
    process.exit(2);
  }

  // `undefined` must never be printed as `null`: the two mean opposite things to a caller
  // deciding whether an element is absent, and collapsing them hides a forgotten `return`.
  if (res.result?.value === undefined && !res.result?.unserializableValue) {
    process.stderr.write('WARN: expression produced no value (undefined), not null\n');
    if (!/\breturn\b/.test(loadSource())) {
      process.stderr.write('WARN: source has no `return` — its value was discarded. Add `return`.\n');
    }
    process.stdout.write('<undefined>\n');
    ws.close();
    return;
  }

  process.stdout.write(`${JSON.stringify(res.result?.value ?? null, null, 2)}\n`);
  ws.close();
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  // 124 matches the shell's own convention for "killed by timeout", so a caller can branch on a
  // hung browser without pattern-matching the message. Note `cmd | tail` then reading `$?`
  // reports tail's status, not this one — check the exit code on its own.
  process.exit(error.code === 'CALL_TIMEOUT' ? 124 : 1);
});

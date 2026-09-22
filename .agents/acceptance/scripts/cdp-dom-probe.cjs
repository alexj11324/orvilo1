#!/usr/bin/env node
// cdp-dom-probe.cjs — capture a structural + computed-style probe from a CDP target
// via RAW DevTools protocol (same bypass rationale as cdp-capture.cjs: independent of
// the agent-browser daemon, hard-timeout guarded).
//
// Implements the structural and style layers of the Linear-parity probe contract
// (ORV-125): a pruned DOM element-tree summary (tag / role / child count / text hash)
// and a computed-style histogram over every text-bearing node, so two pages can be
// diffed without eyeballing screenshots.
//
// Usage:
//   node cdp-dom-probe.cjs --port 9333 --out probe.json [--target-url <substr>]
//                          [--max-depth 9] [--timeout 20000]
// Prints one line of JSON: {"ok":true,"out":path,"nodes":N,"texts":N} or {"ok":false,"error":...}

const http = require('node:http');
const fs = require('node:fs');

function resolveWs() {
  try {
    return require('ws');
  } catch {
    console.log(
      JSON.stringify({
        ok: false,
        error: `Cannot find module 'ws' from ${__filename}. Install repository dependencies (pnpm install) and retry.`,
      }),
    );
    process.exit(7);
  }
}

const WebSocket = resolveWs();
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i === -1 ? d : process.argv[i + 1];
};

const PORT = Number(arg('--port', 9222));
const OUT = arg('--out', '/tmp/cdp-dom-probe.json');
const TARGET_SUBSTR = arg('--target-url', '');
const MAX_DEPTH = Number(arg('--max-depth', 9));
const TIMEOUT = Number(arg('--timeout', 20000));
// e.g. --viewport 1440x900 — applied to BOTH sides so pixel/position data is comparable.
const VIEWPORT = arg('--viewport', '');

// The probe runs inside the page. Kept as a string so it can be sent verbatim
// through Runtime.evaluate with returnByValue.
const buildProbe = (maxDepth) => `(() => {
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); };
  const ownText = (el) => {
    let t = '';
    for (const n of el.childNodes) { if (n.nodeType === 3) t += norm(n.textContent) + ' '; }
    return t.trim();
  };

  let nodeCount = 0;
  const walk = (el, depth) => {
    if (depth > ${maxDepth}) return null;
    const text = ownText(el);
    const role = el.getAttribute('role');
    const aria = el.getAttribute('aria-label');
    const kids = [];
    for (const c of el.children) { const w = walk(c, depth + 1); if (w) kids.push(w); }

    // Collapse semantically-empty single-child chains (framework wrapper divs).
    // Depth limits alone are the wrong instrument here: they cut real content and
    // wrapper noise alike, so two pages with different nesting depth are not
    // comparable. Promoting the lone child keeps structure comparable instead.
    if (!text && !role && !aria && kids.length === 1) return kids[0];

    // Drop leaves that carry no observable signal at all.
    if (!text && !role && !aria && kids.length === 0) return null;

    nodeCount++;
    const out = { t: el.tagName.toLowerCase() };
    if (role) out.r = role;
    if (aria) out.a = norm(aria).slice(0, 60);
    if (text) { out.x = text.slice(0, 60); out.h = hash(text); }
    if (kids.length) out.c = kids;
    return out;
  };

  // Only text the user can actually see counts toward the style histogram.
  // A framework may keep unmounted tabs / portals in the DOM with text intact;
  // counting those would compare rendered UI against hidden markup.
  const styles = [];
  let hiddenTexts = 0;
  for (const el of document.querySelectorAll('*')) {
    const text = ownText(el);
    if (!text) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const visible =
      r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    if (!visible) { hiddenTexts++; continue; }
    styles.push({
      x: text.slice(0, 40),
      fs: cs.fontSize,
      fw: cs.fontWeight,
      lh: cs.lineHeight,
      c: cs.color,
      ff: (cs.fontFamily || '').split(',')[0].replace(/["']/g, ''),
    });
  }

  const histo = {};
  for (const s of styles) {
    const k = s.fs + '|' + s.fw + '|' + s.c;
    histo[k] = (histo[k] || 0) + 1;
  }

  // Evaluate the walk BEFORE building the result object: object-literal properties
  // are evaluated in source order, so reading nodeCount on the same line-set as the
  // walk() call would capture the pre-traversal value (always 0).
  const structure = walk(document.body, 0);

  return {
    url: location.href,
    title: document.title,
    viewport: [window.innerWidth, window.innerHeight],
    dpr: window.devicePixelRatio,
    nodeCount,
    structure,
    textNodes: styles.length,
    hiddenTexts,
    styleHistogram: histo,
    styles: styles.slice(0, 400),
  };
})()`;

const fetchJson = (path) =>
  new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', path, port: PORT }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(b));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('list timeout')));
  });

(async () => {
  let targets;
  try {
    targets = await fetchJson('/json/list');
  } catch (e) {
    console.log(
      JSON.stringify({ ok: false, error: `cannot list targets on ${PORT}: ${e.message}` }),
    );
    process.exit(2);
  }
  const pages = targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  const target = TARGET_SUBSTR ? pages.find((t) => t.url.includes(TARGET_SUBSTR)) : pages[0];
  if (!target) {
    console.log(
      JSON.stringify({ ok: false, error: `no page target on ${PORT} (pages: ${pages.length})` }),
    );
    process.exit(3);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pending = new Map();
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  const killer = setTimeout(() => {
    console.log(JSON.stringify({ ok: false, error: `probe timed out after ${TIMEOUT}ms` }));
    try {
      ws.close();
    } catch {
      // best-effort close; the process exits either way
    }
    process.exit(4);
  }, TIMEOUT);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error.message));
      } else {
        resolve(msg.result);
      }
    }
  });

  ws.on('open', async () => {
    try {
      // Force an identical viewport on both sides. Without this the reference
      // browser and the Electron window differ (e.g. 824 vs 800 tall), and every
      // pixel/position comparison is invalid before it starts.
      if (VIEWPORT) {
        const [w, h] = VIEWPORT.split('x').map(Number);
        await send('Emulation.setDeviceMetricsOverride', {
          width: w,
          height: h,
          deviceScaleFactor: 2,
          mobile: false,
        });
      }
      const res = await send('Runtime.evaluate', {
        expression: buildProbe(MAX_DEPTH),
        returnByValue: true,
        awaitPromise: false,
      });
      clearTimeout(killer);
      if (res.exceptionDetails) {
        console.log(
          JSON.stringify({ ok: false, error: res.exceptionDetails.text || 'evaluate threw' }),
        );
        process.exit(5);
      }
      const value = res.result.value;
      fs.writeFileSync(OUT, JSON.stringify(value, null, 2));
      console.log(
        JSON.stringify({
          ok: true,
          out: OUT,
          url: value.url,
          nodes: value.nodeCount,
          texts: value.textNodes,
        }),
      );
      ws.close();
      process.exit(0);
    } catch (e) {
      clearTimeout(killer);
      console.log(JSON.stringify({ ok: false, error: e.message }));
      process.exit(6);
    }
  });

  ws.on('error', (e) => {
    clearTimeout(killer);
    console.log(JSON.stringify({ ok: false, error: `ws error: ${e.message}` }));
    process.exit(8);
  });
})();

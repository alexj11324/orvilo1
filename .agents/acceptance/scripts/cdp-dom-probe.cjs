#!/usr/bin/env node
// cdp-dom-probe.cjs — capture a structural + computed-style probe from a CDP target
// via RAW DevTools protocol (same bypass rationale as cdp-capture.cjs: independent of
// the agent-browser daemon, hard-timeout guarded).
//
// Implements the structural and style layers of the Linear-parity probe contract
// (ORV-125): a compact DOM summary plus the full measured element inventory (geometry,
// pseudo-elements and SVG paint) and a computed-style histogram over every text-bearing node.
//
// ── WHAT THIS CANNOT DO (read before quoting its output as evidence) ────────────
// The style layer is a HISTOGRAM: it counts how many text-bearing nodes carry each
// fontSize/color. A histogram answers "which values appear on this page", never "is
// THIS element's value right". One wrong label disappears into its bucket.
//
// It does not verify behavior. Every element carries interactionVerification="not-tested";
// no click is dispatched, and a static onclick property is never a functional pass.
//
// Use it to TRIAGE — to find where to look. Never as a parity verdict. This is not
// hypothetical: four rounds of user-reported defects (a wrong label colour, two
// competing status-icon maps, an extra card row, a wrapping value) were all invisible
// here, and all four were found by enumerating members and pairing them element-wise.
// For anything you intend to call "aligned", use cdp-snapshot.cjs and compare paired
// elements on specific properties.
//
// Usage:
//   node cdp-dom-probe.cjs --port 9333 --out probe.json [--target-url <substr>]
//                          [--max-depth 9] [--timeout 20000]
// Prints one line of JSON: {"ok":true,"out":path,"nodes":N,"texts":N} or {"ok":false,"error":...}

const http = require('node:http');
const fs = require('node:fs');
const { buildSnapshotScript } = require('./cdp-page-collector.cjs');

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

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i === -1 ? d : process.argv[i + 1];
};

const PORT = Number(arg('--port', 9222));
const OUT = arg('--out', '/tmp/cdp-dom-probe.json');
const TARGET_SUBSTR = arg('--target-url', '');
const MAX_DEPTH = Number(arg('--max-depth', 9));
const TIMEOUT = Number(arg('--timeout', 20000));
const MAX_ELEMENTS = Number(arg('--max-elements', 20000));
// e.g. --viewport 1440x900 — applied to BOTH sides so pixel/position data is comparable.
const VIEWPORT = arg('--viewport', '');

// The probe runs inside the page. Kept as a string so it can be sent verbatim
// through Runtime.evaluate with returnByValue.

// Keep the triage output shape while sourcing its measurements from the full collector. The
// previous walk dropped textless SVG leaves and only retained a style histogram, so calendar
// icons, nested chips and zero/normal style values disappeared before comparison.
const buildProbe = (maxDepth = 9, maxElements = MAX_ELEMENTS) => {
  const snapshotScript = buildSnapshotScript({ maxElements });
  const depth =
    Number.isSafeInteger(Number(maxDepth)) && Number(maxDepth) >= 0 ? Number(maxDepth) : 9;
  return `(() => {
  const snapshot = ${snapshotScript};
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const children = new Map();
  for (const el of snapshot.elements) {
    if (!children.has(el.parent)) children.set(el.parent, []);
    children.get(el.parent).push(el);
  }

  let nodeCount = 0;
  const walk = (el, level) => {
    if (!el || level > ${depth}) return null;
    const text = el.ownText || '';
    const role = el.role;
    const aria = el.aria?.label;
    const visual = Boolean(el.svg);
    const pseudo = Boolean(el.pseudo?.before || el.pseudo?.after);
    const kids = [];
    for (const child of children.get(el.i) || []) {
      const node = walk(child, level + 1);
      if (node) kids.push(node);
    }

    // Preserve visual leaves even when they have no text. In particular, an SVG calendar path
    // is evidence that a date control has an icon; dropping it makes the probe blind to that UI.
    const signal = text || role || aria || visual || pseudo;
    if (!signal && !kids.length) return null;
    if (!signal && kids.length === 1) return kids[0];

    nodeCount += 1;
    const out = { t: el.tag.toLowerCase() };
    if (role) out.r = role;
    if (aria) out.a = norm(aria).slice(0, 60);
    if (text) { out.x = text.slice(0, 60); out.h = hash(text); }
    if (visual) out.v = { tag: el.svg.tag, viewBox: el.svg.viewBox, path: el.svg.path, geometry: el.svg.geometry };
    if (pseudo) out.p = el.pseudo;
    if (kids.length) out.c = kids;
    return out;
  };

  const styles = snapshot.elements
    .filter((el) => el.ownText && el.visible)
    .map((el) => ({
      x: el.ownText.slice(0, 40),
      fs: el.style.fontSize,
      fw: el.style.fontWeight,
      lh: el.style.lineHeight,
      c: el.style.color,
      ff: (el.style.fontFamily || '').split(',')[0].replace(/["']/g, ''),
    }));
  const hiddenTexts = snapshot.elements.filter((el) => el.ownText && !el.visible).length;
  const histo = {};
  for (const style of styles) {
    const key = style.fs + '|' + style.fw + '|' + style.c;
    histo[key] = (histo[key] || 0) + 1;
  }

  const body = snapshot.elements.find((el) => el.tag === 'BODY');
  const structure = walk(body, 0);
  return {
    url: snapshot.meta.url,
    title: snapshot.meta.title,
    viewport: [snapshot.meta.viewport.w, snapshot.meta.viewport.h],
    dpr: snapshot.meta.viewport.dpr,
    nodeCount,
    structure,
    textNodes: styles.length,
    hiddenTexts,
    styleHistogram: histo,
    styles: styles.slice(0, 400),
    // Full elements make this probe useful for triage without requiring a second CDP round trip.
    // Interaction remains explicitly static: this output has not clicked anything.
    elements: snapshot.elements,
    visualNodes: snapshot.elements.filter((el) => el.svg || el.pseudo?.before || el.pseudo?.after),
    interactionVerification: 'not-tested',
  };
})()`;
};

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

const main = async () => {
  if (process.argv.includes('--print-script')) {
    process.stdout.write(`${buildProbe(MAX_DEPTH, MAX_ELEMENTS)}\n`);
    return;
  }

  const WebSocket = resolveWs();
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
};

module.exports = { buildProbe, buildSnapshotScript };

if (require.main === module) {
  main().catch((error) => {
    console.log(JSON.stringify({ ok: false, error: error.message }));
    process.exit(1);
  });
}

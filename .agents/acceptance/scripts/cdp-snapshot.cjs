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

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const PORT = Number(arg('port', '9222'));
const OUT = arg('out', '');
const VIEWPORT = arg('viewport', '');
const MATCH = arg('match', '');
const OUTLINE = process.argv.includes('--outline');
const MAX_ELEMENTS = Number(arg('max', '20000'));

// The expression runs inside the page. Kept as one string so the page does the walking and
// only the (large) result crosses the wire.
const PAGE_SCRIPT = `
(() => {
  const STYLE_PROPS = [
    'color','backgroundColor','backgroundImage','fontSize','fontWeight','fontFamily',
    'lineHeight','letterSpacing','textTransform','textDecorationLine','textAlign',
    'display','position','flexDirection','justifyContent','alignItems','gap',
    'gridTemplateColumns','gridAutoFlow','padding','margin','borderRadius','border',
    'borderTopWidth','borderBottomWidth','boxShadow','opacity','overflow','overflowX',
    'overflowY','whiteSpace','textOverflow','zIndex','transform','transition','cursor','visibility'
  ];

  // A descendant of a display:none subtree still reports its OWN display as whatever it is,
  // so visibility must be decided by geometry plus an ancestor walk, never by self-style.
  const isVisible = (el, rect) => {
    if (rect.width === 0 && rect.height === 0) return false;
    if (el.offsetParent === null) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && el.tagName !== 'BODY' && el.tagName !== 'HTML') return false;
    }
    let p = el;
    while (p && p.nodeType === 1) {
      const cs = getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      p = p.parentElement;
    }
    return true;
  };

  const ownText = (el) => {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
    return t.replace(/\\s+/g, ' ').trim();
  };

  const all = [...document.querySelectorAll('*')].slice(0, ${MAX_ELEMENTS});
  const index = new Map();
  all.forEach((el, i) => index.set(el, i));

  const elements = all.map((el, i) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const style = {};
    for (const p of STYLE_PROPS) {
      const v = cs[p];
      if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)') {
        style[p] = v;
      }
    }

    // SVG paint lives on the element/attributes, not in the text histogram — capture it
    // separately or an icon's colour is invisible to every text-based comparison.
    const isSvgish = /^(svg|path|circle|rect|line|polygon|polyline|ellipse|g)$/i.test(el.tagName);
    const paint = isSvgish
      ? {
          attrFill: el.getAttribute('fill'),
          attrStroke: el.getAttribute('stroke'),
          computedFill: cs.fill,
          computedStroke: cs.stroke,
        }
      : null;

    const anchor = el.closest('a');
    return {
      i,
      parent: el.parentElement ? (index.get(el.parentElement) ?? -1) : -1,
      depth: (() => { let d = 0, p = el.parentElement; while (p) { d += 1; p = p.parentElement; } return d; })(),
      tag: el.tagName,
      id: el.id || null,
      cls: (el.className || '').toString().slice(0, 120) || null,
      insp: el.getAttribute('data-insp-path'),
      role: el.getAttribute('role'),
      aria: {
        label: el.getAttribute('aria-label'),
        expanded: el.getAttribute('aria-expanded'),
        hidden: el.getAttribute('aria-hidden'),
        current: el.getAttribute('aria-current'),
      },
      tabindex: el.getAttribute('tabindex'),
      ownText: ownText(el).slice(0, 200) || null,
      // Full subtree text is what a user perceives; own text is what this node contributes.
      subtreeText: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200) || null,
      box: {
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
      },
      visible: isVisible(el, r),
      style,
      paint,
      // Behaviour layer: "does it look right" and "can you actually use it" are different
      // questions, and only this block answers the second one.
      behavior: {
        cursor: cs.cursor,
        tag: el.tagName,
        isAnchor: el.tagName === 'A',
        href: el.tagName === 'A' ? el.getAttribute('href') : null,
        closestAnchorHref: el.tagName === 'A' ? null : (anchor ? anchor.getAttribute('href') : null),
        isButton: el.tagName === 'BUTTON' || el.getAttribute('role') === 'button',
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
        hasOnClick: typeof el.onclick === 'function',
        pointerEvents: cs.pointerEvents,
      },
    };
  });

  return {
    meta: {
      url: location.href,
      title: document.title,
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
      scrollHeight: document.documentElement.scrollHeight,
      capturedAt: new Date().toISOString(),
      elementCount: elements.length,
      totalElements: document.querySelectorAll('*').length,
      truncated: document.querySelectorAll('*').length > ${MAX_ELEMENTS},
    },
    elements,
  };
})()
`;

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
      pending.set(id, { resolve, reject });
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

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

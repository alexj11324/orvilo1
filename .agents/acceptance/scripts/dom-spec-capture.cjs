#!/usr/bin/env node
/**
 * dom-spec-capture.cjs — capture a compact DOM + computed-style SPEC of one page
 * via raw DevTools protocol.
 *
 * Why this exists next to cdp-snapshot.cjs / cdp-dom-probe.cjs: those dump the full
 * element inventory (triage) — thousands of nodes, every style prop. This writes a
 * PARITY SPEC instead: the semantic landmarks a clone must reproduce (header, list
 * row, sidebar nav item, tabs, primary button, detail pane, empty state) with a
 * fixed computed-style whitelist, plus a pruned DOM skeleton and the deduped
 * user-visible text. Small enough to hand to an implementer, structured enough to
 * diff mechanically.
 *
 * Probe resolution is heuristic, not selector-baked: each landmark tries role /
 * aria / data-testid first, then falls back to layout (top bar, left rail, first
 * row of the biggest list). The strategy that resolved is recorded per probe, and
 * a probe that resolves nowhere comes out `null` — never invented.
 *
 * Usage:
 *   node dom-spec-capture.cjs --port 9223 --url https://linear.app/ws/inbox --out inbox.json
 *   node dom-spec-capture.cjs --port 9223 --target-id <id> --nav "text:Members" --out members.json
 *   node dom-spec-capture.cjs --port 9223 --url ... --click "text:Display options" --out menu.json
 *   node dom-spec-capture.cjs --port 9223 --list
 *
 * Flags:
 *   --url <u>          navigate the chosen tab there (Page.navigate) before capture
 *   --nav <target>     reach the page by clicking a real in-SPA link instead of a URL
 *   --click <target>   real-mouse click before capture (repeatable — menus, tabs)
 *   --key <name>       key press before capture (repeatable — Escape/Enter/Tab)
 *   --match <substr>   pick the page target whose URL contains this
 *   --target-id <id>   pick the page target by id (stable across navigations)
 *   --new              open a fresh tab via PUT /json/new and use it
 *   --tag <name>       label recorded into meta.tag (spec file name)
 *   --viewport WxH     pin both sides (default 1440x900, dpr 2)
 *   --settle-timeout   max ms for the network-idle + DOM-stability wait (15000)
 *   --probes-file <f>  JSON overriding/extending the probe list
 *   --timeout <ms>     whole-run watchdog (150000)
 *   --call-timeout     per-CDP-call deadline (30000)
 *
 * A <target> is `css:<sel>` (or a bare selector), `text:<exact-or-prefix>`,
 * or `aria:<label>`. Clicks are real Input.dispatchMouseEvent events — hit-tested.
 * Prints one line of JSON: {"ok":true,...} or {"ok":false,"error":...}. Exit 124 on
 * a wedged renderer (same convention as cdp-inspect.cjs); every CDP call is bounded.
 */
const http = require('node:http');
const fs = require('node:fs');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const argsAll = (name) => {
  const out = [];
  process.argv.forEach((a, i) => {
    if (a === `--${name}`) out.push(process.argv[i + 1]);
  });
  return out;
};

const PORT = Number(arg('port', '9223'));
const URL_TO = arg('url', '');
const NAV = arg('nav', '');
const CLICKS = argsAll('click');
const KEYS = argsAll('key');
const MATCH = arg('match', '');
const TARGET_ID = arg('target-id', '');
const WANT_NEW = process.argv.includes('--new');
const TAG = arg('tag', '');
const OUT = arg('out', '');
const VIEWPORT = arg('viewport', '1440x900');
const SETTLE_TIMEOUT = Number(arg('settle-timeout', '15000'));
const PROBES_FILE = arg('probes-file', '');
const TIMEOUT = Number(arg('timeout', '150000'));
const CALL_TIMEOUT = Number(arg('call-timeout', '30000'));

const fail = (error, extra = {}) => {
  process.stdout.write(`${JSON.stringify({ ok: false, error, ...extra })}\n`);
};
const done = (code) => {
  process.exit(code);
};

// Whole-run watchdog: a stuck navigation or a renderer that never settles must not
// hang the pipeline — report and move on.
const watchdog = setTimeout(() => {
  fail(`run timed out after ${TIMEOUT}ms`, { stage: 'watchdog' });
  done(4);
}, TIMEOUT);

const getJson = (path, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method }, (res) => {
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
    req.setTimeout(8000, () => req.destroy(new Error(`timeout talking to :${PORT}`)));
    req.end();
  });

/* ---------------------------------------------------------------------------
 * In-page capture expression. One Runtime.evaluate, returnByValue — the page does
 * the walking so only the compact spec crosses the wire.
 * ------------------------------------------------------------------------- */
const STYLE_WHITELIST = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'color',
  'background',
  'backgroundColor',
  'borderRadius',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'gap',
  'rowGap',
  'columnGap',
  'borderWidth',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'boxShadow',
  'display',
  'position',
];

// Default probe list. Each strategy: {t:'css',sel} | {t:'within',of,sel} |
// {t:'layout',kind} | {t:'text',re}. Order = preference: semantic first, layout last.
const DEFAULT_PROBES = [
  {
    name: 'sidebar-nav',
    strategies: [
      { t: 'css', sel: 'nav' },
      { t: 'css', sel: '[role="navigation"]' },
      { t: 'layout', kind: 'leftRail' },
    ],
  },
  {
    name: 'sidebar-nav-item',
    strategies: [
      {
        t: 'within',
        of: 'sidebar-nav',
        sel: 'a[href], [role="link"], [role="menuitem"], [role="tab"], [role="button"]',
      },
      { t: 'css', sel: 'nav a[href]' },
    ],
  },
  {
    name: 'header',
    strategies: [
      { t: 'css', sel: '[role="banner"]' },
      { t: 'css', sel: 'main header, [role="main"] header' },
      { t: 'css', sel: 'header' },
      { t: 'css', sel: '[data-testid*="header" i], [class*="header" i]' },
      { t: 'css', sel: '[role="toolbar"]' },
      { t: 'layout', kind: 'topBar' },
    ],
  },
  {
    name: 'tabs',
    strategies: [
      { t: 'css', sel: '[role="tablist"]' },
      { t: 'layout', kind: 'tabStrip' },
    ],
  },
  {
    name: 'list-row',
    strategies: [
      { t: 'css', sel: '[role="listbox"] [role="option"], [role="listbox"] > *' },
      { t: 'css', sel: '[role="list"] [role="listitem"], [role="list"] > *' },
      { t: 'css', sel: '[role="row"], [role="treeitem"]' },
      { t: 'layout', kind: 'firstRow' },
    ],
  },
  {
    name: 'primary-button',
    strategies: [
      { t: 'layout', kind: 'primaryButton' },
      { t: 'css', sel: 'main button, [role="main"] button' },
      { t: 'css', sel: 'button' },
    ],
  },
  {
    name: 'detail-pane',
    strategies: [
      { t: 'css', sel: '[role="complementary"], main aside, [role="main"] aside' },
      { t: 'css', sel: '[data-testid*="detail" i], [class*="detail-pane" i]' },
      { t: 'layout', kind: 'detailPane' },
    ],
  },
  {
    name: 'empty-state',
    strategies: [
      {
        t: 'text',
        re: '(no\\s+\\S[^\\n]{0,40}(yet|here|found)|nothing\\s+to\\s+see|all\\s+caught\\s+up|empty|no\\s+results|get\\s+started|all\\s+done|no\\s+\\S+\\s+yet)',
      },
    ],
  },
];

const buildCaptureScript = (probes, styleProps) => `
(() => {
  const STYLE_PROPS = ${JSON.stringify(styleProps)};
  const PROBES = ${JSON.stringify(probes)};
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const ownText = (el) => {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue || '';
    return norm(t);
  };
  const depthOf = (el) => { let d = 0, p = el; while (p && p.parentElement) { d += 1; p = p.parentElement; } return d; };
  const visible = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    let p = el;
    while (p && p.nodeType === 1) {
      let cs;
      try { cs = getComputedStyle(p); } catch { cs = null; }
      if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
      p = p.parentElement;
    }
    return true;
  };
  const qs = (root, sel) => { try { return [...root.querySelectorAll(sel)]; } catch { return []; } };
  const firstVisible = (els) => els.find(visible) || null;
  const shallowest = (els) => {
    let best = null, bd = 1e9;
    for (const e of els) {
      if (!visible(e)) continue;
      const d = depthOf(e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };
  const mainScope = () =>
    firstVisible(qs(document, 'main, [role="main"], #main, [data-testid*="main" i]')) || document.body;

  /* layout heuristics ------------------------------------------------------ */
  const all = () => qs(document, 'body *');
  const RESOLVED = {}; // filled by the probe loop: name -> element
  const LAYOUT = {
    leftRail() {
      const c = all().filter((el) => {
        if (!visible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.x <= 28 && r.width >= 140 && r.width <= 380 && r.height >= innerHeight * 0.5;
      });
      return shallowest(c);
    },
    topBar() {
      const scope = mainScope();
      const c = qs(scope === document.body ? document : scope, '*').filter((el) => {
        if (!visible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.y >= -4 && r.y <= 120 && r.height >= 24 && r.height <= 96 && r.width >= 220;
      });
      return shallowest(c);
    },
    firstRow() {
      // "First row" = first element of the largest run of same-tag, similar-size
      // visible siblings inside the main scope. Works without ARIA — a row-shaped
      // list is a repeated geometry pattern, not a selector.
      // Linear wraps each row in a zero-height div; the *representative* of a
      // wrapper is its first visible descendant chain, which is what we measure.
      const scope = mainScope();
      const skip = [RESOLVED['header'], RESOLVED['sidebar-nav']].filter(Boolean);
      // one O(n) visibility pass, then ancestor marks — beats a per-child scan
      const visSet = new Set(qs(document, 'body *').filter(visible));
      const hasVis = new Set(visSet);
      for (const el of [...visSet]) {
        let p = el.parentElement;
        while (p && !hasVis.has(p)) { hasVis.add(p); p = p.parentElement; }
      }
      const repr = (el) => {
        let cur = el;
        for (let i = 0; i < 8 && cur; i += 1) {
          if (visSet.has(cur)) return cur;
          cur = [...cur.children].find((c) => hasVis.has(c)) || null;
        }
        return cur && visSet.has(cur) ? cur : null;
      };
      let best = null, bestScore = 2, bestY = Infinity;
      for (const p of qs(scope, '*')) {
        if (!visible(p)) continue;
        if (skip.some((s) => s === p || s.contains(p))) continue;
        const reps = [...p.children].map(repr).filter(Boolean);
        if (reps.length < 3) continue;
        const groups = {};
        for (const r of reps) (groups[r.tagName] = groups[r.tagName] || []).push(r);
        for (const g of Object.values(groups)) {
          if (g.length < 3) continue;
          const rects = g.map((e) => e.getBoundingClientRect());
          const hs = rects.map((r) => r.height).filter((h) => h >= 14 && h <= 400);
          const ws = rects.filter((r) => r.width >= 140);
          if (hs.length < 3 || ws.length < 3) continue;
          const avg = hs.reduce((a, b) => a + b, 0) / hs.length;
          const similar = hs.filter((h) => Math.abs(h - avg) <= Math.max(8, avg * 0.35)).length;
          if (similar < 3) continue;
          const y = rects[0].y;
          if (similar > bestScore || (similar === bestScore && y < bestY)) {
            bestScore = similar;
            bestY = y;
            best = g[0];
          }
        }
      }
      return best;
    },
    tabStrip() {
      const parents = new Set();
      for (const m of qs(document, '[role="tab"], [aria-selected], a[aria-current], [aria-current]')) {
        if (m.parentElement) parents.add(m.parentElement);
      }
      // Linear's header tabs (Priority/Other) are plain anchors — the active one
      // points at the current pathname. Climb from it to the nearest ancestor
      // holding >=2 visible links: that ancestor is the strip.
      const here = location.pathname;
      for (const a of qs(document, 'a[href]').filter(visible)) {
        const href = a.getAttribute('href') || '';
        if (href !== here && !here.endsWith(href)) continue;
        let p = a.parentElement;
        for (let up = 0; p && up < 5; up += 1, p = p.parentElement) {
          if (qs(p, 'a[href]').filter(visible).length >= 2) { parents.add(p); break; }
        }
      }
      const c = [...parents].filter((p) => {
        if (!visible(p)) return false;
        const tabs = qs(p, '[role="tab"], [aria-selected], [aria-current], a[href]').filter(visible);
        return tabs.length >= 2 && p.getBoundingClientRect().width <= innerWidth * 0.9;
      });
      return shallowest(c);
    },
    primaryButton() {
      const scope = mainScope();
      const real = [...qs(document, 'header button, header [role="button"], [role="banner"] button'),
        ...qs(scope, 'button, [role="button"]')].filter(visible);
      const STRONG = /(new|create|compose|submit|post|save|invite|join|add(?!ed)|launch|start)/i;
      const WEAK = /(filter|options|settings|share|export|import|done|close)/i;
      const label = (el) => norm(el.textContent) + ' ' + (el.getAttribute('aria-label') || '');
      const climb = (el) => {
        let p = el;
        for (let up = 0; p && up < 6; up += 1, p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (p.tagName === 'A' || p.tagName === 'BUTTON' || p.getAttribute('role') === 'button'
            || p.getAttribute('role') === 'link' || cs.cursor === 'pointer') return p;
        }
        return el;
      };
      // a labeled element inside main whose nearest clickable ancestor is the control
      const clickyInMain = (re) => {
        const hits = qs(scope, '*').filter((el) => visible(el) && re.test(label(el)));
        const controls = [...new Set(hits.map(climb))].filter(visible);
        controls.sort((a, b) => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return ra.y - rb.y || ra.x - rb.x;
        });
        return controls[0] || null;
      };
      return real.find((el) => STRONG.test(label(el)))
        || clickyInMain(STRONG)
        || real.find((el) => WEAK.test(label(el)))
        || clickyInMain(WEAK)
        || real[0]
        || null;
    },
    detailPane() {
      const scope = mainScope();
      const row = RESOLVED['list-row'];
      const c = qs(scope, '*').filter((el) => {
        if (!visible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.x >= 340 && r.width >= 300 && r.height >= 260 && r.y >= 0;
      });
      // exclude the list itself: a region that contains the resolved first row is
      // the list column, not a detail pane beside it
      const filtered = row ? c.filter((el) => !el.contains(row) && !row.contains(el)) : c;
      if (!filtered.length) return null;
      const maxX = Math.max(...filtered.map((el) => el.getBoundingClientRect().x));
      return shallowest(filtered.filter((el) => el.getBoundingClientRect().x >= maxX - 40));
    },
  };

  /* probe resolution -------------------------------------------------------- */
  const describe = (el, name, strategy) => {
    const r = el.getBoundingClientRect();
    let cs;
    try { cs = getComputedStyle(el); } catch { cs = {}; }
    const style = {};
    for (const p of STYLE_PROPS) {
      const v = cs[p];
      if (v !== undefined && v !== null && v !== '') style[p] = v;
    }
    return {
      name,
      strategy,
      tag: el.tagName,
      id: el.id || null,
      role: el.getAttribute('role'),
      testId: el.getAttribute('data-testid'),
      ariaLabel: el.getAttribute('aria-label'),
      text: norm(el.textContent).slice(0, 80),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      style,
    };
  };

  const landmarks = {};
  const probeLog = [];
  for (const probe of PROBES) {
    let el = null, used = null;
    for (const s of probe.strategies) {
      try {
        if (s.t === 'css') {
          el = firstVisible(qs(document, s.sel));
        } else if (s.t === 'within') {
          const parent = RESOLVED[s.of];
          el = parent ? firstVisible(qs(parent, s.sel)) : null;
        } else if (s.t === 'layout') {
          el = LAYOUT[s.kind] ? LAYOUT[s.kind]() : null;
        } else if (s.t === 'text') {
          const re = new RegExp(s.re, 'i');
          const scope = mainScope();
          const hits = qs(scope, '*').filter((e) => visible(e) && re.test(ownText(e)));
          // deepest match: the element carrying the string, not a wrapper
          el = hits.reduce((a, b) => (depthOf(b) >= depthOf(a || b) ? b : a), null);
        }
      } catch { el = null; }
      if (el) {
        used = s.t === 'css' ? 'css:' + s.sel
          : s.t === 'within' ? 'within:' + s.of + '>' + s.sel
          : s.t === 'layout' ? 'layout:' + s.kind
          : 'text:' + s.re;
        break;
      }
    }
    RESOLVED[probe.name] = el;
    landmarks[probe.name] = el ? describe(el, probe.name, used) : null;
    probeLog.push({ name: probe.name, strategy: used });
  }

  /* pruned DOM skeleton ------------------------------------------------------ */
  const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'PATH', 'G', 'CIRCLE', 'RECT', 'LINE', 'POLYGON', 'POLYLINE', 'ELLIPSE', 'DEFS', 'USE', 'BR']);
  const skipTag = (el) => SKIP.has(String(el.tagName || '').toUpperCase()) || el.namespaceURI === 'http://www.w3.org/2000/svg';
  // Depth counts only kept levels — signal-free single-child wrappers collapse
  // without spending one. Linear's shell still forks 5-6 times before content
  // (app > provider > nav|content split > panes > header/list), so 6 kept levels
  // starves the skeleton at 14 nodes; 12 reaches rows/panes, node cap bounds size.
  const MAX_DEPTH = 12;
  const MAX_NODES = 900;
  let nodes = 0;
  let truncated = false;
  const walk = (el, depth) => {
    if (!el || el.nodeType !== 1 || skipTag(el)) return null;
    if (nodes >= MAX_NODES) { truncated = true; return null; }
    const role = el.getAttribute('role');
    const aria = el.getAttribute('aria-label');
    const text = ownText(el);
    const signal = role || aria || text;
    const elementKids = [...el.children].filter((c) => !skipTag(c));
    // A signal-free single-child wrapper carries no structure: collapse it WITHOUT
    // spending a depth level. Linear's app root is a dozen nested provider divs —
    // counting them is why a depth-6 walk used to stop before the content.
    if (!signal && elementKids.length === 1) return walk(elementKids[0], depth);
    if (depth > MAX_DEPTH) { truncated = true; return null; }
    const kids = [];
    for (const ch of el.children) {
      const n = walk(ch, depth + 1);
      if (n) kids.push(n);
    }
    const r = el.getBoundingClientRect();
    const hasBox = r.width >= 1 && r.height >= 1;
    if (!signal && !kids.length) return null;         // invisible, signal-free leaf
    if (!hasBox && !signal && kids.length <= 1) return kids[0] || null;
    nodes += 1;
    const out = { t: el.tagName.toLowerCase() };
    if (role) out.r = role;
    if (aria) out.a = norm(aria).slice(0, 60);
    if (text) out.x = text.slice(0, 60);
    const cls = (el.className || '').toString().trim();
    if (cls) out.c = cls.slice(0, 40);
    out.k = el.childElementCount;
    out.b = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    if (kids.length) out.ch = kids;
    return out;
  };
  const tree = walk(document.body, 0);

  /* user-visible text -------------------------------------------------------- */
  const text = [];
  const seen = new Set();
  const push = (s) => {
    const v = norm(s);
    if (v && v.length >= 1 && !seen.has(v)) { seen.add(v); text.push(v.slice(0, 200)); }
  };
  for (const el of qs(document, 'body *')) {
    if (text.length > 3000) break;
    if (!visible(el)) continue;
    push(ownText(el));
    push(el.getAttribute('placeholder'));
    push(el.getAttribute('alt'));
    if (el.tagName === 'INPUT' && el.value && el.type !== 'password') push(el.value);
    const aria = el.getAttribute('aria-label');
    if (aria && /button|link|tab|menuitem|option/i.test(el.getAttribute('role') || el.tagName)) push(aria);
  }

  return {
    meta: {
      url: location.href,
      title: document.title,
      capturedAt: new Date().toISOString(),
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    },
    landmarks,
    probeLog,
    tree,
    treeMeta: { maxDepth: MAX_DEPTH, nodes, truncated },
    text,
  };
})()`;

/* ---------------------------------------------------------------------------
 * Target resolution + click helpers (in-page snippets evaluated before capture)
 * ------------------------------------------------------------------------- */
const RESOLVE_TARGET = (target) => `
(() => {
  const spec = ${JSON.stringify(target)};
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const visible = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    let p = el;
    while (p && p.nodeType === 1) {
      const cs = getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
      p = p.parentElement;
    }
    return true;
  };
  let el = null;
  let m = spec.match(/^(css|text|aria|re):(.*?)$/s);
  const kind = m ? m[1] : 'css';
  const val = m ? m[2] : spec;
  if (kind === 'css') {
    el = [...document.querySelectorAll(val)].find(visible) || null;
  } else if (kind === 'text') {
    const els = [...document.querySelectorAll('a, button, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], span, div')].filter(visible);
    const exact = els.filter((e) => norm(e.textContent) === val);
    const pre = els.filter((e) => norm(e.textContent).startsWith(val));
    const pool = exact.length ? exact : pre;
    // smallest interactive ancestor-or-self wins: "Add filter" the button, not its tooltip div
    pool.sort((a, b) => {
      const ia = a.closest('a,button,[role="button"],[role="menuitem"],[role="tab"],[role="option"],[role="link"]');
      const ib = b.closest('a,button,[role="button"],[role="menuitem"],[role="tab"],[role="option"],[role="link"]');
      const ra = (ia || a).getBoundingClientRect(), rb = (ib || b).getBoundingClientRect();
      return ra.width * ra.height - rb.width * rb.height;
    });
    const pick = pool[0];
    el = pick ? (pick.closest('a,button,[role="button"],[role="menuitem"],[role="tab"],[role="option"],[role="link"]') || pick) : null;
  } else if (kind === 'aria') {
    el = [...document.querySelectorAll('[aria-label]')].find((e) => visible(e) && e.getAttribute('aria-label') === val)
      || [...document.querySelectorAll('[aria-label]')].find((e) => visible(e) && (e.getAttribute('aria-label') || '').startsWith(val))
      || null;
  } else if (kind === 're') {
    const re = new RegExp(val, 'i');
    el = [...document.querySelectorAll('a, button, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"]')]
      .find((e) => visible(e) && re.test(norm(e.textContent) + ' ' + (e.getAttribute('aria-label') || ''))) || null;
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height,
           tag: el.tagName, text: norm(el.textContent).slice(0, 60), href: el.getAttribute('href') };
})()`;

const KEY_DEFS = {
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
};

const main = async () => {
  const WebSocket = require('ws');
  const targets = await getJson('/json/list');
  const pages = targets.filter(
    (t) =>
      t.type === 'page' && t.webSocketDebuggerUrl && !/^(?:devtools|chrome-extension)/.test(t.url),
  );

  if (process.argv.includes('--list')) {
    process.stdout.write(
      `${JSON.stringify(
        pages.map((t) => ({ id: t.id, title: t.title, url: t.url })),
        null,
        2,
      )}\n`,
    );
    clearTimeout(watchdog);
    return;
  }

  let page;
  if (WANT_NEW || pages.length === 0) {
    page = await getJson('/json/new?about:blank', 'PUT');
  } else if (TARGET_ID) {
    page = pages.find((t) => t.id === TARGET_ID);
  } else if (MATCH) {
    page = pages.find((t) => t.url.includes(MATCH));
  } else {
    page = pages[0];
  }
  if (!page) {
    const have = pages.map((t) => `${t.id}:${t.url}`).join(', ') || 'none';
    throw new Error(`no page target on :${PORT} (have: ${have})`);
  }
  process.stderr.write(`target: ${page.id} ${page.url}\n`);

  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  let nextId = 0;
  const pending = new Map();
  const inflight = new Set(); // Network.requestWillBeSent ids still open
  let loadFired;
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
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === 'Network.requestWillBeSent') {
      inflight.add(msg.params.requestId);
    } else if (msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed') {
      inflight.delete(msg.params.requestId);
    } else if (msg.method === 'Page.loadEventFired') {
      loadFired = true;
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        const error = new Error(
          `${method} got no response in ${CALL_TIMEOUT}ms — wedged renderer, not slowness.`,
        );
        error.code = 'CALL_TIMEOUT';
        reject(error);
      }, CALL_TIMEOUT);
      pending.set(id, {
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');

  const evaluate = async (expression, awaitPromise = false) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(`page threw: ${d.text} ${d.exception?.description || ''}`.slice(0, 400));
    }
    return res.result?.value;
  };

  // DOM signature for stability polling: element count + text mass + URL. React
  // settles when these stop moving for three consecutive polls and the network
  // has been idle for the whole window.
  const signature = () =>
    evaluate(
      `JSON.stringify({r:document.readyState,n:document.querySelectorAll('*').length,t:(document.body&&document.body.innerText||'').length,u:location.href})`,
    );

  const settle = async (label) => {
    const started = Date.now();
    let last = null;
    let stable = 0;
    let polls = 0;
    const minWait = 700;
    while (Date.now() - started < SETTLE_TIMEOUT) {
      await new Promise((r) => setTimeout(r, 450));
      polls += 1;
      let sig;
      try {
        sig = await signature();
      } catch {
        sig = null;
      }
      const idle = inflight.size === 0;
      if (sig && sig === last && idle) stable += 1;
      else stable = 0;
      last = sig;
      if (Date.now() - started >= minWait && stable >= 2) break;
    }
    const ms = Date.now() - started;
    process.stderr.write(`settle(${label}): ${ms}ms, polls=${polls}, inflight=${inflight.size}\n`);
    return { ms, polls, inflightLeft: inflight.size };
  };

  if (VIEWPORT) {
    const [w, h] = VIEWPORT.split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await new Promise((r) => setTimeout(r, 400));
  }

  let settleInfo;
  let navHref = null;

  if (URL_TO) {
    loadFired = false;
    inflight.clear();
    await send('Page.navigate', { url: URL_TO });
    // bounded wait for the load event, then the stability poll does the rest
    const t0 = Date.now();
    while (!loadFired && Date.now() - t0 < 12000) await new Promise((r) => setTimeout(r, 200));
    settleInfo = await settle('navigate');
  } else if (NAV) {
    const before = await evaluate('location.href');
    const box = await evaluate(RESOLVE_TARGET(NAV));
    if (!box) throw new Error(`--nav target not hittable: ${NAV}`);
    navHref = box.href || null;
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', {
        type,
        x: Math.round(box.x),
        y: Math.round(box.y),
        button: 'left',
        clickCount: type === 'mouseMoved' ? 0 : 1,
      });
    }
    settleInfo = await settle('nav');
    const after = await evaluate('location.href');
    if (after === before) {
      process.stderr.write(`WARN: --nav click on ${NAV} did not change the URL (${before})\n`);
    }
  } else {
    settleInfo = await settle('current');
  }

  for (const c of CLICKS) {
    const box = await evaluate(RESOLVE_TARGET(c));
    if (!box) {
      process.stderr.write(`WARN: --click target not found: ${c} (skipping)\n`);
      continue;
    }
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', {
        type,
        x: Math.round(box.x),
        y: Math.round(box.y),
        button: 'left',
        clickCount: type === 'mouseMoved' ? 0 : 1,
      });
    }
    await new Promise((r) => setTimeout(r, 700));
    await settle(`click:${c}`);
    process.stderr.write(`clicked ${c} -> ${box.tag} "${box.text}"\n`);
  }

  for (const k of KEYS) {
    const def = KEY_DEFS[k];
    if (!def) {
      process.stderr.write(`WARN: unknown --key ${k}\n`);
      continue;
    }
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...def });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...def });
    await new Promise((r) => setTimeout(r, 500));
  }

  const probes = PROBES_FILE ? JSON.parse(fs.readFileSync(PROBES_FILE, 'utf8')) : DEFAULT_PROBES;

  const spec = await evaluate(buildCaptureScript(probes, STYLE_WHITELIST));
  spec.meta.tag = TAG || null;
  spec.meta.navigatedVia = URL_TO ? 'url' : NAV ? 'nav' : 'current';
  spec.meta.navHref = navHref;
  spec.meta.clicks = CLICKS;
  spec.meta.settle = settleInfo;

  if (OUT) {
    fs.mkdirSync(require('node:path').dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(spec, null, 2));
  } else {
    process.stdout.write(`${JSON.stringify(spec, null, 2)}\n`);
  }

  const resolved = spec.probeLog.filter((p) => p.strategy).map((p) => p.name);
  const unresolved = spec.probeLog.filter((p) => !p.strategy).map((p) => p.name);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      out: OUT || null,
      url: spec.meta.url,
      probes: spec.probeLog.length,
      resolved: resolved.length,
      unresolved,
      treeNodes: spec.treeMeta.nodes,
      texts: spec.text.length,
    })}\n`,
  );
  ws.close();
  clearTimeout(watchdog);
};

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      fail(error.message);
      process.exit(error.code === 'CALL_TIMEOUT' ? 124 : 1);
    });
}

module.exports = { buildCaptureScript, DEFAULT_PROBES, STYLE_WHITELIST };

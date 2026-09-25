#!/usr/bin/env node
/**
 * dom-spec-diff.cjs — diff one reference dom-spec JSON against one candidate
 * dom-spec JSON (or a whole directory pair) and report the parity gap.
 *
 * Consumes the spec shape written by dom-spec-capture.cjs:
 *   { meta, landmarks: {name: lm|null}, probeLog, tree, treeMeta, text: [] }
 *
 * What it reports, per page pair:
 *   * landmarks     — matched / missing-in-candidate / extra / absent-both,
 *                     plus the strategy each side resolved (a layout fallback on
 *                     the candidate where the reference used a semantic selector
 *                     is a signal, not noise)
 *   * styleDeltas   — per-landmark computed-style differences beyond tolerance:
 *                     px compared at ±1px, colors normalised rgb(a)→hex, font
 *                     weights normalised (normal↔400), font stacks compared on
 *                     first concrete family with generic-family equivalence
 *   * geometryDeltas— rect x/y/w/h differences beyond ±1px per matched landmark
 *   * structural    — skeleton (tree) comparison: node counts, tag/role count
 *                     deltas, and labelled/landmark subtrees present on one side
 *                     only ("missing sections")
 *   * textDeltas    — deduped visible-text set diff. Candidate copy is
 *                     intentionally zh where the reference is en: every
 *                     unmatched string is classified `copy` (expected) unless it
 *                     is a non-language token (issue key, count, date, url),
 *                     which is classified `data` — those may be missing content.
 *
 * Nothing here is a verdict. A row is a question to resolve against the page,
 * not a proven defect — same contract as parity-diff.cjs, but the pairing key
 * here is the landmark probe + skeleton, not raw text.
 *
 * Usage:
 *   node dom-spec-diff.cjs --reference ref.json --candidate cand.json \
 *        [--out pair.diff.json] [--md pair.diff.md]
 *   node dom-spec-diff.cjs --ref-dir docs/.../dom-specs --cand-dir runtime-acceptance/dom-specs-candidate \
 *        --out-dir runtime-acceptance/dom-diff-2026-09-23
 */
const fs = require('node:fs');
const path = require('node:path');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

/* ── tolerances ─────────────────────────────────────────────────────────── */
const PX_TOLERANCE = 1; // ±1px is rendering noise, not a spec violation
const ROUND = (n) => Math.round(n * 100) / 100;

// Generic-family equivalence for font stacks: if both stacks terminate in the
// same generic family and only the concrete first family differs, that is the
// expected CJK/localization fallback on the candidate — report as `font-stack`
// (info), not `style`. A generic-family change (sans→mono) stays `style`.
const GENERIC_FAMILIES = new Set([
  'sans-serif',
  'serif',
  'monospace',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'cursive',
  'fantasy',
  '-apple-system',
  'segoe ui',
]);

const splitStack = (ff) =>
  String(ff || '')
    .split(',')
    .map((f) =>
      f
        .trim()
        .replaceAll(/^["']|["']$/g, '')
        .toLowerCase(),
    )
    .filter(Boolean);

const fontFamilyDelta = (ref, cand) => {
  const r = splitStack(ref);
  const c = splitStack(cand);
  if (!r.length && !c.length) return null;
  if (r.join('|') === c.join('|')) return null;
  const rGeneric = [...r].reverse().find((f) => GENERIC_FAMILIES.has(f)) || null;
  const cGeneric = [...c].reverse().find((f) => GENERIC_FAMILIES.has(f)) || null;
  const sameFirst = r[0] === c[0];
  return {
    ref,
    cand,
    sameFirstFamily: sameFirst,
    sameGeneric: rGeneric === cGeneric,
    // both stacks land on the same generic family → localization fallback tier
    severity: sameFirst ? 'equal' : rGeneric === cGeneric ? 'font-stack' : 'style',
  };
};

const rgbToHex = (v) => {
  const m = String(v).match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i,
  );
  if (!m) return null;
  const hex = (n) => Math.round(Number(n)).toString(16).padStart(2, '0');
  const a =
    m[4] === undefined
      ? null
      : Math.round(Number(m[4]) * 255)
          .toString(16)
          .padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}${a ?? ''}`.toUpperCase();
};

// lch()/oklch() → sRGB hex. Linear's stylesheet is built on lch(); without this
// every colour reads as a diff even when it is identical. LCH is CIELAB (D50),
// oklch is OKLab (D65) — different white points, different matrices.
const D50 = { x: 0.9642956764295677, y: 1, z: 0.8251046025104602 };
const D65 = { x: 0.9504559270516716, y: 1, z: 1.0890577507598784 };

const labToXyz = (L, a, b, white) => {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const f = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  return {
    x: f(fx) * white.x,
    y: L > 8 ? ((L + 16) / 116) ** 3 * white.y : (L / 903.3) * white.y,
    z: f(fz) * white.z,
  };
};

// Bradford-adapted XYZ→linear sRGB (matrices pre-multiplied for each white point).
const xyzToSrgbLinear = (x, y, z, white) => {
  if (white === D50) {
    // D50-adapted sRGB matrix
    return {
      r: 3.1338561 * x - 1.6168667 * y - 0.4906146 * z,
      g: -0.9787684 * x + 1.9161415 * y + 0.033454 * z,
      b: 0.0719453 * x - 0.2289914 * y + 1.4052427 * z,
    };
  }
  return {
    r: 3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    g: -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    b: 0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  };
};

const gamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const toHex8 = (r, g, b, a) => {
  const h = (v) =>
    Math.max(0, Math.min(255, Math.round(gamma(v) * 255)))
      .toString(16)
      .padStart(2, '0');
  const ah =
    a === null
      ? ''
      : Math.max(0, Math.min(255, Math.round(a * 255)))
          .toString(16)
          .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}${ah}`.toUpperCase();
};

const lchToHex = (v) => {
  const m = String(v).match(
    /lch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)/i,
  );
  if (!m) return null;
  const L = m[1].endsWith('%') ? Number(m[1]) : Number(m[1]); // lch L is already 0-100
  const C = Number(m[2]);
  const H = (Number(m[3]) * Math.PI) / 180;
  const alpha = m[4] === undefined ? null : m[4].endsWith('%') ? Number(m[4]) / 100 : Number(m[4]);
  const lab = { L, a: C * Math.cos(H), b: C * Math.sin(H) };
  const xyz = labToXyz(lab.L, lab.a, lab.b, D50);
  const { r, g, b } = xyzToSrgbLinear(xyz.x, xyz.y, xyz.z, D50);
  return toHex8(r, g, b, alpha);
};

const oklchToHex = (v) => {
  const m = String(v).match(
    /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)/i,
  );
  if (!m) return null;
  const L = m[1].endsWith('%') ? Number(m[1]) / 100 : Number(m[1]);
  const C = Number(m[2]);
  const H = (Number(m[3]) * Math.PI) / 180;
  const alpha = m[4] === undefined ? null : m[4].endsWith('%') ? Number(m[4]) / 100 : Number(m[4]);
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  // OKLab → LMS → XYZ(D65)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const mm = m_ ** 3;
  const s = s_ ** 3;
  const x = 1.2270138511 * l - 0.5577999807 * mm + 0.281256149 * s;
  const y = -0.0405801784 * l + 1.1122568696 * mm - 0.0716766787 * s;
  const z = -0.0763812845 * l - 0.4214819784 * mm + 1.5861632204 * s;
  const { r, g, b: bb } = xyzToSrgbLinear(x, y, z, D65);
  return toHex8(r, g, bb, alpha);
};

const anyToHex = (v) => rgbToHex(v) || lchToHex(v) || oklchToHex(v);

const normColor = (v) => anyToHex(v) || String(v).toLowerCase().replaceAll(/\s+/g, '');

// Normalise a style value for comparison: embed colour normalisation into
// strings that carry colours (boxShadow, border shorthand, background).
const normValue = (prop, v) => {
  if (v === undefined || v === null) return null;
  let s = String(v).trim();
  if (/weight/i.test(prop)) {
    if (s === 'normal') return '400';
    if (s === 'bold') return '700';
    return s;
  }
  s = s.replaceAll(/(?:rgba?|lch|oklch)\([^)]*\)/gi, (m) => anyToHex(m) || m);
  if (/color/i.test(prop) || prop === 'background') return s;
  return s.replaceAll(/\s+/g, ' ');
};

const isPx = (v) => /^-?[\d.]+px$/.test(String(v).trim());
const pxNum = (v) => Number(String(v).trim().slice(0, -2));

// Per-prop comparison. Returns {severity:'equal'|'noise'|'font-stack'|'style', ref, cand, note?}
const compareStyleProp = (prop, refV, candV) => {
  if (prop === 'fontFamily') {
    const d = fontFamilyDelta(refV, candV);
    return d ? { severity: d.severity, ref: refV, cand: candV } : { severity: 'equal' };
  }
  const r = normValue(prop, refV);
  const c = normValue(prop, candV);
  if (r === c) return { severity: 'equal' };
  if (r === null || c === null) {
    // missing on one side: report only if the other carries a meaningful value
    const present = r ?? c;
    if (present === 'none' || present === 'normal' || present === 'auto' || present === '0px') {
      return { severity: 'equal' };
    }
    return { severity: 'style', ref: r ?? '—', cand: c ?? '—', note: 'present-one-side' };
  }
  if (isPx(refV) && isPx(candV)) {
    const delta = Math.abs(pxNum(refV) - pxNum(candV));
    if (delta <= PX_TOLERANCE) return { severity: 'noise', ref: r, cand: c, delta: ROUND(delta) };
    return { severity: 'style', ref: r, cand: c, delta: ROUND(delta) };
  }
  if (/color|background|shadow/i.test(prop)) {
    return { severity: 'style', ref: r, cand: c, kind: 'color' };
  }
  return { severity: 'style', ref: r, cand: c };
};

const compareRect = (refR, candR) => {
  if (!refR || !candR) return null;
  const keys = ['x', 'y', 'w', 'h'];
  const deltas = {};
  let worst = 0;
  for (const k of keys) {
    const d = Math.abs((refR[k] ?? 0) - (candR[k] ?? 0));
    if (d > PX_TOLERANCE)
      deltas[k] = { ref: refR[k], cand: candR[k], delta: ROUND(candR[k] - refR[k]) };
    worst = Math.max(worst, d);
  }
  return Object.keys(deltas).length ? { deltas, worstDelta: ROUND(worst) } : null;
};

/* ── tree (skeleton) comparison ─────────────────────────────────────────── */
const walkTree = (node, fn, depth = 0, parent = null) => {
  if (!node) return;
  fn(node, depth, parent);
  for (const ch of node.ch || []) walkTree(ch, fn, depth + 1, node);
};

const treeStats = (tree) => {
  const byTag = new Map();
  const byRole = new Map();
  const labelled = []; // nodes carrying role/aria — candidate section identities
  let nodes = 0;
  let maxDepth = 0;
  walkTree(tree, (n, depth) => {
    nodes += 1;
    maxDepth = Math.max(maxDepth, depth);
    byTag.set(n.t, (byTag.get(n.t) || 0) + 1);
    if (n.r) {
      byRole.set(n.r, (byRole.get(n.r) || 0) + 1);
      labelled.push({ role: n.r, aria: n.a || null, tag: n.t, text: n.x || null, depth });
    } else if (n.a) {
      labelled.push({ role: null, aria: n.a, tag: n.t, text: n.x || null, depth });
    }
  });
  return { nodes, maxDepth, byTag, byRole, labelled };
};

// Two labelled nodes "match" when role+aria agree, or when the aria label is
// absent on both but role+own-text agree. Text is compared loosely because the
// candidate is zh — a role match alone still counts for presence; the `copy`
// class covers wording.
const labelledMatch = (a, b) => {
  if (a.role !== b.role) return false;
  if (a.aria && b.aria) return a.aria === b.aria;
  return true;
};

const diffMaps = (a, b) => {
  const keys = new Set([...a.keys(), ...b.keys()]);
  const out = [];
  for (const k of keys) {
    const ra = a.get(k) || 0;
    const cb = b.get(k) || 0;
    if (ra !== cb) out.push({ key: k, reference: ra, candidate: cb, delta: cb - ra });
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
};

/* ── text comparison ────────────────────────────────────────────────────── */
const ISSUE_KEY = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/;
const DATA_TOKEN = /^[\d\s.,%/:×x+-]+$|\b\d{4}-\d{2}-\d{2}\b|^\d+(?:\.\d+)?(?:px|%|ms|fps)?$/i;
const URLISH = /^(?:https?|app):\/\//i;

const classifyText = (s) => {
  if (URLISH.test(s)) return 'data';
  if (ISSUE_KEY.test(s)) return 'data';
  if (DATA_TOKEN.test(s.trim())) return 'data';
  return 'copy';
};

const diffTexts = (refTexts, candTexts) => {
  const refSet = new Set(refTexts);
  const candSet = new Set(candTexts);
  const refOnly = refTexts.filter((t) => !candSet.has(t));
  const candOnly = candTexts.filter((t) => !refSet.has(t));
  const bucket = (arr) => {
    const copy = [];
    const data = [];
    for (const t of arr) (classifyText(t) === 'copy' ? copy : data).push(t);
    return { copy, data };
  };
  return {
    refOnly: bucket(refOnly),
    candOnly: bucket(candOnly),
    shared: refTexts.length - refOnly.length,
  };
};

/* ── pair diff ──────────────────────────────────────────────────────────── */
const diffPair = (ref, cand, name) => {
  const lmNames = new Set([
    ...Object.keys(ref.landmarks || {}),
    ...Object.keys(cand.landmarks || {}),
  ]);
  const landmarks = {};
  const styleDeltas = [];
  const geometryDeltas = [];
  let matched = 0;
  let missing = 0;
  let extra = 0;

  for (const lm of lmNames) {
    const r = (ref.landmarks || {})[lm];
    const c = (cand.landmarks || {})[lm];
    const status =
      r && c ? 'matched' : r ? 'missing-in-candidate' : c ? 'extra-in-candidate' : 'absent-both';
    const entry = {
      status,
      refStrategy: r?.strategy ?? null,
      candStrategy: c?.strategy ?? null,
      refTag: r?.tag ?? null,
      candTag: c?.tag ?? null,
    };
    if (status === 'matched') {
      matched += 1;
      if (r.strategy?.startsWith('css') && c.strategy?.startsWith('layout')) {
        entry.strategyNote = 'candidate fell back to layout heuristic (semantic selector absent)';
      }
      const props = new Set([...Object.keys(r.style || {}), ...Object.keys(c.style || {})]);
      const deltas = {};
      for (const p of props) {
        const d = compareStyleProp(p, r.style?.[p], c.style?.[p]);
        if (d.severity !== 'equal') deltas[p] = d;
      }
      const meaningful = Object.entries(deltas).filter(([, d]) => d.severity === 'style');
      if (Object.keys(deltas).length) {
        styleDeltas.push({ landmark: lm, deltas, meaningfulCount: meaningful.length });
      }
      const geo = compareRect(r.rect, c.rect);
      if (geo) geometryDeltas.push({ landmark: lm, ...geo });
      entry.styleDeltaCount = meaningful.length;
    } else if (status === 'missing-in-candidate') {
      missing += 1;
      entry.refText = r.text?.slice(0, 60) ?? null;
    } else if (status === 'extra-in-candidate') {
      extra += 1;
      entry.candText = c.text?.slice(0, 60) ?? null;
    }
    landmarks[lm] = entry;
  }

  const rs = treeStats(ref.tree);
  const cs = treeStats(cand.tree);
  const refLabelled = rs.labelled;
  const usedCand = new Set();
  const missingSections = [];
  for (const rl of refLabelled) {
    const idx = cs.labelled.findIndex((cl, i) => !usedCand.has(i) && labelledMatch(rl, cl));
    if (idx === -1) missingSections.push(rl);
    else usedCand.add(idx);
  }
  const extraSections = cs.labelled.filter((_, i) => !usedCand.has(i));

  const textDeltas = diffTexts(ref.text || [], cand.text || []);

  const structural = {
    nodes: { reference: rs.nodes, candidate: cs.nodes, delta: cs.nodes - rs.nodes },
    truncated: {
      reference: ref.treeMeta?.truncated ?? null,
      candidate: cand.treeMeta?.truncated ?? null,
    },
    tagCountDeltas: diffMaps(rs.byTag, cs.byTag).slice(0, 15),
    roleCountDeltas: diffMaps(rs.byRole, cs.byRole).slice(0, 15),
    missingSections: missingSections.slice(0, 25),
    extraSections: extraSections.slice(0, 25),
  };

  // Divergence score for cross-page ranking. Copy diffs score 0 — expected zh↔en.
  const styleCount = styleDeltas.reduce((a, s) => a + s.meaningfulCount, 0);
  const geoCount = geometryDeltas.length;
  const dataMissing = textDeltas.refOnly.data.length;
  const score =
    missing * 4 + styleCount * 2 + geoCount * 1 + missingSections.length * 2 + dataMissing * 1;

  return {
    pair: name,
    generatedAt: new Date().toISOString(),
    reference: {
      url: ref.meta?.url,
      title: ref.meta?.title,
      viewport: ref.meta?.viewport,
      capturedAt: ref.meta?.capturedAt,
    },
    candidate: {
      url: cand.meta?.url,
      title: cand.meta?.title,
      viewport: cand.meta?.viewport,
      capturedAt: cand.meta?.capturedAt,
    },
    viewportMatch:
      ref.meta?.viewport?.w === cand.meta?.viewport?.w &&
      ref.meta?.viewport?.h === cand.meta?.viewport?.h,
    dprMatch: ref.meta?.viewport?.dpr === cand.meta?.viewport?.dpr,
    landmarkSummary: { matched, missingInCandidate: missing, extraInCandidate: extra },
    landmarks,
    styleDeltas,
    geometryDeltas,
    structural,
    text: {
      shared: textDeltas.shared,
      refOnlyCopy: textDeltas.refOnly.copy.slice(0, 60),
      candOnlyCopy: textDeltas.candOnly.copy.slice(0, 60),
      refOnlyData: textDeltas.refOnly.data,
      candOnlyData: textDeltas.candOnly.data,
      counts: {
        refOnlyCopy: textDeltas.refOnly.copy.length,
        candOnlyCopy: textDeltas.candOnly.copy.length,
        refOnlyData: textDeltas.refOnly.data.length,
        candOnlyData: textDeltas.candOnly.data.length,
      },
    },
    divergenceScore: score,
  };
};

/* ── markdown rendering ─────────────────────────────────────────────────── */
const md = (d) => {
  const L = [];
  const w = (s = '') => L.push(s);
  w(`# DOM-spec diff — ${d.pair}`);
  w();
  w(
    `- reference: ${d.reference.url} (${d.reference.viewport?.w}×${d.reference.viewport?.h}@dpr${d.reference.viewport?.dpr})`,
  );
  w(
    `- candidate: ${d.candidate.url} (${d.candidate.viewport?.w}×${d.candidate.viewport?.h}@dpr${d.candidate.viewport?.dpr})`,
  );
  w(`- divergence score: **${d.divergenceScore}** — observations, not verdicts`);
  if (!d.viewportMatch) w(`- ⚠️ viewport mismatch — geometry rows below may be layout artefacts`);
  w();
  w(
    `## Landmarks — matched ${d.landmarkSummary.matched} · missing ${d.landmarkSummary.missingInCandidate} · extra ${d.landmarkSummary.extraInCandidate}`,
  );
  w();
  w('| landmark | status | ref strategy | cand strategy | styleΔ |');
  w('|---|---|---|---|---|');
  for (const [name, e] of Object.entries(d.landmarks)) {
    w(
      `| ${name} | ${e.status} | ${e.refStrategy ?? '—'} | ${e.candStrategy ?? '—'} | ${e.styleDeltaCount ?? '—'} |`,
    );
    if (e.strategyNote) w(`| ↳ | | | ${e.strategyNote} | |`);
  }
  w();
  const sd = d.styleDeltas.filter((s) => s.meaningfulCount > 0);
  if (sd.length) {
    w(`## Style deltas (beyond ±1px / normalisation)`);
    w();
    for (const s of sd) {
      w(`### ${s.landmark}`);
      w('| prop | reference | candidate | note |');
      w('|---|---|---|---|');
      for (const [prop, v] of Object.entries(s.deltas)) {
        if (v.severity === 'noise') continue;
        const note = v.severity === 'font-stack' ? 'font-stack (generic-equivalent)' : v.note || '';
        w(`| ${prop} | ${v.ref} | ${v.cand} | ${note} |`);
      }
      const noise = Object.entries(s.deltas).filter(([, v]) => v.severity === 'noise');
      if (noise.length) {
        w();
        w(
          `<sub>within-tolerance: ${noise.map(([p, v]) => `${p} ${v.ref}→${v.cand}`).join(', ')}</sub>`,
        );
      }
      w();
    }
  }
  if (d.geometryDeltas.length) {
    w(`## Geometry deltas (>±${PX_TOLERANCE}px)`);
    w();
    w('| landmark | ref rect | cand rect | deltas |');
    w('|---|---|---|---|');
    for (const g of d.geometryDeltas) {
      w(
        `| ${g.landmark} | — | — | ${Object.entries(g.deltas)
          .map(([k, v]) => `${k}: ${v.ref}→${v.cand}`)
          .join(', ')} |`,
      );
    }
    w();
  }
  w(`## Structure`);
  w();
  w(
    `- nodes: ref ${d.structural.nodes.reference} vs cand ${d.structural.nodes.candidate} (Δ${d.structural.nodes.delta})`,
  );
  if (d.structural.roleCountDeltas.length) {
    w(
      `- role count deltas: ${d.structural.roleCountDeltas.map((r) => `${r.key} ${r.reference}→${r.candidate}`).join(', ')}`,
    );
  }
  if (d.structural.missingSections.length) {
    w(`- sections in reference with no candidate counterpart:`);
    for (const s of d.structural.missingSections.slice(0, 10)) {
      w(
        `  - ${s.role ?? 'aria'} ${s.aria ? `"${s.aria}"` : ''} ${s.text ? `— "${s.text.slice(0, 50)}"` : ''}`,
      );
    }
  }
  if (d.structural.extraSections.length) {
    w(`- sections in candidate with no reference counterpart:`);
    for (const s of d.structural.extraSections.slice(0, 10)) {
      w(
        `  - ${s.role ?? 'aria'} ${s.aria ? `"${s.aria}"` : ''} ${s.text ? `— "${s.text.slice(0, 50)}"` : ''}`,
      );
    }
  }
  w();
  w(`## Text`);
  w();
  w(
    `- shared strings: ${d.text.shared}; ref-only ${d.text.counts.refOnlyCopy} copy + ${d.text.counts.refOnlyData} data; cand-only ${d.text.counts.candOnlyCopy} copy + ${d.text.counts.candOnlyData} data`,
  );
  if (d.text.refOnlyData.length) {
    w(`- ⚠️ data tokens only in reference (possible missing content):`);
    for (const t of d.text.refOnlyData.slice(0, 15)) w(`  - \`${t}\``);
  }
  if (d.text.candOnlyData.length) {
    w(`- data tokens only in candidate:`);
    for (const t of d.text.candOnlyData.slice(0, 15)) w(`  - \`${t}\``);
  }
  w(
    `- copy diffs are expected (en reference ↔ zh candidate) and classified \`copy\`, not failures.`,
  );
  w();
  return L.join('\n');
};

/* ── io ─────────────────────────────────────────────────────────────────── */
const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const REF = arg('reference', '');
const CAND = arg('candidate', '');
const REF_DIR = arg('ref-dir', '');
const CAND_DIR = arg('cand-dir', '');
const OUT_DIR = arg('out-dir', '');
const OUT = arg('out', '');
const MD = arg('md', '');

const main = () => {
  if (REF_DIR && CAND_DIR) {
    const outDir =
      OUT_DIR || `runtime-acceptance/dom-diff-${new Date().toISOString().slice(0, 10)}`;
    fs.mkdirSync(outDir, { recursive: true });
    const refFiles = fs.readdirSync(REF_DIR).filter((f) => f.endsWith('.json'));
    const rows = [];
    const missingCand = [];
    for (const f of refFiles) {
      const name = f.replace(/\.json$/, '');
      const candPath = path.join(CAND_DIR, f);
      if (!fs.existsSync(candPath)) {
        missingCand.push(name);
        continue;
      }
      const d = diffPair(load(path.join(REF_DIR, f)), load(candPath), name);
      fs.writeFileSync(path.join(outDir, `${name}.diff.json`), JSON.stringify(d, null, 2));
      fs.writeFileSync(path.join(outDir, `${name}.diff.md`), md(d));
      rows.push({
        name,
        score: d.divergenceScore,
        summary: d.landmarkSummary,
        styleDeltaCount: d.styleDeltas.reduce((a, s) => a + s.meaningfulCount, 0),
        missingSections: d.structural.missingSections.length,
        dataMissing: d.text.counts.refOnlyData,
      });
    }
    rows.sort((a, b) => b.score - a.score);
    const readme = [
      `# DOM-spec diff matrix — ${new Date().toISOString().slice(0, 19)}Z`,
      '',
      `reference dir: \`${REF_DIR}\``,
      `candidate dir: \`${CAND_DIR}\``,
      '',
      'Pages ranked by divergence score (missing landmarks ×4 + style deltas ×2 + missing sections ×2 + geometry ×1 + missing data tokens ×1). Copy (en↔zh) is classified `copy` and scores 0.',
      '',
      '| rank | page | score | landmarks matched/missing/extra | styleΔ | missing sections | data-only-in-ref |',
      '|---|---|---|---|---|---|---|',
      ...rows.map(
        (r, i) =>
          `| ${i + 1} | ${r.name} | ${r.score} | ${r.summary.matched}/${r.summary.missingInCandidate}/${r.summary.extraInCandidate} | ${r.styleDeltaCount} | ${r.missingSections} | ${r.dataMissing} |`,
      ),
      '',
      missingCand.length
        ? `Candidate specs missing for: ${missingCand.join(', ')}`
        : 'All reference specs had a candidate counterpart.',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'README.md'), readme);
    fs.writeFileSync(
      path.join(outDir, 'summary.json'),
      JSON.stringify({ rows, missingCand }, null, 2),
    );
    process.stdout.write(readme + '\n');
    return;
  }
  if (!REF || !CAND) {
    process.stderr.write(
      'usage: dom-spec-diff.cjs --reference R.json --candidate C.json [--out d.json] [--md d.md]\n' +
        '   or: dom-spec-diff.cjs --ref-dir DIR --cand-dir DIR --out-dir DIR\n',
    );
    process.exit(2);
  }
  const d = diffPair(load(REF), load(CAND), path.basename(REF, '.json'));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(d, null, 2));
  if (MD) fs.writeFileSync(MD, md(d));
  if (!OUT && !MD) process.stdout.write(`${md(d)}\n`);
  else process.stdout.write(`{"ok":true,"score":${d.divergenceScore}}\n`);
};

if (require.main === module) {
  main();
}

// Exported for tests and for downstream tools that want the same normalisation.
module.exports = {
  diffPair,
  md,
  compareStyleProp,
  compareRect,
  classifyText,
  rgbToHex,
  lchToHex,
  oklchToHex,
  anyToHex,
  normColor,
  fontFamilyDelta,
  diffTexts,
  PX_TOLERANCE,
};

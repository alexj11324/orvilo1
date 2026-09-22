#!/usr/bin/env node
/**
 * Pairwise parity comparison, driven by an explicit pair list.
 *
 * Why this exists next to parity-diff.cjs: that tool left-joins on normalised TEXT, so an
 * element present on both sides always matches and its colour/size/weight/geometry never
 * enter the comparison. Every defect users reported in this project was of exactly that
 * shape — "both sides have it, but it differs". A text-keyed join cannot see them.
 *
 * The fix is not a cleverer automatic matcher. Joining two different codebases
 * automatically produces confident nonsense, and its failures are invisible because a
 * wrong pair still prints two values. So pairing is EXPLICIT here: the pair list names each
 * side's element and the properties to compare, and every pair that cannot be resolved is
 * reported as unresolved rather than quietly matched to something else.
 *
 * Usage:
 *   node parity-pairs.cjs --reference ref.json --candidate cand.json --pairs pairs.json
 *                         [--out table.md]
 *
 * Pair file shape (JSON array). Each side match is a set of conditions ANDed together;
 * `nth` disambiguates when several elements satisfy the rest (0-based, in document order):
 *
 *   [
 *     {
 *       "what": "Description label",
 *       "ref":  { "text": "Description", "visible": true },
 *       "cand": { "text": "Description", "visible": true },
 *       "props": ["fontSize", "fontWeight", "color", "box.h"]
 *     }
 *   ]
 *
 * Supported match keys: text (exact, trimmed), textIncludes, tag, role, ariaLabel, href,
 * visible, nth, svg, ancestor. `ancestor` is a true parent-chain condition, for example
 * `{ text: "Properties", ancestor: { role: "button" } }`.
 * Supported props: any key of `style`, plus `box.w|box.h|box.x|box.y`, `paint.fill`,
 * `paint.stroke` (aliases for the snapshot's `computedFill`/`computedStroke`), `svg.viewBox`,
 * `svg.path`, `svg.descendantCount`, `pseudo.before.content`, `behavior.href`, and nested
 * behavior fields such as `behavior.nearestInteractiveAncestor.role`.
 *
 * Two ways this used to report a pass while measuring nothing, both now errors:
 *   * A property that reads `undefined` or `null` on both sides. It used to stringify to `—`/`—` and score
 *     `ok`, so `paint.fill` (not a real snapshot key) looked aligned against every element.
 *   * More than one element matching when `nth` is omitted. The two sides differ in how many
 *     elements share a name, so "the first one" means different things on each side and a hidden
 *     1x1 <label> can be the one that gets paired. Pin `nth` per side and verify the column
 *     geometrically.
 *
 * There is no free-form region selector. Unsupported condition keys are reported as unresolved
 * instead of being ignored. Use explicit `nth` or the bounded `ancestor` condition after checking
 * the region visually once.
 */
const fs = require('node:fs');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const REF = arg('reference', '');
const CAND = arg('candidate', '');
const PAIRS = arg('pairs', '');
const OUT = arg('out', '');
if (!REF || !CAND || !PAIRS) {
  process.stderr.write(
    'usage: parity-pairs.cjs --reference R.json --candidate C.json --pairs P.json\n',
  );
  process.exit(2);
}

const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const refSnap = load(REF);
const candSnap = load(CAND);
const pairs = load(PAIRS);

// The paint object's real keys are attrFill / attrStroke / computedFill / computedStroke. Asking
// for `paint.fill` reads a key that does not exist and yields undefined on both sides — which the
// comparison below used to stringify to '—' on both sides and report as agreement. Map the short
// names so the obvious spelling works, and refuse the long-name typos below instead of scoring them.
const PAINT_ALIASES = {
  fill: 'computedFill',
  stroke: 'computedStroke',
  attrFill: 'attrFill',
  attrStroke: 'attrStroke',
  computedFill: 'computedFill',
  computedStroke: 'computedStroke',
};

const SUPPORTED_CONDITION_KEYS = new Set([
  'text',
  'textIncludes',
  'tag',
  'role',
  'ariaLabel',
  'href',
  'visible',
  'nth',
  'svg',
  'ancestor',
]);

const validateCondition = (cond, nested = false) => {
  if (!cond || typeof cond !== 'object' || Array.isArray(cond))
    return 'condition must be an object';
  for (const key of Object.keys(cond)) {
    if (!SUPPORTED_CONDITION_KEYS.has(key)) return `unsupported match key '${key}'`;
    if (nested && key === 'nth') return '`nth` is only supported on top-level conditions';
    if (key === 'ancestor') {
      if (nested) return 'nested ancestor conditions are not supported';
      const error = validateCondition(cond.ancestor, true);
      if (error) return `ancestor: ${error}`;
    }
    if (key === 'svg' && typeof cond.svg !== 'boolean') return '`svg` must be boolean';
  }
  return null;
};

const parentIndex = (snap) => {
  const parents = new Map();
  for (const el of snap.elements || []) parents.set(el.i, el.parent);
  return parents;
};

const descendantsOf = (snap, el) => {
  const children = new Map();
  for (const item of snap.elements || []) {
    if (!children.has(item.parent)) children.set(item.parent, []);
    children.get(item.parent).push(item);
  }
  const descendants = [];
  const pending = [...(children.get(el.i) || [])];
  while (pending.length) {
    const child = pending.shift();
    descendants.push(child);
    pending.push(...(children.get(child.i) || []));
  }
  return descendants;
};

const getNested = (value, path) => {
  let current = value;
  for (const key of path.split('.')) {
    if (current === undefined || current === null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
};

const getProp = (snap, el, path) => {
  if (path.startsWith('box.')) return el.box?.[path.slice(4)];
  if (path.startsWith('fractionalBox.')) return el.fractionalBox?.[path.slice(14)];
  if (path.startsWith('paint.')) {
    const paintPath = path.slice(6);
    const key = PAINT_ALIASES[paintPath];
    if (!key) return { __badProp: `unknown paint field '${path.slice(6)}'` };
    return el.paint?.[key];
  }
  if (path.startsWith('behavior.')) {
    const behaviorPath = path.slice(9);
    // `behavior.role` was documented before the collector put role at the element level.
    if (behaviorPath === 'role') return el.role ?? el.behavior?.role;
    return getNested(el.behavior, behaviorPath);
  }
  if (path.startsWith('svg.')) {
    const svgPath = path.slice(4);
    const svgDescendants = descendantsOf(snap, el).filter((item) => item.svg);
    if (svgPath === 'descendantCount') return svgDescendants.length;
    if (svgPath === 'pathCount')
      return svgDescendants.filter((item) => item.tag?.toLowerCase() === 'path').length;
    if (svgPath === 'elementCount') return svgDescendants.length + (el.svg ? 1 : 0);
    return getNested(el.svg, svgPath);
  }
  if (path.startsWith('pseudo.')) return getNested(el.pseudo, path.slice(7));
  return getNested(el.style, path);
};

const matchesBasic = (el, cond) => {
  if (cond.visible !== undefined && el.visible !== cond.visible) return false;
  if (cond.tag && el.tag !== cond.tag) return false;
  if (cond.role !== undefined && (el.role ?? null) !== cond.role) return false;
  if (cond.ariaLabel !== undefined && (el.aria?.label ?? null) !== cond.ariaLabel) return false;
  if (cond.href !== undefined && (el.behavior?.href ?? null) !== cond.href) return false;
  if (cond.text !== undefined && (el.ownText ?? null) !== cond.text) return false;
  if (cond.textIncludes !== undefined && !(el.ownText || '').includes(cond.textIncludes))
    return false;
  if (cond.svg !== undefined && Boolean(el.svg) !== cond.svg) return false;
  return true;
};

const matches = (snap, el, cond, parents) => {
  if (!matchesBasic(el, cond)) return false;
  if (cond.ancestor === undefined) return true;
  let ancestorIndex = parents.get(el.i);
  while (ancestorIndex !== undefined && ancestorIndex !== -1 && ancestorIndex !== null) {
    const ancestor = snap.elements.find((item) => item.i === ancestorIndex);
    if (ancestor && matchesBasic(ancestor, cond.ancestor)) return true;
    ancestorIndex = parents.get(ancestorIndex);
  }
  return false;
};

const resolve = (snap, cond) => {
  if (!cond) return { error: 'no condition given' };
  const conditionError = validateCondition(cond);
  if (conditionError) return { error: conditionError };
  const parents = parentIndex(snap);
  const hits = snap.elements.filter((el) => matches(snap, el, cond, parents));
  if (hits.length === 0) return { error: 'no element matched' };
  if (hits.length > 1 && cond.nth === undefined) {
    // Defaulting to the first hit is how a hidden 1x1 <label> in the sidebar gets paired against
    // the real row and printed as a match. The two sides routinely differ in how many elements
    // share a name (`Members` was 1 on the reference and 4 here), so "the first one" means
    // different things on each side. Only the caller knows which column it wants.
    const where = hits
      .map((h) => `${h.tag}@${Math.round(h.box?.x ?? -1)},${Math.round(h.box?.y ?? -1)}`)
      .join(' ');
    return { error: `${hits.length} matched and \`nth\` was not given — ambiguous: ${where}` };
  }
  const idx = cond.nth ?? 0;
  if (idx >= hits.length) return { error: `nth=${idx} but only ${hits.length} matched` };
  return { el: hits[idx], candidates: hits.length };
};

const fmt = (v) => (v === undefined || v === null ? '—' : String(v));

const rows = [];
let unresolved = 0;
let diffs = 0;
// Properties that produced no reading at all. Counted apart from diffs because they are not
// "different" — they are unmeasured, and folding them into either column would be a lie.
let unreadable = 0;

for (const pair of pairs) {
  const props = pair.props || [];
  const r = resolve(refSnap, pair.ref) || { error: 'missing ref condition' };
  const c = resolve(candSnap, pair.cand) || { error: 'missing cand condition' };

  if (r.error || c.error) {
    unresolved += 1;
    rows.push({
      what: pair.what,
      error: `ref: ${r.error || 'ok'} / cand: ${c.error || 'ok'}`,
      props: [],
    });
    continue;
  }

  const cells = props.map((p) => {
    const rv = getProp(refSnap, r.el, p);
    const cv = getProp(candSnap, c.el, p);

    const bad = rv?.__badProp || cv?.__badProp;
    if (bad) {
      unreadable += 1;
      return { prop: p, ref: '?', cand: '?', same: false, note: bad };
    }

    // A property that reads null or undefined on BOTH sides is not agreement — it is a property nobody
    // measured. Stringifying both to '—' and calling it same is how `paint.fill` reported
    // "aligned" while testing nothing. Absence of a reading must never render as a match.
    if (rv == null && cv == null) {
      unreadable += 1;
      return {
        prop: p,
        ref: '—',
        cand: '—',
        same: false,
        note: 'unreadable on both sides — check the key exists in the snapshot',
      };
    }

    const same = String(fmt(rv)) === String(fmt(cv));
    if (!same) diffs += 1;
    return { prop: p, ref: fmt(rv), cand: fmt(cv), same };
  });
  rows.push({ what: pair.what, cells });
}

const lines = [
  '# Pairwise parity table',
  '',
  `reference: ${refSnap.meta?.url ?? REF}`,
  `candidate: ${candSnap.meta?.url ?? CAND}`,
  `viewport: ${refSnap.meta?.viewport?.w}x${refSnap.meta?.viewport?.h} vs ` +
    `${candSnap.meta?.viewport?.w}x${candSnap.meta?.viewport?.h}`,
  '',
  `pairs: ${pairs.length} · differing properties: ${diffs} · unresolved pairs: ${unresolved} · ` +
    `unreadable properties: ${unreadable}`,
  '',
];

for (const row of rows) {
  if (row.error) {
    // Never fold an unresolved pair into a "no difference" row: a pair that could not be
    // resolved is not evidence of agreement, and reporting it as such is how a mismatched
    // pairing turns into a false pass.
    lines.push(`## ${row.what}`);
    lines.push('');
    lines.push(`**UNRESOLVED** — ${row.error}`);
    lines.push('');
    continue;
  }
  lines.push(`## ${row.what}`);
  lines.push('');
  lines.push('| property | reference | candidate | |');
  lines.push('| --- | --- | --- | --- |');
  for (const cell of row.cells) {
    const verdict = cell.note ? '**UNREADABLE**' : cell.same ? 'ok' : '**DIFF**';
    const note = cell.note ? ` — ${cell.note}` : '';
    lines.push(`| \`${cell.prop}\` | ${cell.ref} | ${cell.cand} | ${verdict}${note} |`);
  }
  lines.push('');
}

const table = lines.join('\n');
if (OUT) {
  fs.writeFileSync(OUT, table);
  process.stderr.write(`wrote ${OUT}\n`);
} else {
  process.stdout.write(`${table}\n`);
}
process.stderr.write(
  `pairs=${pairs.length} diffs=${diffs} unresolved=${unresolved} unreadable=${unreadable}\n`,
);
// Every differing, unresolved, or unreadable measurement fails the parity gate.
process.exit(diffs > 0 || unresolved > 0 || unreadable > 0 ? 1 : 0);

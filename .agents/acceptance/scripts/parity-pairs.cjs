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
 * visible, nth.
 * Supported props: any key of `style`, plus `box.w|box.h|box.x|box.y`, `paint.fill`,
 * `paint.stroke` (aliases for the snapshot's `computedFill`/`computedStroke`), `behavior.href`,
 * `behavior.role`.
 *
 * Two ways this used to report a pass while measuring nothing, both now errors:
 *   * A property that reads `undefined` on both sides. It used to stringify to `—`/`—` and score
 *     `ok`, so `paint.fill` (not a real snapshot key) looked aligned against every element.
 *   * More than one element matching when `nth` is omitted. The two sides differ in how many
 *     elements share a name, so "the first one" means different things on each side and a hidden
 *     1x1 <label> can be the one that gets paired. Pin `nth` per side and verify the column
 *     geometrically.
 *
 * Not implemented: region scoping. Snapshots are whole-page, so a text match can also hit a
 * same-named element in the sidebar. Disambiguate with `nth`, which is now REQUIRED whenever
 * more than one element matches (check the region visually once, then pin the ordinal per side).
 * Do not add a `region` key to a pair file — it would be ignored silently.
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

const getProp = (el, path) => {
  if (path.startsWith('box.')) return el.box?.[path.slice(4)];
  if (path.startsWith('paint.')) {
    const key = PAINT_ALIASES[path.slice(6)];
    if (!key) return { __badProp: `unknown paint field '${path.slice(6)}'` };
    return el.paint?.[key];
  }
  if (path.startsWith('behavior.')) return el.behavior?.[path.slice(9)];
  return el.style?.[path];
};

const matches = (el, cond) => {
  if (cond.visible !== undefined && el.visible !== cond.visible) return false;
  if (cond.tag && el.tag !== cond.tag) return false;
  if (cond.role !== undefined && (el.role ?? null) !== cond.role) return false;
  if (cond.ariaLabel !== undefined && (el.aria?.label ?? null) !== cond.ariaLabel) return false;
  if (cond.href !== undefined && (el.behavior?.href ?? null) !== cond.href) return false;
  if (cond.text !== undefined && (el.ownText ?? null) !== cond.text) return false;
  if (cond.textIncludes !== undefined && !(el.ownText || '').includes(cond.textIncludes))
    return false;
  return true;
};

const resolve = (snap, cond) => {
  if (!cond) return { error: 'no condition given' };
  const hits = snap.elements.filter((el) => matches(el, cond));
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
    const rv = getProp(r.el, p);
    const cv = getProp(c.el, p);

    const bad = rv?.__badProp || cv?.__badProp;
    if (bad) {
      unreadable += 1;
      return { prop: p, ref: '?', cand: '?', same: false, note: bad };
    }

    // A property that reads undefined on BOTH sides is not agreement — it is a property nobody
    // measured. Stringifying both to '—' and calling it same is how `paint.fill` reported
    // "aligned" while testing nothing. Absence of a reading must never render as a match.
    if (rv === undefined && cv === undefined) {
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
// Unreadable counts as a failure alongside unresolved: a property nobody could read is not a
// pass, and exiting 0 would let a pair file full of typos look like a clean comparison.
process.exit(unresolved > 0 || unreadable > 0 ? 1 : 0);

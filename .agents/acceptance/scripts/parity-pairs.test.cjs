const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const SCRIPT = path.join(__dirname, 'parity-pairs.cjs');

const meta = (url) => ({
  url,
  viewport: { w: 800, h: 600, dpr: 2 },
});

const element = ({
  i,
  parent,
  tag = 'DIV',
  role = null,
  ownText = null,
  style = {},
  svg = null,
  behavior = {},
}) => ({
  i,
  parent,
  tag,
  role,
  aria: { label: null },
  ownText,
  visible: true,
  box: { x: 20 + i * 4, y: 20 + i * 4, w: 100, h: 28 },
  fractionalBox: { x: 20 + i * 4, y: 20 + i * 4, width: 100, height: 28 },
  style,
  paint:
    tag === 'svg' || tag === 'path'
      ? {
          attrFill: tag === 'svg' ? 'none' : null,
          attrStroke: tag === 'path' ? 'currentColor' : null,
          computedFill: 'none',
          computedStroke: tag === 'path' ? 'currentColor' : 'none',
        }
      : null,
  svg,
  pseudo: { before: null, after: null },
  behavior: {
    href: null,
    interactionVerification: 'not-tested',
    nearestInteractiveAncestor: null,
    ...behavior,
  },
});

const reference = {
  meta: meta('http://reference.test/project'),
  elements: [
    element({
      i: 0,
      parent: -1,
      role: 'button',
      style: { borderRadius: '8px', fontSize: '14px', fontWeight: '500' },
      behavior: {
        isButton: true,
        nearestInteractiveAncestor: { i: 0, tag: 'DIV', role: 'button' },
      },
    }),
    element({
      i: 1,
      parent: 0,
      ownText: 'Properties',
      style: {
        borderRadius: '9999px',
        borderTopLeftRadius: '9999px',
        borderTopRightRadius: '9999px',
        borderBottomRightRadius: '9999px',
        borderBottomLeftRadius: '9999px',
        fontFamily: 'Inter',
        fontSize: '13px',
        fontWeight: '500',
        padding: '3px 6px',
        gap: '4px',
      },
      behavior: {
        nearestInteractiveAncestor: { i: 0, tag: 'DIV', role: 'button' },
      },
    }),
    element({
      i: 2,
      parent: 1,
      tag: 'svg',
      svg: { viewBox: '0 0 16 16', path: null, geometry: { width: '16', height: '16' } },
    }),
    element({
      i: 3,
      parent: 2,
      tag: 'path',
      svg: { viewBox: '0 0 16 16', path: 'M3 2v12', geometry: {} },
    }),
  ],
};

const candidate = {
  meta: meta('http://candidate.test/project'),
  elements: [
    element({
      i: 0,
      parent: -1,
      role: 'button',
      style: { borderRadius: '8px', fontSize: '14px', fontWeight: '500' },
      behavior: {
        isButton: true,
        nearestInteractiveAncestor: { i: 0, tag: 'DIV', role: 'button' },
      },
    }),
    element({
      i: 1,
      parent: -1,
      ownText: 'Properties',
      style: {
        borderRadius: '6px',
        borderTopLeftRadius: '6px',
        borderTopRightRadius: '6px',
        borderBottomRightRadius: '6px',
        borderBottomLeftRadius: '6px',
        fontFamily: 'Inter',
        fontSize: '14px',
        fontWeight: '400',
        padding: '0px',
        gap: '0px',
      },
      behavior: { nearestInteractiveAncestor: null },
    }),
  ],
};

const pairs = [
  {
    what: 'outer control SVG descendant count',
    ref: { role: 'button' },
    cand: { role: 'button' },
    props: ['svg.descendantCount'],
  },
  {
    what: 'inner Properties pill and ancestry',
    ref: { text: 'Properties', tag: 'DIV' },
    cand: { text: 'Properties', tag: 'DIV' },
    props: [
      'borderRadius',
      'borderTopLeftRadius',
      'fontFamily',
      'fontSize',
      'fontWeight',
      'padding',
      'gap',
      'behavior.nearestInteractiveAncestor.role',
    ],
  },
  {
    what: 'explicit calendar SVG',
    ref: { tag: 'svg' },
    cand: { tag: 'svg' },
    props: ['svg.viewBox', 'svg.geometry.width', 'paint.stroke'],
  },
  {
    what: 'true ancestor scope',
    ref: { text: 'Properties', ancestor: { role: 'button' } },
    cand: { text: 'Properties', ancestor: { role: 'button' } },
    props: ['fontSize'],
  },
  {
    what: 'unsupported region key is unresolved',
    ref: { text: 'Properties', region: 'main' },
    cand: { text: 'Properties', region: 'main' },
    props: [],
  },
];

const compare = (referenceSnapshot, candidateSnapshot, pairList) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'orvilo-parity-pairs-'));
  try {
    const refPath = path.join(dir, 'reference.json');
    const candPath = path.join(dir, 'candidate.json');
    const pairsPath = path.join(dir, 'pairs.json');
    writeFileSync(refPath, JSON.stringify(referenceSnapshot));
    writeFileSync(candPath, JSON.stringify(candidateSnapshot));
    writeFileSync(pairsPath, JSON.stringify(pairList));
    return spawnSync(
      process.execPath,
      [SCRIPT, '--reference', refPath, '--candidate', candPath, '--pairs', pairsPath],
      { encoding: 'utf8' },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('measured differences fail without an unresolved pair', () => {
  const result = compare(reference, candidate, [pairs[0], pairs[1]]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /`fontSize`.*\*\*DIFF\*\*/);
  assert.match(result.stderr, /unresolved=0 unreadable=0/);
});

test('null SVG root path is unreadable rather than evidence that icons match', () => {
  const result = compare(reference, { ...reference, meta: meta('http://candidate.test/project') }, [
    {
      what: 'calendar path on SVG root',
      ref: { tag: 'svg' },
      cand: { tag: 'svg' },
      props: ['svg.path'],
    },
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /`svg\.path`.*\*\*UNREADABLE\*\*/);
});

test('pathCount reads lowercase SVG child tags from a real DOM snapshot', () => {
  const withoutPath = structuredClone(reference);
  withoutPath.elements = withoutPath.elements.filter((item) => item.tag !== 'path');
  const result = compare(reference, withoutPath, [
    {
      what: 'calendar path count',
      ref: { tag: 'svg', svg: true },
      cand: { tag: 'svg', svg: true },
      props: ['svg.pathCount'],
    },
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /`svg\.pathCount`.*\*\*DIFF\*\*/);
});

test('actual PATH data compares when the path element is selected', () => {
  const altered = structuredClone(reference);
  altered.elements.find((item) => item.tag === 'path').svg.path = 'M4 2v12';
  const result = compare(reference, altered, [
    {
      what: 'calendar path geometry',
      ref: { tag: 'path', svg: true },
      cand: { tag: 'path', svg: true },
      props: ['svg.path'],
    },
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /`svg\.path`.*\*\*DIFF\*\*/);
});

test('pair comparison flags nested pill/icon differences and rejects unsupported selectors', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'orvilo-parity-pairs-'));
  try {
    const refPath = path.join(dir, 'reference.json');
    const candPath = path.join(dir, 'candidate.json');
    const pairsPath = path.join(dir, 'pairs.json');
    writeFileSync(refPath, JSON.stringify(reference));
    writeFileSync(candPath, JSON.stringify(candidate));
    writeFileSync(pairsPath, JSON.stringify(pairs));

    const result = spawnSync(
      process.execPath,
      [SCRIPT, '--reference', refPath, '--candidate', candPath, '--pairs', pairsPath],
      { encoding: 'utf8' },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    assert.notEqual(result.status, 0, 'differences/unresolved selectors must fail the comparator');
    assert.match(output, /`svg\.descendantCount`.*\*\*DIFF\*\*/);
    assert.match(output, /`behavior\.nearestInteractiveAncestor\.role`.*\*\*DIFF\*\*/);
    assert.match(output, /unsupported match key 'region'/);
    assert.match(output, /\*\*UNRESOLVED\*\*/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

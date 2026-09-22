const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
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
  ariaLabel = null,
  ownText = null,
  visible = true,
  visibility = null,
  style = {},
  svg = null,
  behavior = {},
}) => ({
  i,
  parent,
  tag,
  role,
  aria: { label: ariaLabel },
  ownText,
  visible,
  visibility: visibility ?? {
    state: visible ? 'visible' : 'not-rendered',
    geometryBearing: true,
    semantic: Boolean(role || ariaLabel || svg),
    opacityHiddenBy: null,
  },
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

const withCoverageMetadata = (snapshot) => {
  const result = structuredClone(snapshot);
  result.coverageInventory = result.elements
    .filter(
      (item) =>
        item.visible ||
        (item.visibility?.state === 'opacity-hidden' &&
          item.visibility?.geometryBearing === true &&
          item.visibility?.semantic === true),
    )
    .map((item) => ({
      i: item.i,
      parent: item.parent,
      depth: item.depth ?? 0,
      region: item.region ?? {
        i: null,
        tag: 'DOCUMENT',
        id: null,
        role: 'document',
        ariaLabel: null,
      },
      geometry: item.fractionalBox,
      identity: {
        tag: item.tag,
        id: item.id ?? null,
        role: item.role ?? null,
        ariaLabel: item.aria?.label ?? null,
        dataTestId: null,
        name: null,
        type: null,
        href: item.behavior?.href ?? null,
        ownText: item.ownText ?? null,
        subtreeText: item.subtreeText ?? null,
        svg: item.svg
          ? {
              tag: item.svg.tag ?? item.tag.toLowerCase(),
              viewBox: item.svg.viewBox ?? null,
              path: item.svg.path ?? null,
            }
          : null,
      },
      categories: {
        interactive: item.behavior?.nearestInteractiveAncestor?.i === item.i,
        svg: Boolean(item.svg),
        svgRoot: item.tag.toLowerCase() === 'svg',
        text: Boolean(item.ownText),
        container: false,
        latent: item.visibility?.state === 'opacity-hidden',
      },
      exposure: item.visibility,
      interactionRootIndex: item.behavior?.nearestInteractiveAncestor?.i ?? null,
      interactionStates: {
        hover: 'not-tested',
        focus: 'not-tested',
        click: 'not-tested',
      },
    }));
  const latentInteractionRoots = new Set(
    result.coverageInventory
      .filter((item) => item.categories.latent && Number.isInteger(item.interactionRootIndex))
      .map((item) => item.interactionRootIndex),
  );
  for (const item of result.coverageInventory) {
    if (item.categories.latent || latentInteractionRoots.has(item.i)) {
      item.interactionStates.hover = 'potential-hover-not-tested';
    }
  }
  result.meta = {
    ...result.meta,
    elementCount: result.elements.length,
    totalElements: result.elements.length,
    truncated: false,
    coverage: {
      scope: 'all-visible-and-opacity-hidden-semantic-elements',
      inventoryCount: result.coverageInventory.length,
      completeCapture: true,
      interactionStateCoverage: {
        hover: 'not-tested',
        focus: 'not-tested',
        click: 'not-tested',
      },
    },
  };
  const requiredEdges = [
    'hover',
    'focus',
    'activate',
    'result-state',
    'options-enumerated',
    'selection-feedback',
    'persistence-or-navigation',
    'error-feedback',
  ];
  const controls = result.coverageInventory
    .filter((item) => item.categories.interactive)
    .map((item) => ({
      elementIndex: item.i,
      identity: item.identity,
      region: item.region,
      geometry: item.geometry,
      exposure: item.exposure,
      edges: requiredEdges.map((edge) => ({
        edge,
        conditional: edge.includes('options') || edge.includes('feedback'),
        safety: 'test-fixture',
        status:
          edge === 'hover' && item.interactionStates.hover === 'potential-hover-not-tested'
            ? 'potential-hover-not-tested'
            : 'not-tested',
        evidence: [],
      })),
    }));
  result.interactionManifest = {
    schemaVersion: 1,
    scope: 'all-visible-and-opacity-hidden-semantic-interactive-roots',
    complete: false,
    controls,
    summary: {
      controlCount: controls.length,
      requiredEdgeCount: controls.length * requiredEdges.length,
      observedEdgeCount: 0,
      blockerCount: controls.length === 0 ? 1 : controls.length * requiredEdges.length,
      emptySurfaceBlocker: controls.length === 0,
    },
  };
  return result;
};

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

const compareWithCoverage = (
  referenceSnapshot,
  candidateSnapshot,
  pairList,
  { strict = false } = {},
) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'orvilo-parity-coverage-'));
  try {
    const refPath = path.join(dir, 'reference.json');
    const candPath = path.join(dir, 'candidate.json');
    const pairsPath = path.join(dir, 'pairs.json');
    const coveragePath = path.join(dir, 'coverage.json');
    writeFileSync(refPath, JSON.stringify(referenceSnapshot));
    writeFileSync(candPath, JSON.stringify(candidateSnapshot));
    writeFileSync(pairsPath, JSON.stringify(pairList));
    const args = [
      SCRIPT,
      '--reference',
      refPath,
      '--candidate',
      candPath,
      '--pairs',
      pairsPath,
      '--coverage-out',
      coveragePath,
    ];
    if (strict) args.push('--require-complete-coverage');
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    return { result, coverage: JSON.parse(readFileSync(coveragePath, 'utf8')) };
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

test('full inventory exposes unpaired ordinary DOM, an icon, and duplicate-text ambiguity', () => {
  const coverageReference = structuredClone(reference);
  const coverageCandidate = structuredClone(reference);
  coverageCandidate.meta = meta('http://candidate.test/project');

  coverageReference.elements.push(
    element({ i: 10, parent: -1, tag: 'DIV', ownText: 'Reference-only container' }),
    element({ i: 11, parent: -1, tag: 'SPAN', ownText: 'Duplicate' }),
    element({ i: 12, parent: -1, tag: 'SPAN', ownText: 'Duplicate' }),
  );
  coverageCandidate.elements.push(
    element({ i: 10, parent: -1, tag: 'SPAN', ownText: 'Duplicate' }),
    element({ i: 11, parent: -1, tag: 'SPAN', ownText: 'Duplicate' }),
    element({
      i: 12,
      parent: -1,
      tag: 'svg',
      svg: { viewBox: '0 0 24 24', path: null, geometry: { width: '24', height: '24' } },
    }),
  );
  const unreadable = element({ i: 13, parent: -1, tag: 'DIV', ownText: 'Missing geometry' });
  delete unreadable.box;
  delete unreadable.fractionalBox;
  coverageCandidate.elements.push(unreadable);

  const { result, coverage } = compareWithCoverage(
    withCoverageMetadata(coverageReference),
    withCoverageMetadata(coverageCandidate),
    [],
    { strict: true },
  );

  assert.notEqual(result.status, 0, 'strict coverage must fail on gaps and ambiguity');
  assert.match(result.stdout, /Full visible-DOM coverage/);
  assert.match(result.stdout, /interaction states: hover not-tested/);
  assert.equal(coverage.scope, 'all-visible-and-opacity-hidden-semantic-elements');
  assert.equal(coverage.complete, false);
  assert.equal(coverage.certified, false);
  assert.equal(
    coverage.manualPairs.length,
    0,
    'manual pairs must not determine inventory coverage',
  );

  const ordinary = coverage.inventories.reference.find(
    (item) => item.identity.ownText === 'Reference-only container',
  );
  assert.equal(ordinary.status, 'unpaired');
  assert.ok(coverage.unmatched.reference.includes(ordinary.i));
  assert.ok(ordinary.geometry, 'ordinary containers retain geometry in the coverage artifact');
  assert.ok(ordinary.region, 'ordinary containers retain region identity in the coverage artifact');

  const icon = coverage.inventories.candidate.find(
    (item) => item.identity.svg?.viewBox === '0 0 24 24',
  );
  assert.equal(icon.status, 'unpaired');
  assert.equal(
    coverage.inventories.candidate.find((item) => item.identity.ownText === 'Missing geometry')
      .status,
    'unreadable',
  );

  const duplicateReference = coverage.inventories.reference.filter(
    (item) => item.identity.ownText === 'Duplicate',
  );
  const duplicateCandidate = coverage.inventories.candidate.filter(
    (item) => item.identity.ownText === 'Duplicate',
  );
  assert.equal(duplicateReference.length, 2);
  assert.equal(duplicateCandidate.length, 2);
  assert.ok(duplicateReference.every((item) => item.status === 'ambiguous'));
  assert.ok(duplicateCandidate.every((item) => item.status === 'ambiguous'));
  assert.ok(duplicateReference.every((item) => item.ambiguity.candidateCount === 2));
  assert.ok(duplicateReference.every((item) => item.ambiguity.candidateExamples.length === 2));
  assert.equal(coverage.interactionStateCoverage.reference.hover, 'not-tested');
});

test('strict coverage fails unique heuristic pairs with typography, paint, or geometry differences', () => {
  const referenceText = element({
    i: 0,
    parent: -1,
    tag: 'SPAN',
    ownText: 'Unique label',
    style: {
      backgroundImage: 'url("#radix-menu-123")',
      fontFamily: 'Inter',
      fontSize: '13px',
    },
  });
  referenceText.pseudo.before = { content: '"2026-09-22T10:00:00Z"', style: {} };
  const candidateText = structuredClone(referenceText);
  candidateText.style = {
    backgroundImage: 'url("#radix-menu-987")',
    fontFamily: 'Arial',
    fontSize: '14px',
  };
  candidateText.fractionalBox.x += 0.25;
  candidateText.pseudo.before = { content: '"2026-09-22T10:05:00Z"', style: {} };

  const referenceIcon = element({
    i: 1,
    parent: -1,
    tag: 'path',
    svg: { tag: 'path', viewBox: '0 0 16 16', path: 'M3 2v12', geometry: {} },
  });
  referenceIcon.paint.computedStroke = 'rgb(255, 0, 0)';
  const candidateIcon = structuredClone(referenceIcon);
  candidateIcon.paint.computedStroke = 'rgb(0, 0, 255)';
  candidateIcon.fractionalBox.width += 1;

  const referenceSnapshot = withCoverageMetadata({
    meta: meta('http://reference.test/project'),
    elements: [referenceText, referenceIcon],
  });
  const candidateSnapshot = withCoverageMetadata({
    meta: meta('http://candidate.test/project'),
    elements: [candidateText, candidateIcon],
  });
  const { result, coverage } = compareWithCoverage(referenceSnapshot, candidateSnapshot, [], {
    strict: true,
  });

  assert.notEqual(result.status, 0);
  assert.equal(coverage.inventoryComplete, true);
  assert.equal(coverage.capturedPropertyComparisonComplete, false);
  assert.equal(coverage.summary.capturedProperties.differingPairs, 2);

  const differences = coverage.capturedPropertyComparisons.flatMap((item) =>
    item.differences.map((difference) => difference.path),
  );
  assert.ok(differences.includes('style.fontFamily'));
  assert.ok(differences.includes('style.fontSize'));
  assert.ok(differences.includes('paint.computedStroke'));
  assert.ok(differences.includes('geometry.fractional.width'));
  assert.ok(!differences.includes('geometry.fractional.x'));
  assert.ok(!differences.includes('style.backgroundImage'));
  assert.ok(!differences.includes('pseudo.before.content'));
});

test('strict coverage blocks static-only evidence for every visible control journey edge', () => {
  const control = element({
    i: 0,
    parent: -1,
    role: 'button',
    ownText: 'Open status',
    behavior: {
      isButton: true,
      nearestInteractiveAncestor: { i: 0, tag: 'DIV', role: 'button' },
    },
  });
  const referenceSnapshot = withCoverageMetadata({
    meta: meta('http://reference.test/project'),
    elements: [control],
  });
  const candidateSnapshot = withCoverageMetadata({
    meta: meta('http://candidate.test/project'),
    elements: [structuredClone(control)],
  });
  const { result, coverage } = compareWithCoverage(referenceSnapshot, candidateSnapshot, [], {
    strict: true,
  });

  assert.notEqual(result.status, 0);
  assert.equal(coverage.inventoryComplete, true);
  assert.equal(coverage.capturedPropertyComparisonComplete, true);
  assert.equal(coverage.interactionCoverageComplete, false);
  assert.equal(coverage.interactionCoverage.reference.blockers.length, 8);
  assert.equal(coverage.interactionCoverage.candidate.blockers.length, 8);
  assert.ok(
    coverage.interactionCoverage.reference.blockers.every(
      (blocker) => blocker.status === 'not-tested',
    ),
  );
});

test('strict coverage rejects malformed or incomplete capture metadata', () => {
  const valid = withCoverageMetadata({
    meta: meta('http://reference.test/project'),
    elements: [
      element({ i: 0, parent: -1, ownText: 'One' }),
      element({ i: 1, parent: -1, ownText: 'Two' }),
      element({ i: 2, parent: -1, ownText: 'Three' }),
    ],
  });
  const malformed = structuredClone(valid);
  malformed.meta.totalElements += 1;
  malformed.elements[1].i = 0;
  malformed.coverageInventory.pop();
  malformed.meta.coverage.inventoryCount = malformed.coverageInventory.length;

  const malformedResult = compareWithCoverage(malformed, valid, [], { strict: true });
  assert.notEqual(malformedResult.result.status, 0);
  assert.ok(
    malformedResult.coverage.captureIssues.some((issue) =>
      issue.includes('non-truncated totalElements does not match elementCount'),
    ),
  );
  assert.ok(
    malformedResult.coverage.captureIssues.some((issue) =>
      issue.includes('duplicate element indexes'),
    ),
  );
  assert.ok(
    malformedResult.coverage.captureIssues.some((issue) =>
      issue.includes('coverageInventory omits'),
    ),
  );

  const empty = withCoverageMetadata({
    meta: meta('http://empty.test/project'),
    elements: [],
  });
  const emptyResult = compareWithCoverage(empty, valid, [], { strict: true });
  assert.notEqual(emptyResult.result.status, 0);
  assert.ok(
    emptyResult.coverage.captureIssues.some((issue) =>
      issue.includes('elements must not be empty'),
    ),
  );

  const legacyScope = structuredClone(valid);
  legacyScope.meta.coverage.scope = 'all-visible-dom-elements';
  const mixedScopeDefault = compareWithCoverage(legacyScope, valid, []);
  assert.notEqual(mixedScopeDefault.result.status, 0, 'mixed capture scopes must fail by default');
  const mixedScopeResult = compareWithCoverage(legacyScope, valid, [], { strict: true });
  assert.notEqual(mixedScopeResult.result.status, 0);
  assert.equal(mixedScopeResult.coverage.scope, 'mixed-declared-scopes');
  assert.ok(
    mixedScopeResult.coverage.captureIssues.some((issue) =>
      issue.includes('coverage scopes differ; recapture both snapshots'),
    ),
  );
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

test('strict comparison detects different visible text in an explicit pair', () => {
  const sharedBehavior = {
    isButton: true,
    nearestInteractiveAncestor: { i: 0, tag: 'BUTTON', role: 'button' },
  };
  const referenceSnapshot = withCoverageMetadata({
    meta: meta('http://reference.test/button'),
    elements: [
      element({
        i: 0,
        parent: -1,
        tag: 'BUTTON',
        role: 'button',
        ownText: 'Save',
        behavior: sharedBehavior,
      }),
    ],
  });
  const candidateSnapshot = withCoverageMetadata({
    meta: meta('http://candidate.test/button'),
    elements: [
      element({
        i: 0,
        parent: -1,
        tag: 'BUTTON',
        role: 'button',
        ownText: 'Delete',
        behavior: sharedBehavior,
      }),
    ],
  });
  const { coverage } = compareWithCoverage(
    referenceSnapshot,
    candidateSnapshot,
    [
      {
        what: 'same position, different action',
        ref: { tag: 'BUTTON' },
        cand: { tag: 'BUTTON' },
        props: [],
      },
    ],
    { strict: true },
  );
  assert.equal(coverage.capturedPropertyComparisonComplete, false);
  assert.ok(
    coverage.capturedPropertyComparisons[0].differences.some(
      (difference) => difference.path === 'identity.ownText',
    ),
  );
});

test('strict inventory rejects two explicit references paired to one candidate', () => {
  const referenceSnapshot = withCoverageMetadata({
    meta: meta('http://reference.test/two'),
    elements: [
      element({ i: 0, parent: -1, ownText: 'First' }),
      element({ i: 1, parent: -1, ownText: 'Second' }),
    ],
  });
  const candidateSnapshot = withCoverageMetadata({
    meta: meta('http://candidate.test/one'),
    elements: [element({ i: 0, parent: -1, ownText: 'Only' })],
  });
  const { coverage } = compareWithCoverage(
    referenceSnapshot,
    candidateSnapshot,
    [
      { what: 'first', ref: { text: 'First' }, cand: { text: 'Only' }, props: [] },
      { what: 'second', ref: { text: 'Second' }, cand: { text: 'Only' }, props: [] },
    ],
    { strict: true },
  );
  assert.equal(coverage.inventoryComplete, false);
  assert.equal(coverage.summary.reference.ambiguous, 2);
  assert.equal(coverage.summary.candidate.ambiguous, 1);
});

test('automatic inventory runs without an explicit pair file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'orvilo-parity-auto-'));
  try {
    const refPath = path.join(dir, 'reference.json');
    const candPath = path.join(dir, 'candidate.json');
    const coveragePath = path.join(dir, 'coverage.json');
    writeFileSync(
      refPath,
      JSON.stringify(
        withCoverageMetadata({
          meta: meta('http://reference.test/auto'),
          elements: [element({ i: 0, parent: -1, ownText: 'Save' })],
        }),
      ),
    );
    writeFileSync(
      candPath,
      JSON.stringify(
        withCoverageMetadata({
          meta: meta('http://candidate.test/auto'),
          elements: [element({ i: 0, parent: -1, ownText: 'Delete' })],
        }),
      ),
    );
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--reference',
        refPath,
        '--candidate',
        candPath,
        '--coverage-out',
        coveragePath,
        '--require-complete-coverage',
      ],
      { encoding: 'utf8' },
    );
    const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
    assert.equal(result.status, 1);
    assert.equal(coverage.summary.reference.total, 1);
    assert.equal(coverage.manualPairs.length, 0);
    assert.equal(coverage.inventoryComplete, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('automatic comparison reports a reference-only opacity-hidden semantic icon without manual pairs', () => {
  const visibleRow = element({ i: 0, parent: -1, ownText: 'Owner' });
  const latentControl = element({
    i: 1,
    parent: 0,
    tag: 'BUTTON',
    role: 'button',
    ariaLabel: 'Assign owner',
    visible: true,
    behavior: {
      isButton: true,
      nearestInteractiveAncestor: { i: 1, tag: 'BUTTON', role: 'button' },
    },
  });
  const latentIcon = element({
    i: 2,
    parent: 1,
    tag: 'svg',
    ariaLabel: 'No owner',
    visible: false,
    visibility: {
      state: 'opacity-hidden',
      geometryBearing: true,
      semantic: true,
      opacityHiddenBy: 1,
    },
    svg: { tag: 'svg', viewBox: '0 0 16 16', path: null, geometry: {} },
    behavior: {
      nearestInteractiveAncestor: { i: 1, tag: 'BUTTON', role: 'button' },
    },
  });
  const latentPath = element({
    i: 3,
    parent: 2,
    tag: 'path',
    visible: false,
    visibility: {
      state: 'opacity-hidden',
      geometryBearing: true,
      semantic: true,
      opacityHiddenBy: 1,
    },
    svg: { tag: 'path', viewBox: '0 0 16 16', path: 'M2 8h12', geometry: {} },
    behavior: {
      nearestInteractiveAncestor: { i: 1, tag: 'BUTTON', role: 'button' },
    },
  });
  const referenceSnapshot = withCoverageMetadata({
    meta: meta('http://reference.test/latent'),
    elements: [visibleRow, latentControl, latentIcon, latentPath],
  });
  const candidateSnapshot = withCoverageMetadata({
    meta: meta('http://candidate.test/latent'),
    elements: [structuredClone(visibleRow)],
  });

  const { result, coverage } = compareWithCoverage(referenceSnapshot, candidateSnapshot, []);

  assert.equal(result.status, 1);
  assert.equal(coverage.complete, false);
  assert.equal(coverage.strictRequested, false);
  assert.equal(coverage.latentOpacityHidden.reference.total, 2);
  assert.equal(coverage.latentOpacityHidden.reference.unpaired, 2);
  assert.equal(coverage.latentOpacityHidden.candidate.total, 0);
  assert.equal(coverage.latentOpacityHidden.parityBlockingMismatch, true);
  assert.ok(coverage.unmatched.latentReference.includes(latentIcon.i));
  assert.match(result.stdout, /reference-only latent semantic examples:.*No owner/);
  assert.equal(
    coverage.interactionCoverage.reference.blockers[0].status,
    'potential-hover-not-tested',
  );
});

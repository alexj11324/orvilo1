#!/usr/bin/env node
/**
 * Whole visible-DOM parity coverage with optional explicit inspection pairs.
 *
 * Why this exists next to parity-diff.cjs: that tool left-joins on normalised TEXT, so an
 * element present on both sides always matches and its colour/size/weight/geometry never
 * enter the comparison. Every defect users reported in this project was of exactly that
 * shape — "both sides have it, but it differs". A text-keyed join cannot see them.
 *
 * Every visible element enters a coverage inventory. Unique identity matches receive a
 * deterministic, heuristic property comparison; duplicate or missing matches block strict
 * coverage. Explicit pairs can supplement that scan but cannot bypass identity, behavior, or
 * one-to-one checks. Cross-application semantic equivalence still requires human review.
 *
 * Usage:
 *   node parity-pairs.cjs --reference ref.json --candidate cand.json [--pairs pairs.json]
 *                         [--out table.md] [--coverage-out coverage.json]
 *                         [--require-complete-coverage]
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
const flag = (name) => process.argv.includes(`--${name}`);

const REF = arg('reference', '');
const CAND = arg('candidate', '');
const PAIRS = arg('pairs', '');
const OUT = arg('out', '');
const COVERAGE_OUT = arg('coverage-out', '');
const REQUIRE_COMPLETE_COVERAGE = flag('require-complete-coverage');
const AMBIGUITY_EXAMPLE_LIMIT = 5;
const LEGACY_COVERAGE_SCOPE = 'all-visible-dom-elements';
const LATENT_COVERAGE_SCOPE = 'all-visible-and-opacity-hidden-semantic-elements';
const LEGACY_INTERACTION_SCOPE = 'all-visible-interactive-roots';
const LATENT_INTERACTION_SCOPE = 'all-visible-and-opacity-hidden-semantic-interactive-roots';
if (!REF || !CAND) {
  process.stderr.write(
    'usage: parity-pairs.cjs --reference R.json --candidate C.json [--pairs P.json] ' +
      '[--coverage-out coverage.json] [--require-complete-coverage]\n',
  );
  process.exit(2);
}

const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const refSnap = load(REF);
const candSnap = load(CAND);
const pairs = PAIRS ? load(PAIRS) : [];

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

const normalizedText = (value) =>
  value === undefined || value === null ? '' : String(value).replaceAll(/\s+/g, ' ').trim();

const derivedRegion = (byIndex, el) => {
  let current = el;
  while (current) {
    const tag = normalizedText(current.tag).toLowerCase();
    const role = normalizedText(current.role).toLowerCase();
    if (
      ['main', 'nav', 'aside', 'header', 'footer', 'section', 'article'].includes(tag) ||
      ['main', 'navigation', 'complementary', 'banner', 'contentinfo', 'region', 'search'].includes(
        role,
      )
    ) {
      return {
        i: current.i,
        tag: current.tag ?? null,
        id: current.id ?? null,
        role: current.role ?? null,
        ariaLabel: current.aria?.label ?? null,
      };
    }
    current = byIndex.get(current.parent);
  }
  return { i: null, tag: 'DOCUMENT', id: null, role: 'document', ariaLabel: null };
};

const isOpacityHiddenSemantic = (el) =>
  el?.visible === false &&
  el?.visibility?.state === 'opacity-hidden' &&
  el?.visibility?.geometryBearing === true &&
  el?.visibility?.semantic === true;

const inventoryFrom = (snap) => {
  const elements = snap.elements || [];
  const byIndex = new Map(elements.map((el) => [el.i, el]));
  const hasCollectorInventory = Array.isArray(snap.coverageInventory);
  const source = hasCollectorInventory
    ? snap.coverageInventory
    : elements.filter((el) => el.visible === true || isOpacityHiddenSemantic(el));

  return source.map((raw) => {
    const el = byIndex.get(raw.i) || raw;
    const rawGeometry = raw.geometry || el.fractionalBox || el.box || {};
    const geometry = {
      x: rawGeometry.x,
      y: rawGeometry.y,
      width: rawGeometry.width ?? rawGeometry.w,
      height: rawGeometry.height ?? rawGeometry.h,
    };
    const identity = {
      tag: raw.identity?.tag ?? el.tag ?? null,
      id: raw.identity?.id ?? el.id ?? null,
      role: raw.identity?.role ?? el.role ?? null,
      ariaLabel: raw.identity?.ariaLabel ?? el.aria?.label ?? null,
      dataTestId: raw.identity?.dataTestId ?? null,
      name: raw.identity?.name ?? null,
      type: raw.identity?.type ?? null,
      href: raw.identity?.href ?? el.behavior?.href ?? null,
      ownText: raw.identity?.ownText ?? el.ownText ?? null,
      subtreeText: raw.identity?.subtreeText ?? el.subtreeText ?? null,
      svg:
        raw.identity?.svg ??
        (el.svg
          ? { tag: el.svg.tag ?? null, viewBox: el.svg.viewBox ?? null, path: el.svg.path ?? null }
          : null),
    };
    const issues = [];
    if (!Number.isInteger(raw.i)) issues.push('missing integer element index');
    if (!identity.tag) issues.push('missing tag identity');
    if (![geometry.x, geometry.y, geometry.width, geometry.height].every(Number.isFinite))
      issues.push('missing finite geometry');

    return {
      i: raw.i,
      parent: raw.parent ?? el.parent ?? null,
      depth: raw.depth ?? el.depth ?? null,
      region: raw.region ?? el.region ?? derivedRegion(byIndex, el),
      geometry,
      exposure: raw.exposure ??
        el.visibility ?? {
          state: el.visible === true ? 'visible' : 'unknown',
          geometryBearing: Number.isFinite(geometry.width) && Number.isFinite(geometry.height),
          opacityHiddenBy: null,
          semantic: false,
          semanticReasons: [],
        },
      interactionRootIndex:
        raw.interactionRootIndex ?? el.behavior?.nearestInteractiveAncestor?.i ?? null,
      identity,
      categories: raw.categories ?? {
        interactive: el.behavior?.nearestInteractiveAncestor?.i === el.i,
        svg: Boolean(el.svg),
        svgRoot: el.svg?.tag === 'svg',
        text: Boolean(el.ownText),
        container: false,
        latent: isOpacityHiddenSemantic(el),
      },
      interactionStates: raw.interactionStates ?? {
        hover: 'not-tested',
        focus: 'not-tested',
        click: 'not-tested',
      },
      inventorySource: hasCollectorInventory ? 'collector' : 'derived-from-elements',
      issues,
      status: null,
      match: null,
      ambiguity: null,
    };
  });
};

// Exact uniqueness makes the heuristic deterministic and conservative. Geometry is deliberately
// excluded from the key: using x/y/order to force a match would silently pair duplicate labels or
// structurally different containers. Ambiguous groups remain visible for human review.
const heuristicKey = (item) => {
  const identity = item.identity;
  const regionKind = normalizedText(
    item.region?.role || item.region?.tag || 'document',
  ).toLowerCase();
  return JSON.stringify([
    normalizedText(identity.tag).toLowerCase(),
    normalizedText(identity.role).toLowerCase(),
    normalizedText(identity.ariaLabel),
    normalizedText(identity.name),
    normalizedText(identity.type),
    normalizedText(identity.href),
    normalizedText(identity.ownText),
    normalizedText(identity.subtreeText),
    normalizedText(identity.svg?.tag).toLowerCase(),
    normalizedText(identity.svg?.viewBox),
    normalizedText(identity.svg?.path),
    regionKind,
  ]);
};

const AUTOMATIC_TOLERANCES = Object.freeze({
  geometryCssPixels: 0.5,
  style: 'exact after volatile timestamp/generated-id normalization',
  paint: 'exact after volatile timestamp/generated-id normalization',
  svg: 'exact after volatile timestamp/generated-id normalization',
  pseudo: 'exact after volatile timestamp/generated-id normalization',
});

const normalizeVolatileString = (value) =>
  String(value)
    .replaceAll(
      /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/g,
      '<timestamp>',
    )
    .replaceAll(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      '<uuid>',
    )
    .replaceAll(
      /:r[\w.-]+:|(?:radix|headlessui|react-aria|rc_select)[-_:][\w:.-]+/gi,
      '<generated-id>',
    );

const flattenComparable = (value, prefix = '', output = new Map()) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value).sort();
    if (keys.length === 0 && prefix) output.set(prefix, {});
    for (const key of keys) {
      const path = prefix ? `${prefix}.${key}` : key;
      flattenComparable(value[key], path, output);
    }
    return output;
  }
  if (prefix) output.set(prefix, value);
  return output;
};

const comparablePayload = (element, inventoryItem) => {
  if (!element) return null;
  const svg = element.svg
    ? {
        tag: element.svg.tag,
        viewBox: element.svg.viewBox,
        path: element.svg.path,
        pathData: element.svg.pathData,
        geometry: element.svg.geometry,
        attributes: element.svg.attributes,
        paint: element.svg.paint,
      }
    : null;
  return {
    geometry: {
      fractional: element.fractionalBox ?? inventoryItem.geometry,
      rounded: element.box ?? null,
    },
    identity: inventoryItem.identity ?? null,
    exposure: inventoryItem.exposure
      ? {
          state: inventoryItem.exposure.state,
          geometryBearing: inventoryItem.exposure.geometryBearing,
          semantic: inventoryItem.exposure.semantic,
          semanticReasons: inventoryItem.exposure.semanticReasons,
        }
      : null,
    behavior: element.behavior ?? null,
    style: element.style ?? null,
    paint: element.paint ?? null,
    svg,
    pseudo: element.pseudo ?? null,
  };
};

const compareCapturedProperties = ({
  referenceElement,
  candidateElement,
  referenceItem,
  candidateItem,
}) => {
  const referencePayload = comparablePayload(referenceElement, referenceItem);
  const candidatePayload = comparablePayload(candidateElement, candidateItem);
  if (!referencePayload || !candidatePayload) {
    return {
      status: 'unreadable',
      differenceCount: 0,
      differences: [],
      error: 'paired inventory item is missing its source element',
    };
  }

  const referenceValues = flattenComparable(referencePayload);
  const candidateValues = flattenComparable(candidatePayload);
  const paths = [...new Set([...referenceValues.keys(), ...candidateValues.keys()])].sort();
  const differences = [];

  for (const path of paths) {
    const hasReference = referenceValues.has(path);
    const hasCandidate = candidateValues.has(path);
    const reference = referenceValues.get(path);
    const candidate = candidateValues.get(path);
    const geometryTolerance = path.startsWith('geometry.')
      ? AUTOMATIC_TOLERANCES.geometryCssPixels
      : 0;
    let same = false;
    let normalizedReference = reference;
    let normalizedCandidate = candidate;

    if (hasReference && hasCandidate) {
      if (geometryTolerance > 0 && typeof reference === 'number' && typeof candidate === 'number') {
        same = Math.abs(reference - candidate) <= geometryTolerance;
      } else {
        if (typeof reference === 'string') normalizedReference = normalizeVolatileString(reference);
        if (typeof candidate === 'string') normalizedCandidate = normalizeVolatileString(candidate);
        same = JSON.stringify(normalizedReference) === JSON.stringify(normalizedCandidate);
      }
    }

    if (!same) {
      differences.push({
        path,
        reference: hasReference ? reference : { missing: true },
        candidate: hasCandidate ? candidate : { missing: true },
        normalizedReference,
        normalizedCandidate,
        tolerance: geometryTolerance,
      });
    }
  }

  return {
    status: differences.length > 0 ? 'different' : 'same',
    differenceCount: differences.length,
    differences,
  };
};

const addManualMatch = (map, index, match) => {
  if (!map.has(index)) map.set(index, []);
  map.get(index).push(match);
};

const summarizeInventory = (records) => {
  const count = (status) => records.filter((item) => item.status === status).length;
  const pairedExplicit = count('paired-explicit');
  const pairedHeuristic = count('paired-heuristic');
  return {
    total: records.length,
    paired: pairedExplicit + pairedHeuristic,
    pairedExplicit,
    pairedHeuristic,
    ambiguous: count('ambiguous'),
    unpaired: count('unpaired'),
    unreadable: count('unreadable'),
  };
};

const summarizeLatentOpacityHidden = (records) => {
  const latent = records.filter(
    (item) => item.categories?.latent || item.exposure?.state === 'opacity-hidden',
  );
  return {
    total: latent.length,
    paired: latent.filter((item) => item.status?.startsWith('paired-')).length,
    ambiguous: latent.filter((item) => item.status === 'ambiguous').length,
    unpaired: latent.filter((item) => item.status === 'unpaired').length,
    unreadable: latent.filter((item) => item.status === 'unreadable').length,
  };
};

const describeInventoryItem = (item) => {
  const identity = item.identity || {};
  const label = identity.ariaLabel || identity.ownText || identity.subtreeText;
  const svg = identity.svg
    ? ` svg=${identity.svg.tag || 'svg'}${identity.svg.viewBox ? ` viewBox=${JSON.stringify(identity.svg.viewBox)}` : ''}`
    : '';
  return `#${item.i} ${identity.tag || 'UNKNOWN'}${label ? ` aria/text=${JSON.stringify(label)}` : ''}${svg} reason=${item.exposure?.state || 'unknown'}`;
};

const validateCapture = (snap, label) => {
  const issues = [];
  const elements = Array.isArray(snap?.elements) ? snap.elements : [];
  const meta = snap?.meta;
  const coverage = meta?.coverage;
  const rawInventory = snap?.coverageInventory;

  if (!Array.isArray(snap?.elements)) issues.push(`${label}: elements must be an array`);
  if (elements.length === 0) issues.push(`${label}: elements must not be empty`);
  const elementIndexes = elements.map((item) => item.i);
  const duplicateElementIndexCount = elementIndexes.length - new Set(elementIndexes).size;
  if (duplicateElementIndexCount > 0)
    issues.push(
      `${label}: elements contains ${duplicateElementIndexCount} duplicate element indexes`,
    );
  if (!meta || typeof meta !== 'object') {
    issues.push(`${label}: missing meta object`);
  } else {
    if (!Number.isInteger(meta.elementCount))
      issues.push(`${label}: meta.elementCount must be an integer`);
    else if (meta.elementCount !== elements.length)
      issues.push(
        `${label}: meta.elementCount=${meta.elementCount} does not match elements.length=${elements.length}`,
      );
    if (!Number.isInteger(meta.totalElements))
      issues.push(`${label}: meta.totalElements must be an integer`);
    else if (Number.isInteger(meta.elementCount) && meta.totalElements < meta.elementCount)
      issues.push(`${label}: meta.totalElements is smaller than meta.elementCount`);
    if (typeof meta.truncated !== 'boolean')
      issues.push(`${label}: meta.truncated must be boolean`);
    else if (
      meta.truncated === false &&
      Number.isInteger(meta.totalElements) &&
      Number.isInteger(meta.elementCount) &&
      meta.totalElements !== meta.elementCount
    )
      issues.push(`${label}: non-truncated totalElements does not match elementCount`);
    if (!coverage || typeof coverage !== 'object') {
      issues.push(`${label}: missing meta.coverage`);
    } else {
      if (![LEGACY_COVERAGE_SCOPE, LATENT_COVERAGE_SCOPE].includes(coverage.scope))
        issues.push(`${label}: meta.coverage.scope is unsupported`);
      if (!Number.isInteger(coverage.inventoryCount))
        issues.push(`${label}: meta.coverage.inventoryCount must be an integer`);
      if (typeof coverage.completeCapture !== 'boolean')
        issues.push(`${label}: meta.coverage.completeCapture must be boolean`);
      if (
        typeof meta.truncated === 'boolean' &&
        typeof coverage.completeCapture === 'boolean' &&
        coverage.completeCapture === meta.truncated
      )
        issues.push(`${label}: completeCapture and truncated metadata contradict each other`);
    }
  }

  if (!Array.isArray(rawInventory)) {
    issues.push(`${label}: missing coverageInventory array`);
    return issues;
  }

  if (Number.isInteger(coverage?.inventoryCount) && coverage.inventoryCount !== rawInventory.length)
    issues.push(
      `${label}: meta.coverage.inventoryCount=${coverage.inventoryCount} does not match coverageInventory.length=${rawInventory.length}`,
    );

  const includesLatent = coverage?.scope === LATENT_COVERAGE_SCOPE;
  const expectedIndices = elements
    .filter((item) => item.visible === true || (includesLatent && isOpacityHiddenSemantic(item)))
    .map((item) => item.i);
  const unknownVisibilityCount = elements.filter(
    (item) => typeof item.visible !== 'boolean',
  ).length;
  if (unknownVisibilityCount > 0)
    issues.push(`${label}: ${unknownVisibilityCount} elements have unreadable visibility`);

  const inventoryIndices = rawInventory.map((item) => item.i);
  const inventoryIndexSet = new Set(inventoryIndices);
  const duplicateCount = inventoryIndices.length - inventoryIndexSet.size;
  if (duplicateCount > 0)
    issues.push(`${label}: coverageInventory contains ${duplicateCount} duplicate element indexes`);

  const expectedSet = new Set(expectedIndices);
  const missing = expectedIndices.filter((index) => !inventoryIndexSet.has(index));
  const extra = inventoryIndices.filter((index) => !expectedSet.has(index));
  if (missing.length > 0)
    issues.push(
      `${label}: coverageInventory omits ${missing.length} in-scope elements (examples: ${missing
        .slice(0, AMBIGUITY_EXAMPLE_LIMIT)
        .join(', ')})`,
    );
  if (extra.length > 0)
    issues.push(
      `${label}: coverageInventory includes ${extra.length} elements outside its declared scope (examples: ${extra
        .slice(0, AMBIGUITY_EXAMPLE_LIMIT)
        .join(', ')})`,
    );
  return issues;
};

const REQUIRED_INTERACTION_EDGES = [
  'hover',
  'focus',
  'activate',
  'result-state',
  'options-enumerated',
  'selection-feedback',
  'persistence-or-navigation',
  'error-feedback',
];

const validateInteractionManifest = (snap, inventory, label) => {
  const manifest = snap?.interactionManifest;
  const issues = [];
  const blockers = [];
  const expectedControlIndexes = inventory
    .filter((item) => item.categories.interactive)
    .map((item) => item.i);

  if (!manifest || typeof manifest !== 'object') {
    issues.push(`${label}: missing interactionManifest`);
    blockers.push({
      elementIndex: null,
      edge: 'manifest',
      status: 'missing',
      reason: 'no interaction journey manifest was captured',
    });
    return { complete: false, issues, blockers, controlCount: 0, observedEdgeCount: 0 };
  }
  if (manifest.schemaVersion !== 1)
    issues.push(`${label}: unsupported interactionManifest schemaVersion`);
  if (![LEGACY_INTERACTION_SCOPE, LATENT_INTERACTION_SCOPE].includes(manifest.scope))
    issues.push(`${label}: interactionManifest scope is incomplete`);
  if (!Array.isArray(manifest.controls)) {
    issues.push(`${label}: interactionManifest.controls must be an array`);
    blockers.push({
      elementIndex: null,
      edge: 'manifest',
      status: 'unreadable',
      reason: 'control journey list is unreadable',
    });
    return { complete: false, issues, blockers, controlCount: 0, observedEdgeCount: 0 };
  }

  const controlIndexes = manifest.controls.map((control) => control.elementIndex);
  const duplicateControlCount = controlIndexes.length - new Set(controlIndexes).size;
  if (duplicateControlCount > 0)
    issues.push(
      `${label}: interactionManifest contains ${duplicateControlCount} duplicate controls`,
    );
  const controlIndexSet = new Set(controlIndexes);
  const expectedControlSet = new Set(expectedControlIndexes);
  const missingControls = expectedControlIndexes.filter((index) => !controlIndexSet.has(index));
  const extraControls = controlIndexes.filter((index) => !expectedControlSet.has(index));
  if (missingControls.length > 0)
    issues.push(`${label}: interactionManifest omits ${missingControls.length} visible controls`);
  if (extraControls.length > 0)
    issues.push(
      `${label}: interactionManifest includes ${extraControls.length} non-control elements`,
    );

  let observedEdgeCount = 0;
  for (const control of manifest.controls) {
    if (!Array.isArray(control.edges)) {
      issues.push(`${label}: control ${control.elementIndex} has no readable interaction edges`);
      blockers.push({
        elementIndex: control.elementIndex,
        edge: 'all',
        status: 'unreadable',
        reason: 'interaction edge list is unreadable',
      });
      continue;
    }
    const byEdge = new Map(control.edges.map((edge) => [edge.edge, edge]));
    for (const edgeName of REQUIRED_INTERACTION_EDGES) {
      const edge = byEdge.get(edgeName);
      if (!edge) {
        blockers.push({
          elementIndex: control.elementIndex,
          edge: edgeName,
          status: 'missing',
          reason: 'required interaction edge is absent',
        });
        continue;
      }
      const evidence = Array.isArray(edge.evidence) ? edge.evidence : [];
      const observed = edge.status === 'observed' && evidence.length > 0;
      const provenNotApplicable =
        edge.status === 'not-applicable' && evidence.length > 0 && Boolean(edge.reason);
      if (observed || provenNotApplicable) {
        observedEdgeCount += 1;
      } else {
        blockers.push({
          elementIndex: control.elementIndex,
          edge: edgeName,
          status: edge.status ?? 'unreadable',
          reason:
            edge.status === 'observed'
              ? 'observed status has no evidence'
              : 'explicit journey has not observed this edge',
        });
      }
    }
  }

  if (expectedControlIndexes.length === 0) {
    blockers.push({
      elementIndex: null,
      edge: 'interactive-surface',
      status: 'empty',
      reason:
        'no visible interactive controls were captured; an empty shell is not acceptance evidence',
    });
  }
  if (issues.length > 0) {
    blockers.push({
      elementIndex: null,
      edge: 'manifest-schema',
      status: 'unreadable',
      reason: 'interaction manifest schema or coverage is incomplete',
    });
  }
  return {
    complete: blockers.length === 0,
    issues,
    blockers,
    controlCount: manifest.controls.length,
    observedEdgeCount,
  };
};

const rows = [];
const manualPairResults = [];
const manualRefMatches = new Map();
const manualCandMatches = new Map();
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
    manualPairResults.push({
      what: pair.what,
      status: 'unresolved',
      referenceIndex: r.el?.i ?? null,
      candidateIndex: c.el?.i ?? null,
      error: `ref: ${r.error || 'ok'} / cand: ${c.error || 'ok'}`,
    });
    rows.push({
      what: pair.what,
      error: `ref: ${r.error || 'ok'} / cand: ${c.error || 'ok'}`,
      props: [],
    });
    continue;
  }

  const manualMatch = {
    what: pair.what,
    status: 'resolved',
    referenceIndex: r.el.i,
    candidateIndex: c.el.i,
  };
  manualPairResults.push(manualMatch);
  addManualMatch(manualRefMatches, r.el.i, {
    what: pair.what,
    candidateIndex: c.el.i,
  });
  addManualMatch(manualCandMatches, c.el.i, {
    what: pair.what,
    referenceIndex: r.el.i,
  });

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

const refInventory = inventoryFrom(refSnap);
const candInventory = inventoryFrom(candSnap);
const refInventoryIndexSet = new Set(refInventory.map((item) => item.i));
const candInventoryIndexSet = new Set(candInventory.map((item) => item.i));

// An explicit overlay cannot consume the same visible element more than once. Duplicate
// labels for the same one-to-one pair are fine; distinct counterparts are ambiguous.
const explicitRefTargets = new Map(
  [...manualRefMatches].map(([index, matches]) => [
    index,
    new Set(
      matches
        .map((match) => match.candidateIndex)
        .filter((index) => candInventoryIndexSet.has(index)),
    ),
  ]),
);
const explicitCandSources = new Map(
  [...manualCandMatches].map(([index, matches]) => [
    index,
    new Set(
      matches
        .map((match) => match.referenceIndex)
        .filter((index) => refInventoryIndexSet.has(index)),
    ),
  ]),
);
for (const item of refInventory) {
  const visibleMatches = (manualRefMatches.get(item.i) || []).filter((match) =>
    candInventoryIndexSet.has(match.candidateIndex),
  );
  const targets = explicitRefTargets.get(item.i) || new Set();
  if (item.issues.length > 0) {
    item.status = 'unreadable';
  } else if (
    targets.size > 0 &&
    (targets.size !== 1 || [...targets].some((index) => explicitCandSources.get(index)?.size !== 1))
  ) {
    item.status = 'ambiguous';
    item.ambiguity = {
      groupKey: 'explicit-pair-conflict',
      candidateCount: targets.size,
      candidateExamples: [...targets].slice(0, AMBIGUITY_EXAMPLE_LIMIT),
    };
  } else if (visibleMatches.length > 0) {
    item.status = 'paired-explicit';
    item.match = { method: 'explicit-pair', pairs: visibleMatches };
  }
}
for (const item of candInventory) {
  const visibleMatches = (manualCandMatches.get(item.i) || []).filter((match) =>
    refInventoryIndexSet.has(match.referenceIndex),
  );
  const sources = explicitCandSources.get(item.i) || new Set();
  if (item.issues.length > 0) {
    item.status = 'unreadable';
  } else if (
    sources.size > 0 &&
    (sources.size !== 1 || [...sources].some((index) => explicitRefTargets.get(index)?.size !== 1))
  ) {
    item.status = 'ambiguous';
    item.ambiguity = {
      groupKey: 'explicit-pair-conflict',
      candidateCount: sources.size,
      candidateExamples: [...sources].slice(0, AMBIGUITY_EXAMPLE_LIMIT),
    };
  } else if (visibleMatches.length > 0) {
    item.status = 'paired-explicit';
    item.match = { method: 'explicit-pair', pairs: visibleMatches };
  }
}

const groupByHeuristicKey = (records) => {
  const groups = new Map();
  for (const item of records.filter((record) => record.status === null)) {
    const key = heuristicKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
};

const refGroups = groupByHeuristicKey(refInventory);
const candGroups = groupByHeuristicKey(candInventory);
const allHeuristicKeys = [...new Set([...refGroups.keys(), ...candGroups.keys()])].sort();

for (const key of allHeuristicKeys) {
  const refItems = refGroups.get(key) || [];
  const candItems = candGroups.get(key) || [];
  if (refItems.length === 1 && candItems.length === 1) {
    refItems[0].status = 'paired-heuristic';
    refItems[0].match = {
      method: 'heuristic-exact-unique',
      candidateIndex: candItems[0].i,
    };
    candItems[0].status = 'paired-heuristic';
    candItems[0].match = {
      method: 'heuristic-exact-unique',
      referenceIndex: refItems[0].i,
    };
    continue;
  }
  if (refItems.length > 0 && candItems.length > 0) {
    for (const item of refItems) {
      item.status = 'ambiguous';
      item.ambiguity = {
        groupKey: key,
        candidateCount: candItems.length,
        candidateExamples: candItems
          .slice(0, AMBIGUITY_EXAMPLE_LIMIT)
          .map((candidate) => candidate.i),
      };
    }
    for (const item of candItems) {
      item.status = 'ambiguous';
      item.ambiguity = {
        groupKey: key,
        candidateCount: refItems.length,
        candidateExamples: refItems
          .slice(0, AMBIGUITY_EXAMPLE_LIMIT)
          .map((candidate) => candidate.i),
      };
    }
    continue;
  }
  for (const item of [...refItems, ...candItems]) item.status = 'unpaired';
}

const refInventoryByIndex = new Map(refInventory.map((item) => [item.i, item]));
const candInventoryByIndex = new Map(candInventory.map((item) => [item.i, item]));
const refElementsByIndex = new Map((refSnap.elements || []).map((item) => [item.i, item]));
const candElementsByIndex = new Map((candSnap.elements || []).map((item) => [item.i, item]));
const comparisonRequests = new Map();

for (const pair of manualPairResults.filter((item) => item.status === 'resolved')) {
  if (
    !refInventoryByIndex.has(pair.referenceIndex) ||
    !candInventoryByIndex.has(pair.candidateIndex)
  )
    continue;
  const key = `${pair.referenceIndex}:${pair.candidateIndex}`;
  if (!comparisonRequests.has(key)) {
    comparisonRequests.set(key, {
      referenceIndex: pair.referenceIndex,
      candidateIndex: pair.candidateIndex,
      pairingMethod: 'explicit-pair',
      labels: [],
    });
  }
  comparisonRequests.get(key).labels.push(pair.what);
}
for (const item of refInventory.filter((record) => record.status === 'paired-heuristic')) {
  const key = `${item.i}:${item.match.candidateIndex}`;
  comparisonRequests.set(key, {
    referenceIndex: item.i,
    candidateIndex: item.match.candidateIndex,
    pairingMethod: 'heuristic-exact-unique',
    labels: [],
  });
}

const capturedPropertyComparisons = [...comparisonRequests.values()]
  .sort((a, b) => a.referenceIndex - b.referenceIndex || a.candidateIndex - b.candidateIndex)
  .map((request) => ({
    ...request,
    ...compareCapturedProperties({
      referenceElement: refElementsByIndex.get(request.referenceIndex),
      candidateElement: candElementsByIndex.get(request.candidateIndex),
      referenceItem: refInventoryByIndex.get(request.referenceIndex),
      candidateItem: candInventoryByIndex.get(request.candidateIndex),
    }),
  }));
const capturedPropertyDifferenceCount = capturedPropertyComparisons.reduce(
  (sum, comparison) => sum + comparison.differenceCount,
  0,
);
const differingCapturedPropertyPairs = capturedPropertyComparisons.filter(
  (comparison) => comparison.status === 'different',
).length;
const unreadableCapturedPropertyPairs = capturedPropertyComparisons.filter(
  (comparison) => comparison.status === 'unreadable',
).length;

const refCoverageSummary = summarizeInventory(refInventory);
const candCoverageSummary = summarizeInventory(candInventory);
const refLatentSummary = summarizeLatentOpacityHidden(refInventory);
const candLatentSummary = summarizeLatentOpacityHidden(candInventory);
const referenceOnlyLatent = refInventory.filter(
  (item) =>
    (item.categories?.latent || item.exposure?.state === 'opacity-hidden') &&
    item.status === 'unpaired',
);
const candidateOnlyLatent = candInventory.filter(
  (item) =>
    (item.categories?.latent || item.exposure?.state === 'opacity-hidden') &&
    item.status === 'unpaired',
);
const incompleteLatent = [...refInventory, ...candInventory].filter(
  (item) =>
    (item.categories?.latent || item.exposure?.state === 'opacity-hidden') &&
    ['ambiguous', 'unpaired', 'unreadable'].includes(item.status),
);
const latentCapturedPropertyMismatch = capturedPropertyComparisons.some((comparison) => {
  const referenceItem = refInventoryByIndex.get(comparison.referenceIndex);
  const candidateItem = candInventoryByIndex.get(comparison.candidateIndex);
  const includesLatent = [referenceItem, candidateItem].some(
    (item) => item?.categories?.latent || item?.exposure?.state === 'opacity-hidden',
  );
  return includesLatent && comparison.status !== 'same';
});
const latentParityMismatch = incompleteLatent.length > 0 || latentCapturedPropertyMismatch;
const captureValidation = {
  reference: validateCapture(refSnap, 'reference'),
  candidate: validateCapture(candSnap, 'candidate'),
};
const captureIssues = [...captureValidation.reference, ...captureValidation.candidate];
if (refSnap.meta?.coverage?.scope !== candSnap.meta?.coverage?.scope) {
  captureIssues.push(
    'reference and candidate coverage scopes differ; recapture both snapshots with the current collector',
  );
}
const interactionValidation = {
  reference: validateInteractionManifest(refSnap, refInventory, 'reference'),
  candidate: validateInteractionManifest(candSnap, candInventory, 'candidate'),
};
if (refSnap.meta?.truncated || refSnap.meta?.coverage?.completeCapture === false)
  captureIssues.push('reference snapshot was truncated before every DOM element was captured');
if (candSnap.meta?.truncated || candSnap.meta?.coverage?.completeCapture === false)
  captureIssues.push('candidate snapshot was truncated before every DOM element was captured');

const incompleteStatuses = ['ambiguous', 'unpaired', 'unreadable'];
const inventoryCoverageComplete =
  captureIssues.length === 0 &&
  incompleteStatuses.every(
    (status) =>
      !refInventory.some((item) => item.status === status) &&
      !candInventory.some((item) => item.status === status),
  );
const capturedPropertyComparisonComplete =
  capturedPropertyDifferenceCount === 0 && unreadableCapturedPropertyPairs === 0;
const interactionCoverageComplete =
  interactionValidation.reference.complete && interactionValidation.candidate.complete;
const interactionBlockerCount =
  interactionValidation.reference.blockers.length + interactionValidation.candidate.blockers.length;
const coverageComplete =
  inventoryCoverageComplete && capturedPropertyComparisonComplete && interactionCoverageComplete;
const coverageReport = {
  schemaVersion: 1,
  scope:
    refSnap.meta?.coverage?.scope === candSnap.meta?.coverage?.scope
      ? refSnap.meta?.coverage?.scope
      : 'mixed-declared-scopes',
  certified: false,
  completeMeaning:
    'Every captured visible element and every geometry-bearing semantic element hidden only by opacity has one explicit or unique heuristic candidate, those pairs have no captured-property differences, and every inventoried control has evidence for every required interaction edge; this remains heuristic evidence, not parity certification.',
  pairingModel: {
    explicitPairs: 'explanatory overlay',
    automaticPairs: 'heuristic exact-identity candidates; not certified cross-application matches',
  },
  complete: coverageComplete,
  inventoryComplete: inventoryCoverageComplete,
  capturedPropertyComparisonComplete,
  interactionCoverageComplete,
  strictRequested: REQUIRE_COMPLETE_COVERAGE,
  captureIssues,
  captureValidation,
  summary: {
    reference: refCoverageSummary,
    candidate: candCoverageSummary,
    capturedProperties: {
      comparedPairs: capturedPropertyComparisons.length,
      differingPairs: differingCapturedPropertyPairs,
      unreadablePairs: unreadableCapturedPropertyPairs,
      differences: capturedPropertyDifferenceCount,
    },
  },
  latentOpacityHidden: {
    meaning:
      'Geometry-bearing semantic DOM that exists at rest but is hidden by its own or an ancestor opacity:0. Potential hover reveal is unverified until a journey supplies evidence.',
    reference: refLatentSummary,
    candidate: candLatentSummary,
    parityBlockingMismatch: latentParityMismatch,
    referenceOnlyExamples: referenceOnlyLatent.slice(0, AMBIGUITY_EXAMPLE_LIMIT).map((item) => ({
      elementIndex: item.i,
      identity: item.identity,
      exposure: item.exposure,
      geometry: item.geometry,
      reason: 'reference-only opacity-hidden semantic element',
    })),
    candidateOnlyExamples: candidateOnlyLatent.slice(0, AMBIGUITY_EXAMPLE_LIMIT).map((item) => ({
      elementIndex: item.i,
      identity: item.identity,
      exposure: item.exposure,
      geometry: item.geometry,
      reason: 'candidate-only opacity-hidden semantic element',
    })),
  },
  comparisonContract: {
    fields: ['geometry', 'identity', 'exposure', 'behavior', 'style', 'paint', 'svg', 'pseudo'],
    tolerances: AUTOMATIC_TOLERANCES,
    normalizationRules: [
      'ISO-8601 timestamps are replaced with <timestamp>',
      'UUIDs are replaced with <uuid>',
      'React/Radix/Headless UI/React Aria/rc-select generated ids are replaced with <generated-id>',
    ],
  },
  capturedPropertyComparisons,
  unmatched: {
    reference: refInventory.filter((item) => item.status === 'unpaired').map((item) => item.i),
    candidate: candInventory.filter((item) => item.status === 'unpaired').map((item) => item.i),
    latentReference: referenceOnlyLatent.map((item) => item.i),
    latentCandidate: candidateOnlyLatent.map((item) => item.i),
  },
  ambiguous: {
    reference: refInventory.filter((item) => item.status === 'ambiguous').map((item) => item.i),
    candidate: candInventory.filter((item) => item.status === 'ambiguous').map((item) => item.i),
  },
  unreadable: {
    reference: refInventory.filter((item) => item.status === 'unreadable').map((item) => item.i),
    candidate: candInventory.filter((item) => item.status === 'unreadable').map((item) => item.i),
    capture: captureIssues,
  },
  interactionStateCoverage: {
    reference: refSnap.meta?.coverage?.interactionStateCoverage ?? {
      hover: 'not-tested',
      focus: 'not-tested',
      click: 'not-tested',
    },
    candidate: candSnap.meta?.coverage?.interactionStateCoverage ?? {
      hover: 'not-tested',
      focus: 'not-tested',
      click: 'not-tested',
    },
  },
  interactionCoverage: {
    complete: interactionCoverageComplete,
    requiredEdges: REQUIRED_INTERACTION_EDGES,
    reference: interactionValidation.reference,
    candidate: interactionValidation.candidate,
  },
  inventories: {
    reference: refInventory,
    candidate: candInventory,
  },
  manualPairs: manualPairResults,
  limitations: [
    'Automatic pairing is a deterministic candidate heuristic, not proof that two elements have the same product meaning.',
    'Static capture does not exercise hover, focus, click, keyboard, delayed, or mutation states.',
    'potential-hover-not-tested means opacity-hidden semantic content shares a control relationship; it does not prove hover is the reveal trigger.',
    'Untested interaction edges are strict blockers; this comparator does not click controls or manufacture journey evidence.',
    'The collector inventories rendered light-DOM elements only; iframe and shadow-root contents require separate capture.',
    'Virtualized or conditional elements that are not rendered in the captured state are outside this inventory.',
  ],
};

if (COVERAGE_OUT) {
  fs.writeFileSync(COVERAGE_OUT, `${JSON.stringify(coverageReport, null, 2)}\n`);
  process.stderr.write(`wrote ${COVERAGE_OUT}\n`);
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
  '## Full visible-DOM coverage',
  '',
  `reference: total ${refCoverageSummary.total} · paired ${refCoverageSummary.paired} ` +
    `(explicit ${refCoverageSummary.pairedExplicit}, heuristic ${refCoverageSummary.pairedHeuristic}) · ` +
    `ambiguous ${refCoverageSummary.ambiguous} · unpaired ${refCoverageSummary.unpaired} · ` +
    `unreadable ${refCoverageSummary.unreadable}`,
  `candidate: total ${candCoverageSummary.total} · paired ${candCoverageSummary.paired} ` +
    `(explicit ${candCoverageSummary.pairedExplicit}, heuristic ${candCoverageSummary.pairedHeuristic}) · ` +
    `ambiguous ${candCoverageSummary.ambiguous} · unpaired ${candCoverageSummary.unpaired} · ` +
    `unreadable ${candCoverageSummary.unreadable}`,
  `opacity-hidden semantic inventory: reference total ${refLatentSummary.total} · paired ${refLatentSummary.paired} · ` +
    `ambiguous ${refLatentSummary.ambiguous} · unpaired ${refLatentSummary.unpaired} · unreadable ${refLatentSummary.unreadable}; ` +
    `candidate total ${candLatentSummary.total} · paired ${candLatentSummary.paired} · ` +
    `ambiguous ${candLatentSummary.ambiguous} · unpaired ${candLatentSummary.unpaired} · unreadable ${candLatentSummary.unreadable}`,
  referenceOnlyLatent.length > 0
    ? `reference-only latent semantic examples: ${referenceOnlyLatent
        .slice(0, AMBIGUITY_EXAMPLE_LIMIT)
        .map(describeInventoryItem)
        .join(' · ')}`
    : 'reference-only latent semantic examples: none',
  candidateOnlyLatent.length > 0
    ? `candidate-only latent semantic examples: ${candidateOnlyLatent
        .slice(0, AMBIGUITY_EXAMPLE_LIMIT)
        .map(describeInventoryItem)
        .join(' · ')}`
    : 'candidate-only latent semantic examples: none',
  `inventory complete: ${inventoryCoverageComplete ? 'yes' : 'no'}`,
  `captured-property comparisons: ${capturedPropertyComparisons.length} pairs · ` +
    `differing pairs ${differingCapturedPropertyPairs} · differences ${capturedPropertyDifferenceCount} · ` +
    `unreadable pairs ${unreadableCapturedPropertyPairs}`,
  `interaction journeys: ${interactionCoverageComplete ? 'complete' : 'incomplete'} · blockers ${interactionBlockerCount}`,
  `strict result complete: ${coverageComplete ? 'yes' : 'no'} · strict requested: ${REQUIRE_COMPLETE_COVERAGE ? 'yes' : 'no'}`,
  'interaction states: hover not-tested · focus not-tested · click not-tested; opacity-hidden reveal candidates potential-hover-not-tested',
  'automatic candidates are heuristic and do not certify cross-application semantic equivalence',
  COVERAGE_OUT
    ? `machine-readable detail: ${COVERAGE_OUT}`
    : 'machine-readable detail: not requested',
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
  `pairs=${pairs.length} diffs=${diffs} unresolved=${unresolved} unreadable=${unreadable} ` +
    `coverage_complete=${coverageComplete} ref_unpaired=${refCoverageSummary.unpaired} ` +
    `cand_unpaired=${candCoverageSummary.unpaired} ref_ambiguous=${refCoverageSummary.ambiguous} ` +
    `cand_ambiguous=${candCoverageSummary.ambiguous} captured_diffs=${capturedPropertyDifferenceCount} ` +
    `captured_unreadable=${unreadableCapturedPropertyPairs} latent_mismatch=${latentParityMismatch} ` +
    `interaction_blockers=${interactionBlockerCount}\n`,
);
// Every differing, unresolved, unreadable, or invalid capture fails the parity gate.
// Inventory gaps become a gate only when explicitly requested so existing pair-only workflows keep
// their previous behavior while still printing their actual coverage. Invalid or mixed capture
// scopes and latent semantic mismatches always fail: either could hide an unmeasured icon.
process.exit(
  diffs > 0 ||
    unresolved > 0 ||
    unreadable > 0 ||
    captureIssues.length > 0 ||
    latentParityMismatch ||
    (REQUIRE_COMPLETE_COVERAGE && !coverageComplete)
    ? 1
    : 0,
);

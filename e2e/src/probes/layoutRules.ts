import type { Locator, Page } from '@playwright/test';

/**
 * Layout-rule probe: Galen-style assertions about how a region is laid out,
 * checked on real geometry. Unit tests (happy-dom) have no layout, and a
 * static screenshot only shows the state it was taken in — the issue rail's
 * assignee row was centred only while the task was running, because a blocked
 * picker wrapped the row in an inline span that shrank its `width: 100%` to
 * the content, and the trigger's `justify-content: center` then parked it
 * mid-rail. Every rule below is a pure function over sampled numbers, so each
 * one is unit-tested on constructed data; the page only supplies the samples.
 */

export type LayoutRuleId =
  | 'centered-in-full-row'
  | 'clipped-text'
  | 'date-format'
  | 'hover-glyph'
  | 'sibling-edge'
  | 'type-scale';

export type LayoutSeverity = 'error' | 'warning';

export interface LayoutViolation {
  detail: string;
  rule: LayoutRuleId;
  selector: string;
  severity: LayoutSeverity;
}

export interface HorizontalBox {
  left: number;
  width: number;
}

export interface RowSample {
  /**
   * The row as drawn: the outer box, descended through single-child wrappers
   * that do not start a new line (an inline or `display: contents` span, or a
   * trigger `div` exactly as tall as its only child). This is the box whose
   * edge a user sees.
   */
  box: HorizontalBox;
  /** Left edge of the leftmost visible text or icon inside the row, if any. */
  contentLeft: number | null;
  /** The container's own child — the slot the row occupies. */
  outer: HorizontalBox;
  selector: string;
}

export interface RowScopeSample {
  /** Content box of the container (padding and border removed). */
  container: HorizontalBox;
  rows: RowSample[];
  scope: string;
}

export interface TextSample {
  fontSize: number;
  fontWeight: string;
  selector: string;
  text: string;
}

export interface OverflowSample {
  clientWidth: number;
  scrollWidth: number;
  selector: string;
  text: string;
  textOverflow: string;
}

export interface LayoutSample {
  overflow: OverflowSample[];
  rowScopes: RowScopeSample[];
  texts: TextSample[];
}

// ─── sibling-edge ────────────────────────────────────────────────────────────

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * The value most rows agree on (within `tolerance`). Ties go to `preferred`'s
 * pick — a row stack of two that disagree has no majority, and the caller
 * knows which edge the design intends (the container's).
 */
const consensus = (
  values: number[],
  tolerance: number,
  preferred: (a: number, b: number) => number,
): number => {
  let best = values[0];
  let bestCount = 0;
  for (const candidate of values) {
    const count = values.filter((value) => Math.abs(value - candidate) <= tolerance).length;
    if (count > bestCount || (count === bestCount && preferred(candidate, best) < 0)) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
};

export interface SiblingEdgeOptions {
  /** Pixels a row may deviate from the consensus. Default 1. */
  tolerance?: number;
}

/**
 * Rows stacked in one container share a left edge and a width. A row that
 * deviates is reported with its offset from the consensus of its siblings.
 */
export const checkSiblingEdges = (
  scope: RowScopeSample,
  { tolerance = 1 }: SiblingEdgeOptions = {},
): LayoutViolation[] => {
  if (scope.rows.length < 2) return [];
  const lefts = scope.rows.map((row) => row.box.left);
  const widths = scope.rows.map((row) => row.box.width);
  const nearContainerLeft = (a: number, b: number) =>
    Math.abs(a - scope.container.left) - Math.abs(b - scope.container.left);
  const wider = (a: number, b: number) => b - a;
  const left = consensus(lefts, tolerance, nearContainerLeft);
  const width = consensus(widths, tolerance, wider);

  return scope.rows.flatMap((row) => {
    const dx = row.box.left - left;
    const dw = row.box.width - width;
    if (Math.abs(dx) <= tolerance && Math.abs(dw) <= tolerance) return [];
    const parts = [
      Math.abs(dx) > tolerance ? `left ${round(dx) > 0 ? '+' : ''}${round(dx)}px` : '',
      Math.abs(dw) > tolerance ? `width ${round(dw) > 0 ? '+' : ''}${round(dw)}px` : '',
    ].filter(Boolean);
    return [
      {
        detail: `${parts.join(', ')} vs siblings (left ${round(left)}, width ${round(width)})`,
        rule: 'sibling-edge' as const,
        selector: row.selector,
        severity: 'error' as const,
      },
    ];
  });
};

// ─── centered-in-full-row ────────────────────────────────────────────────────

export interface CenteredInFullRowOptions {
  /** A row at least this share of the container's width is "full". Default 0.95. */
  fullRowRatio?: number;
  /** Content starting further in than this share of the row is centred. Default 0.25. */
  maxContentInset?: number;
}

/**
 * A full-width row whose content starts near the middle is centring content
 * that should be left-aligned — the shape of the running-issue rail bug, where
 * the row's slot still spans the rail but its content drifts to the centre.
 */
export const checkCenteredInFullRow = (
  scope: RowScopeSample,
  { fullRowRatio = 0.95, maxContentInset = 0.25 }: CenteredInFullRowOptions = {},
): LayoutViolation[] =>
  scope.rows.flatMap((row) => {
    if (row.contentLeft === null) return [];
    if (row.outer.width < scope.container.width * fullRowRatio) return [];
    const inset = row.contentLeft - row.outer.left;
    if (inset <= row.outer.width * maxContentInset) return [];
    return [
      {
        detail: `content starts ${round(inset)}px into a ${round(row.outer.width)}px row (${Math.round(
          (inset / row.outer.width) * 100,
        )}%, limit ${Math.round(maxContentInset * 100)}%)`,
        rule: 'centered-in-full-row' as const,
        selector: row.selector,
        severity: 'error' as const,
      },
    ];
  });

// ─── clipped-text ────────────────────────────────────────────────────────────

/** Text wider than its box that is cut without an ellipsis to say so. */
export const checkClippedText = (samples: OverflowSample[]): LayoutViolation[] =>
  samples.flatMap((sample) => {
    if (sample.scrollWidth <= sample.clientWidth + 1) return [];
    if (sample.textOverflow === 'ellipsis') return [];
    return [
      {
        detail: `scrollWidth ${sample.scrollWidth} > clientWidth ${sample.clientWidth} with text-overflow: ${sample.textOverflow} — "${sample.text}"`,
        rule: 'clipped-text' as const,
        selector: sample.selector,
        severity: 'error' as const,
      },
    ];
  });

// ─── type-scale ──────────────────────────────────────────────────────────────

/** `"13px/500"` — font size and weight of one text run. */
export const typeScaleKey = (sample: Pick<TextSample, 'fontSize' | 'fontWeight'>) =>
  `${round(sample.fontSize)}px/${sample.fontWeight}`;

export interface TypeScaleEntry {
  count: number;
  example: string;
  key: string;
}

export interface TypeScaleResult {
  /** Every (size, weight) combination in use, most frequent first. */
  histogram: TypeScaleEntry[];
  violations: LayoutViolation[];
}

/**
 * Tally the (font-size, font-weight) combinations a region uses. With an
 * allowed set, every run outside it is a violation; without one this is an
 * inventory only.
 */
export const checkTypeScale = (samples: TextSample[], allowed?: string[]): TypeScaleResult => {
  const counts = new Map<string, TypeScaleEntry>();
  for (const sample of samples) {
    const key = typeScaleKey(sample);
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { count: 1, example: sample.text, key });
  }
  const histogram = [...counts.values()].sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key),
  );
  if (!allowed) return { histogram, violations: [] };

  const allowedSet = new Set(allowed);
  const violations = samples.flatMap((sample) => {
    const key = typeScaleKey(sample);
    if (allowedSet.has(key)) return [];
    return [
      {
        detail: `${key} is outside the type scale (${allowed.join(', ')}) — "${sample.text}"`,
        rule: 'type-scale' as const,
        selector: sample.selector,
        severity: 'warning' as const,
      },
    ];
  });
  return { histogram, violations };
};

// ─── date-format ─────────────────────────────────────────────────────────────

const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;

/** Raw ISO dates in visible text: the UI should show a localized date. */
export const checkDateFormat = (samples: TextSample[]): LayoutViolation[] =>
  samples.flatMap((sample) => {
    const matches = sample.text.match(ISO_DATE);
    if (!matches) return [];
    return [
      {
        detail: `ISO date ${matches.join(', ')} shown raw — "${sample.text}"`,
        rule: 'date-format' as const,
        selector: sample.selector,
        severity: 'error' as const,
      },
    ];
  });

// ─── hover-glyph ─────────────────────────────────────────────────────────────

export interface GlyphState {
  /** Opacity after multiplying every ancestor's, up to the document. */
  opacity: number;
  visible: boolean;
}

export interface HoverGlyphSample {
  after: GlyphState[];
  before: GlyphState[];
  selector: string;
}

/**
 * Hover must not take a glyph away: an icon that fades out (or unmounts) when
 * the pointer arrives reads as the control changing its mind.
 */
export const checkHoverGlyphs = (samples: HoverGlyphSample[]): LayoutViolation[] =>
  samples.flatMap((sample) => {
    const visibleBefore = sample.before.filter((glyph) => glyph.visible).length;
    const visibleAfter = sample.after.filter((glyph) => glyph.visible).length;
    const faded = sample.before.flatMap((glyph, index) =>
      glyph.visible && sample.after[index] && !sample.after[index].visible ? [index] : [],
    );
    if (visibleAfter >= visibleBefore && faded.length === 0) return [];
    return [
      {
        detail:
          `visible svg ${visibleBefore} → ${visibleAfter} on hover` +
          (faded.length > 0 ? `; hidden: #${faded.join(', #')}` : ''),
        rule: 'hover-glyph' as const,
        selector: sample.selector,
        severity: 'error' as const,
      },
    ];
  });

// ─── evaluation + report ─────────────────────────────────────────────────────

export type StaticLayoutRuleId = Exclude<LayoutRuleId, 'hover-glyph'>;

export interface LayoutRuleOptions {
  /** Allowed `"<size>px/<weight>"` keys for `type-scale`; omit for an inventory only. */
  allowedTypeScale?: string[];
  centered?: CenteredInFullRowOptions;
  /** Rules to evaluate. Default: every static rule. */
  rules?: StaticLayoutRuleId[];
  siblingEdge?: SiblingEdgeOptions;
}

export const STATIC_LAYOUT_RULES: StaticLayoutRuleId[] = [
  'sibling-edge',
  'centered-in-full-row',
  'clipped-text',
  'type-scale',
  'date-format',
];

export interface LayoutRuleResult {
  typeScale: TypeScaleEntry[];
  violations: LayoutViolation[];
}

export const evaluateLayoutRules = (
  sample: LayoutSample,
  options: LayoutRuleOptions = {},
): LayoutRuleResult => {
  const rules = new Set(options.rules ?? STATIC_LAYOUT_RULES);
  const violations: LayoutViolation[] = [];
  for (const scope of sample.rowScopes) {
    if (rules.has('sibling-edge'))
      violations.push(...checkSiblingEdges(scope, options.siblingEdge));
    if (rules.has('centered-in-full-row'))
      violations.push(...checkCenteredInFullRow(scope, options.centered));
  }
  if (rules.has('clipped-text')) violations.push(...checkClippedText(sample.overflow));
  const typeScale = checkTypeScale(sample.texts, options.allowedTypeScale);
  if (rules.has('type-scale')) violations.push(...typeScale.violations);
  if (rules.has('date-format')) violations.push(...checkDateFormat(sample.texts));
  return { typeScale: typeScale.histogram, violations };
};

export const formatViolations = (violations: LayoutViolation[]): string => {
  if (violations.length === 0) return 'No layout-rule violations.';
  const lines = violations.map(
    (violation) =>
      `  [${violation.severity}] ${violation.rule} ${violation.selector}\n      ${violation.detail}`,
  );
  return `${violations.length} layout-rule violation(s):\n${lines.join('\n')}`;
};

// ─── page-side collection ────────────────────────────────────────────────────

// Shared helpers, injected as source text (not functions): the tsx transform
// wraps named inner functions in a `__name` helper that does not exist in the
// page. Also usable verbatim from a CDP `Runtime.evaluate`.
const PAGE_HELPERS = `
  const describe = (el) => {
    if (!el) return 'nothing';
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    const data = [...el.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'aria-label' || a.name === 'role').slice(0, 2).map((a) => a.name + '=' + a.value.slice(0, 40)).join(',');
    const text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 32);
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (data ? '[' + data + ']' : '') + (text ? ' "' + text + '"' : '');
  };
  const shown = (el) => {
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  };
  const isTransparentBox = (el) => {
    const display = getComputedStyle(el).display;
    return display === 'contents' || display === 'inline';
  };
  // Children as layout sees them: a display: contents child is replaced by its own children.
  const layoutChildren = (el) => [...el.children].flatMap((child) => {
    const display = getComputedStyle(child).display;
    if (display === 'none') return [];
    if (display === 'contents') return layoutChildren(child);
    return [child];
  });
  const hasOwnText = (el) => [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
`;

/**
 * Samples one scope for every static rule. Rows are the scope's layout
 * children; `ignoreTextSelector` drops text inside matching elements from the
 * text rules (code blocks, identifiers meant to be copied verbatim).
 */
export const layoutSampleScript = (scopeSelector: string, ignoreTextSelector?: string) => `(() => {
  ${PAGE_HELPERS}
  const ignore = ${JSON.stringify(ignoreTextSelector ?? '')};
  const drawnBox = (el) => {
    let current = el;
    for (;;) {
      if (hasOwnText(current)) return current;
      const kids = layoutChildren(current);
      if (kids.length !== 1) return current;
      const child = kids[0];
      const tall = child.getBoundingClientRect().height >= current.getBoundingClientRect().height - 1;
      if (!(isTransparentBox(current) || isTransparentBox(child) || tall)) return current;
      current = child;
    }
  };
  const contentLeft = (el) => {
    let left = Infinity;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || !shown(node.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) if (rect.width > 0) left = Math.min(left, rect.left);
    }
    for (const glyph of el.querySelectorAll('svg, img, canvas')) {
      const rect = glyph.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && shown(glyph)) left = Math.min(left, rect.left);
    }
    return left === Infinity ? null : left;
  };
  const rowScopes = [];
  const overflow = [];
  const texts = [];
  for (const scope of document.querySelectorAll(${JSON.stringify(scopeSelector)})) {
    if (!shown(scope)) continue;
    const rect = scope.getBoundingClientRect();
    const style = getComputedStyle(scope);
    const padLeft = parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
    const padRight = parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth);
    const rows = [];
    for (const child of layoutChildren(scope)) {
      const outerRect = child.getBoundingClientRect();
      if (outerRect.width < 1 || outerRect.height < 1 || !shown(child)) continue;
      const drawn = drawnBox(child).getBoundingClientRect();
      rows.push({
        box: { left: drawn.left, width: drawn.width },
        contentLeft: contentLeft(child),
        outer: { left: outerRect.left, width: outerRect.width },
        selector: describe(child),
      });
    }
    rowScopes.push({ container: { left: rect.left + padLeft, width: rect.width - padLeft - padRight }, rows, scope: describe(scope) });

    for (const el of scope.querySelectorAll('*')) {
      if (isTransparentBox(el) || !shown(el) || el.clientWidth === 0) continue;
      const inlineText = hasOwnText(el) || [...el.children].some((child) => isTransparentBox(child) && (child.textContent || '').trim());
      if (!inlineText) continue;
      overflow.push({
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        selector: describe(el),
        text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80),
        textOverflow: getComputedStyle(el).textOverflow,
      });
    }

    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      const text = node.textContent.trim().replace(/\\s+/g, ' ');
      if (!text || !parent || !shown(parent) || (ignore && parent.closest(ignore))) continue;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (![...range.getClientRects()].some((r) => r.width > 0 && r.height > 0)) continue;
      const style = getComputedStyle(parent);
      texts.push({ fontSize: parseFloat(style.fontSize), fontWeight: style.fontWeight, selector: describe(parent), text: text.slice(0, 120) });
    }
  }
  return { overflow, rowScopes, texts };
})()`;

export const collectLayoutSample = async (
  page: Page,
  scopeSelector: string,
  { ignoreTextSelector }: { ignoreTextSelector?: string } = {},
): Promise<LayoutSample> =>
  (await page.evaluate(layoutSampleScript(scopeSelector, ignoreTextSelector))) as LayoutSample;

/**
 * Sample `scopeSelector` and evaluate the static rules. The sample comes back
 * too, so a caller can assert it actually measured something — "0 violations"
 * over zero rows proves nothing.
 */
export const runLayoutRules = async (
  page: Page,
  scopeSelector: string,
  options: LayoutRuleOptions & { ignoreTextSelector?: string } = {},
): Promise<LayoutRuleResult & { sample: LayoutSample }> => {
  const sample = await collectLayoutSample(page, scopeSelector, options);
  return { ...evaluateLayoutRules(sample, options), sample };
};

// ─── hover-glyph (interactive) ───────────────────────────────────────────────

const PROBE_ATTR = 'data-layout-probe-hover';

const glyphStateScript = (id: string) => `(() => {
  const el = document.querySelector('[${PROBE_ATTR}="${id}"]');
  if (!el) return [];
  return [...el.querySelectorAll('svg')].map((svg) => {
    let opacity = 1;
    let hidden = false;
    for (let node = svg; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      opacity *= Number(style.opacity);
      if (style.display === 'none' || style.visibility === 'hidden') hidden = true;
    }
    const rect = svg.getBoundingClientRect();
    return { opacity, visible: !hidden && opacity > 0.01 && rect.width > 0 && rect.height > 0 };
  });
})()`;

/**
 * Hover each element `target` matches and compare its svg glyphs before and
 * after. `settleMs` covers opacity transitions (the pointer lands, the glyph
 * fades over ~200ms).
 */
export const probeHoverGlyphs = async (
  page: Page,
  target: Locator,
  { settleMs = 400 }: { settleMs?: number } = {},
): Promise<{ checked: string[]; violations: LayoutViolation[] }> => {
  const samples: HoverGlyphSample[] = [];
  const elements = await target.all();
  for (const [index, element] of elements.entries()) {
    const id = `glyph-${index}`;
    await element.evaluate((el, [attr, value]) => el.setAttribute(attr, value), [PROBE_ATTR, id]);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(settleMs);
    const before = (await page.evaluate(glyphStateScript(id))) as GlyphState[];
    await element.hover();
    await page.waitForTimeout(settleMs);
    const after = (await page.evaluate(glyphStateScript(id))) as GlyphState[];
    const selector = (await page.evaluate(
      `(() => { ${PAGE_HELPERS} return describe(document.querySelector('[${PROBE_ATTR}="${id}"]')); })()`,
    )) as string;
    await element.evaluate((el, attr) => el.removeAttribute(attr), PROBE_ATTR);
    samples.push({ after, before, selector });
  }
  return {
    checked: samples.map((sample) => sample.selector),
    violations: checkHoverGlyphs(samples),
  };
};

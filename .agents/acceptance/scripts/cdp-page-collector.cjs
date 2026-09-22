#!/usr/bin/env node
/**
 * Build the expression evaluated in a browser page by the CDP collectors.
 *
 * Keep this page-side and dependency-free: the same expression can be sent through raw CDP,
 * Brave's connector, or a small DOM fixture in a regression test. It deliberately observes
 * interaction metadata only; it never dispatches an event or changes page state.
 */

const STYLE_PROPS = [
  'color',
  'backgroundColor',
  'backgroundImage',
  'font',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'fontStretch',
  'fontSizeAdjust',
  'fontKerning',
  'fontFeatureSettings',
  'fontVariationSettings',
  'fontSynthesis',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'textDecorationLine',
  'textAlign',
  'display',
  'position',
  'flexDirection',
  'justifyContent',
  'alignItems',
  'gap',
  'rowGap',
  'columnGap',
  'gridTemplateColumns',
  'gridTemplateRows',
  'gridAutoFlow',
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
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
  'border',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'boxShadow',
  'opacity',
  'overflow',
  'overflowX',
  'overflowY',
  'whiteSpace',
  'textOverflow',
  'zIndex',
  'transform',
  'transition',
  'cursor',
  'visibility',
  'pointerEvents',
];

const PSEUDO_STYLE_PROPS = [
  'content',
  'display',
  'position',
  'width',
  'height',
  'color',
  'backgroundColor',
  'backgroundImage',
  'font',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'border',
  'borderRadius',
  'margin',
  'padding',
  'inset',
  'opacity',
  'transform',
  'pointerEvents',
];

const SVG_ATTRS = [
  'viewBox',
  'preserveAspectRatio',
  'x',
  'y',
  'width',
  'height',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'd',
  'fill',
  'stroke',
  'fill-rule',
  'clip-rule',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'vector-effect',
];

const SVG_TAGS = new Set([
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'polygon',
  'polyline',
  'ellipse',
  'g',
]);

const normalizeMaxElements = (value) => {
  const max = Number(value);
  if (!Number.isSafeInteger(max) || max < 1) return 20_000;
  return max;
};

const buildSnapshotScript = ({ maxElements = 20_000 } = {}) => {
  const max = normalizeMaxElements(maxElements);
  const styleProps = JSON.stringify(STYLE_PROPS);
  const pseudoStyleProps = JSON.stringify(PSEUDO_STYLE_PROPS);
  const svgAttrs = JSON.stringify(SVG_ATTRS);
  const svgTags = JSON.stringify([...SVG_TAGS]);

  return `
(() => {
  const STYLE_PROPS = ${styleProps};
  const PSEUDO_STYLE_PROPS = ${pseudoStyleProps};
  const SVG_ATTRS = ${svgAttrs};
  const SVG_TAGS = new Set(${svgTags});
  const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'menuitem', 'option', 'tab', 'checkbox', 'radio', 'switch',
    'combobox', 'listbox', 'treeitem', 'slider', 'spinbutton', 'textbox',
  ]);
  const LANDMARK_TAGS = new Set(['main', 'nav', 'aside', 'header', 'footer', 'section', 'article']);
  const LANDMARK_ROLES = new Set([
    'main', 'navigation', 'complementary', 'banner', 'contentinfo', 'region', 'search',
  ]);

  const ownText = (el) => {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue || '';
    return t.replace(/\\s+/g, ' ').trim();
  };

  const readStyle = (computed, props) => {
    const out = {};
    for (const prop of props) {
      let value;
      try { value = computed[prop]; } catch { value = undefined; }
      // Keep meaningful defaults such as normal, auto, none and 0px. The previous collector
      // discarded those values, which made a real zero/normal value indistinguishable from an
      // unmeasured field.
      if (value !== undefined && value !== null && value !== '') out[prop] = value;
    }
    return out;
  };

  const pseudo = (el, pseudoName) => {
    let computed;
    try { computed = getComputedStyle(el, pseudoName); } catch { return null; }
    if (!computed) return null;
    const style = readStyle(computed, PSEUDO_STYLE_PROPS);
    const content = style.content;
    const hasContent = content !== undefined && content !== '' && content !== 'none';
    const hasImage = style.backgroundImage !== undefined && style.backgroundImage !== 'none';
    if (!hasContent && !hasImage) return null;
    return { content: content ?? null, style };
  };

  const isSvgish = (el) => SVG_TAGS.has(String(el.tagName || '').toLowerCase());
  const svgData = (el, fractionalBox, computed) => {
    if (!isSvgish(el)) return null;
    const tag = String(el.tagName || '').toLowerCase();
    const attrs = {};
    for (const name of SVG_ATTRS) {
      const value = el.getAttribute(name);
      if (value !== null) attrs[name] = value;
    }
    const root = tag === 'svg' ? el : el.closest('svg');
    const viewBox = root?.getAttribute('viewBox') ?? null;
    const pathData = tag === 'path' ? (el.getAttribute('d') ?? null) : null;
    const geometry = {};
    for (const name of SVG_ATTRS) {
      if (['viewBox', 'preserveAspectRatio', 'fill', 'stroke'].includes(name)) continue;
      if (attrs[name] !== undefined) geometry[name] = attrs[name];
    }
    return {
      tag,
      viewBox,
      path: pathData,
      pathData,
      geometry,
      attributes: attrs,
      rect: fractionalBox,
      paint: {
        attrFill: el.getAttribute('fill'),
        attrStroke: el.getAttribute('stroke'),
        computedFill: computed.fill,
        computedStroke: computed.stroke,
        computedFillOpacity: computed.fillOpacity,
        computedStrokeOpacity: computed.strokeOpacity,
        computedStrokeWidth: computed.strokeWidth,
        computedFillRule: computed.fillRule,
        computedClipRule: computed.clipRule,
      },
    };
  };

  const interactive = (el) => {
    const tag = String(el.tagName || '').toLowerCase();
    const role = el.getAttribute('role');
    const tabIndex = el.getAttribute('tabindex');
    return ['a', 'button', 'input', 'select', 'textarea', 'summary', 'option'].includes(tag) ||
      INTERACTIVE_ROLES.has(role) ||
      (tabIndex !== null && tabIndex !== '-1') ||
      typeof el.onclick === 'function';
  };

  const describeInteractive = (el, index) => {
    let candidate = el;
    while (candidate && candidate.nodeType === 1) {
      if (interactive(candidate)) {
        return {
          i: index.get(candidate) ?? null,
          tag: candidate.tagName,
          id: candidate.id || null,
          role: candidate.getAttribute('role'),
          href: candidate.tagName === 'A' ? candidate.getAttribute('href') : null,
          ariaLabel: candidate.getAttribute('aria-label'),
          tabindex: candidate.getAttribute('tabindex'),
          disabled: candidate.disabled === true || candidate.getAttribute('aria-disabled') === 'true',
        };
      }
      candidate = candidate.parentElement;
    }
    return null;
  };

  const describeRegion = (el, index) => {
    let candidate = el;
    while (candidate && candidate.nodeType === 1) {
      const tag = String(candidate.tagName || '').toLowerCase();
      const role = candidate.getAttribute('role');
      if (LANDMARK_TAGS.has(tag) || LANDMARK_ROLES.has(role)) {
        return {
          i: index.get(candidate) ?? null,
          tag: candidate.tagName,
          id: candidate.id || null,
          role,
          ariaLabel: candidate.getAttribute('aria-label'),
        };
      }
      candidate = candidate.parentElement;
    }
    return { i: null, tag: 'DOCUMENT', id: null, role: 'document', ariaLabel: null };
  };

  const isVisible = (el, rect, computed, svgish) => {
    if (rect.width === 0 && rect.height === 0) return false;
    // SVG elements generally have no HTML offsetParent despite being painted. Geometry plus the
    // ancestor checks below is the visibility signal that works for both HTML and SVG.
    if (!svgish && el.offsetParent === null) {
      if (computed.position !== 'fixed' && el.tagName !== 'BODY' && el.tagName !== 'HTML') return false;
    }
    let parent = el;
    while (parent && parent.nodeType === 1) {
      let parentStyle;
      try { parentStyle = getComputedStyle(parent); } catch { parentStyle = null; }
      if (parentStyle && (
        parentStyle.display === 'none' ||
        parentStyle.visibility === 'hidden' ||
        Number(parentStyle.opacity) === 0
      )) return false;
      parent = parent.parentElement;
    }
    return true;
  };

  const all = [...document.querySelectorAll('*')].slice(0, ${max});
  const index = new Map();
  all.forEach((el, i) => index.set(el, i));

  const isOccluded = (el, rect) => {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return null;
    let top;
    try { top = document.elementFromPoint(cx, cy); } catch { return null; }
    if (!top) return null;
    return !(top === el || el.contains(top) || top.contains(el));
  };

  const elements = all.map((el, i) => {
    let computed;
    try { computed = getComputedStyle(el); } catch { computed = {}; }
    const r = el.getBoundingClientRect();
    const fractionalBox = {
      x: r.x, y: r.y, width: r.width, height: r.height,
      top: r.top, right: r.right, bottom: r.bottom, left: r.left,
    };
    const svgish = isSvgish(el);
    const visible = isVisible(el, r, computed, svgish);
    const anchor = el.closest('a');
    const before = pseudo(el, '::before');
    const after = pseudo(el, '::after');
    const style = readStyle(computed, STYLE_PROPS);
    const paint = svgish ? {
      attrFill: el.getAttribute('fill'),
      attrStroke: el.getAttribute('stroke'),
      computedFill: computed.fill,
      computedStroke: computed.stroke,
    } : null;
    const region = describeRegion(el, index);

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
      subtreeText: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200) || null,
      box: {
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
      },
      fractionalBox,
      visible,
      occluded: visible ? isOccluded(el, r) : null,
      region,
      style,
      paint,
      svg: svgData(el, fractionalBox, computed),
      pseudo: { before, after },
      interactionVerification: 'not-tested',
      behavior: {
        cursor: computed.cursor,
        tag: el.tagName,
        isAnchor: el.tagName === 'A',
        href: el.tagName === 'A' ? el.getAttribute('href') : null,
        closestAnchorHref: el.tagName === 'A' ? null : (anchor ? anchor.getAttribute('href') : null),
        isButton: el.tagName === 'BUTTON' || el.getAttribute('role') === 'button',
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
        hasOnClick: typeof el.onclick === 'function',
        pointerEvents: computed.pointerEvents,
        nearestInteractiveAncestor: describeInteractive(el, index),
        // This collector never dispatches clicks. A static onclick property or semantic tag is
        // a hint about a potential control, never evidence that the control works.
        interactionVerification: 'not-tested',
      },
    };
  });

  // This is an inventory, not a parity verdict. It deliberately includes every visible DOM
  // element, including ordinary containers/text and SVG descendants. Consumers may add explicit
  // pairs or heuristic candidates later, but those overlays cannot shrink inspection coverage.
  const coverageInventory = elements.filter((el) => el.visible).map((el) => ({
    i: el.i,
    parent: el.parent,
    depth: el.depth,
    region: el.region,
    geometry: el.fractionalBox,
    identity: {
      tag: el.tag,
      id: el.id,
      role: el.role,
      ariaLabel: el.aria.label,
      dataTestId: all[el.i]?.getAttribute('data-testid') ?? null,
      name: all[el.i]?.getAttribute('name') ?? null,
      type: all[el.i]?.getAttribute('type') ?? null,
      href: el.behavior.href,
      ownText: el.ownText,
      subtreeText: el.subtreeText,
      svg: el.svg ? {
        tag: el.svg.tag,
        viewBox: el.svg.viewBox,
        path: el.svg.path,
      } : null,
    },
    categories: {
      interactive: Boolean(el.behavior.nearestInteractiveAncestor?.i === el.i),
      svg: Boolean(el.svg),
      svgRoot: el.svg?.tag === 'svg',
      text: Boolean(el.ownText),
      container: Boolean(all[el.i]?.children?.length),
    },
    interactionStates: {
      hover: 'not-tested',
      focus: 'not-tested',
      click: 'not-tested',
    },
  }));
  const requiredInteractionEdges = [
    { edge: 'hover', conditional: false, safety: 'read-only' },
    { edge: 'focus', conditional: false, safety: 'read-only' },
    {
      edge: 'activate',
      conditional: false,
      safety: 'requires-explicit-non-destructive-journey',
    },
    { edge: 'result-state', conditional: false, safety: 'observe-after-explicit-action' },
    {
      edge: 'options-enumerated',
      conditional: true,
      safety: 'observe-popup-after-explicit-action',
    },
    {
      edge: 'selection-feedback',
      conditional: true,
      safety: 'requires-explicit-non-destructive-journey',
    },
    {
      edge: 'persistence-or-navigation',
      conditional: true,
      safety: 'requires-explicit-non-destructive-journey',
    },
    {
      edge: 'error-feedback',
      conditional: true,
      safety: 'requires-explicit-non-destructive-journey',
    },
  ];
  const interactionControls = coverageInventory.filter((item) => item.categories.interactive).map(
    (item) => ({
      elementIndex: item.i,
      identity: item.identity,
      region: item.region,
      geometry: item.geometry,
      edges: requiredInteractionEdges.map((edge) => ({
        ...edge,
        status: 'not-tested',
        evidence: [],
      })),
    }),
  );
  const interactionManifest = {
    schemaVersion: 1,
    scope: 'all-visible-interactive-roots',
    complete: false,
    safety:
      'Static collection never activates controls. Activation evidence must come from an explicit non-destructive journey.',
    controls: interactionControls,
    summary: {
      controlCount: interactionControls.length,
      requiredEdgeCount: interactionControls.length * requiredInteractionEdges.length,
      observedEdgeCount: 0,
      blockerCount:
        interactionControls.length === 0
          ? 1
          : interactionControls.length * requiredInteractionEdges.length,
      emptySurfaceBlocker: interactionControls.length === 0,
    },
  };

  return {
    meta: {
      url: location.href,
      title: document.title,
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
      scrollHeight: document.documentElement.scrollHeight,
      capturedAt: new Date().toISOString(),
      elementCount: elements.length,
      totalElements: document.querySelectorAll('*').length,
      truncated: document.querySelectorAll('*').length > ${max},
      interactionVerification: 'not-tested',
      coverage: {
        scope: 'all-visible-dom-elements',
        inventoryCount: coverageInventory.length,
        completeCapture: document.querySelectorAll('*').length <= ${max},
        interactionStateCoverage: {
          hover: 'not-tested',
          focus: 'not-tested',
          click: 'not-tested',
        },
      },
    },
    elements,
    coverageInventory,
    interactionManifest,
  };
})()
`.trim();
};

module.exports = { STYLE_PROPS, buildSnapshotScript };

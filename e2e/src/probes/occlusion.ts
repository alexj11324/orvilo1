import type { Page } from '@playwright/test';

/**
 * Occlusion probe: is every control in a region actually on top where it is
 * drawn? Unit tests (happy-dom) have no layout, so a control painted under
 * another one — a hover checkbox absolutely positioned over the priority
 * mark — passes every DOM assertion. Only a hit test on real geometry sees it:
 * `document.elementFromPoint` at the control's centre and inset corners must
 * land on the control itself (or inside it).
 */

export interface OcclusionPoint {
  /** Description of the topmost element at this point (`tag.class[attr]`). */
  hit: string;
  /**
   * Not occluded: the hit is the control, one of its descendants, or one of
   * its ancestors. An ancestor cannot paint over its own child — it wins the
   * hit test only where the control lets the point through
   * (`pointer-events: none`, or outside a `border-radius`).
   */
  inside: boolean;
}

export interface OcclusionSample {
  control: string;
  points: OcclusionPoint[];
}

export interface OccludedControl {
  control: string;
  coveredBy: string;
  coveredPoints: number;
}

/**
 * A control counts as occluded when any sample point lands on an unrelated
 * element. Hits on the control's own ancestors are already "inside" (see
 * `OcclusionPoint.inside`), which absorbs rounded corners and hit-transparent
 * glyphs — so what is left is always something else painted over part of the
 * control. A partial overlap counts: the My issues regression covered only
 * the left half of the priority mark and left its centre clear.
 */
export const classifyOcclusion = (samples: OcclusionSample[]): OccludedControl[] =>
  samples.flatMap((sample) => {
    const covered = sample.points.filter((point) => !point.inside);
    if (covered.length === 0) return [];
    return [{ control: sample.control, coveredBy: covered[0].hit, coveredPoints: covered.length }];
  });

// Injected as source text (not a function) — the tsx transform wraps named
// inner functions in a `__name` helper that does not exist in the page.
// Also usable verbatim from `.agents/acceptance/scripts/cdp-inspect.cjs`.
export const occlusionSampleScript = (
  rootSelector: string,
  controlSelector: string,
  /** Hits on these count as clear — chrome meant to straddle an edge (resize handles). */
  ignoreHitSelector?: string,
) => `(() => {
  const ignore = ${JSON.stringify(ignoreHitSelector ?? '')};
  // Hidden until hover (an ancestor at opacity 0) or untargetable: nothing
  // for a user to aim at, so nothing to occlude. Hover first to probe it.
  const hiddenOrInert = (el) => {
    if (getComputedStyle(el).pointerEvents === 'none') return true;
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (Number(style.opacity) === 0 || style.visibility === 'hidden') return true;
    }
    return false;
  };
  const describe = (el) => {
    if (!el) return 'nothing';
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    const data = [...el.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'aria-label').slice(0, 2).map((a) => a.name + '=' + a.value.slice(0, 40)).join(',');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (data ? '[' + data + ']' : '');
  };
  const out = [];
  for (const root of document.querySelectorAll(${JSON.stringify(rootSelector)})) {
    for (const control of root.querySelectorAll(${JSON.stringify(controlSelector)})) {
      const rect = control.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4 || hiddenOrInert(control)) continue;
      if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
      const inset = Math.min(3, rect.width / 4, rect.height / 4);
      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + inset, rect.top + inset],
        [rect.right - inset, rect.top + inset],
        [rect.left + inset, rect.bottom - inset],
        [rect.right - inset, rect.bottom - inset],
      ].map(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return { hit: describe(hit), inside: !!hit && (control.contains(hit) || hit.contains(control) || (!!ignore && !!hit.closest(ignore))) };
      });
      out.push({ control: describe(control) + ' "' + (control.textContent || '').trim().slice(0, 24) + '"', points });
    }
  }
  return out;
})()`;

/**
 * Sample the page and return every control that is drawn under something
 * else, plus the controls that were checked — a caller asserts the ones it
 * cares about were actually sampled, so "nothing occluded" cannot pass just
 * because a control never rendered.
 */
export const findOccludedControls = async (
  page: Page,
  rootSelector: string,
  controlSelector: string,
): Promise<{ checked: string[]; occluded: OccludedControl[] }> => {
  const samples = (await page.evaluate(
    occlusionSampleScript(rootSelector, controlSelector),
  )) as OcclusionSample[];
  return { checked: samples.map((sample) => sample.control), occluded: classifyOcclusion(samples) };
};

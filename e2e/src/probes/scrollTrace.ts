import type { Page } from '@playwright/test';

export type ScrollMotion = 'jump' | 'none' | 'slide';

export interface ScrollTraceSummary {
  frames: number;
  largestFrameDelta: number;
  motion: ScrollMotion;
  movingFrames: number;
  travel: number;
}

const TRACE_KEY = '__orviloE2EScrollTrace';
const MIN_SLIDE_FRAMES = 4;
const JUMP_SHARE = 0.9;

export interface ScrollCallRecord {
  behavior: ScrollBehavior | 'assign';
  top: number | undefined;
}

export const classifyScrollTrace = (samples: number[]): ScrollTraceSummary => {
  const deltas = samples.slice(1).map((value, i) => value - samples[i]);
  const moving = deltas.filter((d) => d !== 0);
  const travel = Math.abs(samples.at(-1)! - samples[0]);
  const largestFrameDelta = Math.max(0, ...moving.map(Math.abs));

  let motion: ScrollMotion = 'none';
  if (travel > 0) {
    const oneFrameJump = largestFrameDelta >= travel * JUMP_SHARE;
    motion = !oneFrameJump && moving.length >= MIN_SLIDE_FRAMES ? 'slide' : 'jump';
  }

  return { frames: samples.length, largestFrameDelta, motion, movingFrames: moving.length, travel };
};

// Injected as source text: the tsx/esbuild transform wraps named inner
// functions in a `__name` helper that does not exist in the page.
// Programmatic scrolls are recorded too: the pin drives its transition through
// `Element.prototype.scrollTo({ behavior: 'smooth' })`. Playwright's Chromium
// collapses smooth scrolling into a single instant frame (no compositor
// animation), so a multi-frame slide is never observable in this environment —
// the regression guard instead asserts the smooth-scroll call was issued.
const START_SCRIPT = `(() => {
  const key = ${JSON.stringify(TRACE_KEY)};
  if (window[key]) cancelAnimationFrame(window[key].raf);
  if (!Element.prototype.__orviloScrollToWrapped) {
    const origScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (...args) {
      const traceRef = window[key];
      if (traceRef) {
        const a0 = args[0];
        traceRef.calls.push({
          behavior: typeof a0 === 'object' && a0 ? a0.behavior || 'auto' : 'assign',
          top: typeof a0 === 'object' && a0 ? a0.top : args[1],
        });
      }
      return origScrollTo.apply(this, args);
    };
    Element.prototype.__orviloScrollToWrapped = true;
  }
  const trace = { raf: 0, samples: [], calls: [] };
  const tick = () => {
    let el = document.querySelector('.message-wrapper');
    while (el) {
      const overflowY = getComputedStyle(el).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      el = el.parentElement;
    }
    trace.samples.push(el ? el.scrollTop : NaN);
    trace.raf = requestAnimationFrame(tick);
  };
  trace.raf = requestAnimationFrame(tick);
  window[key] = trace;
})()`;

const STOP_SCRIPT = `(() => {
  const key = ${JSON.stringify(TRACE_KEY)};
  const trace = window[key];
  if (!trace) return { samples: [], calls: [] };
  cancelAnimationFrame(trace.raf);
  delete window[key];
  return {
    calls: trace.calls,
    samples: trace.samples.filter((v) => !Number.isNaN(v)),
  };
})()`;

export interface ScrollTraceResult {
  calls: ScrollCallRecord[];
  samples: number[];
}

export const startScrollTrace = async (page: Page): Promise<void> => {
  await page.evaluate(START_SCRIPT);
};

export const stopScrollTrace = async (page: Page): Promise<ScrollTraceResult> => {
  return page.evaluate<ScrollTraceResult>(STOP_SCRIPT);
};

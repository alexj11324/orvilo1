/**
 * Puts the class rules an emotion cache emits into one named CSS cascade layer.
 *
 * antd-style (`createStaticStyles`, `createStyles`, `cx`) writes through an
 * emotion cache. Its rules are unlayered, so they always beat Tailwind v4
 * utilities (`@layer utilities`). Wrapping them in `@layer <name>{...}` lets
 * `globals.css` order the layer below `utilities`.
 *
 * Only scoped class rules are wrapped. Emotion inserts `@keyframes` (and other
 * chained global fragments) with an empty selector; those stay untouched.
 *
 * See docs/development/antd-style-layer-spike.md.
 */

export const ANTD_STYLE_LAYER = 'antd-style';

/**
 * The single switch. Read by the runtime patch (`antdStyleLayer.ts`) and by the
 * Vite build-time precompile (`plugins/vite/staticStylesPrecompile.ts`), which
 * bypasses `cache.insert` and therefore needs the same layering baked in.
 */
// Keep untouched Emotion consumers' precedence until the separate global rollout is accepted.
// Runtime and precompiled styles must use the same cascade during the rollout.
export const ANTD_STYLE_LAYER_ENABLED = false;

interface SerializedStyles {
  name: string;
  styles: string;
}

/** The slice of an emotion cache this module touches. */
export interface LayerableEmotionCache {
  insert: (selector: string, serialized: any, sheet: any, shouldCache: boolean) => unknown;
  inserted: object;
}

export type LayerPatchResult = 'patched' | 'already-patched' | 'late';

const PATCHED = Symbol.for('orvilo.antdStyleLayer.patched');

/**
 * Pure: the `(selector, serialized)` pair to hand to emotion's own insert.
 * A non-empty selector means a class rule and is wrapped; an empty selector
 * (keyframes, global fragments) passes through.
 */
export const toLayeredInsertArgs = (
  layer: string,
  selector: string,
  serialized: SerializedStyles,
): [string, SerializedStyles] => {
  if (!selector) return [selector, serialized];

  return ['', { ...serialized, styles: `@layer ${layer}{${selector}{${serialized.styles}}}` }];
};

/**
 * Wraps `cache.insert` in place. Rules inserted before this call stay unlayered,
 * so it must run before the first antd-style rule is created.
 *
 * - `patched`: wrapped, nothing was inserted yet.
 * - `already-patched`: a previous call (for example before an HMR reload) did it.
 * - `late`: wrapped, but the cache already held rules that stay unlayered.
 */
export const layerEmotionCache = (
  cache: LayerableEmotionCache,
  layer: string = ANTD_STYLE_LAYER,
): LayerPatchResult => {
  const target = cache as LayerableEmotionCache & { [PATCHED]?: true };
  if (target[PATCHED]) return 'already-patched';

  const insert = cache.insert.bind(cache);
  cache.insert = (selector, serialized, sheet, shouldCache) => {
    const [nextSelector, nextSerialized] = toLayeredInsertArgs(layer, selector, serialized);
    return insert(nextSelector, nextSerialized, sheet, shouldCache);
  };
  target[PATCHED] = true;

  return Object.keys(cache.inserted).length === 0 ? 'patched' : 'late';
};

/**
 * Confines the CSS that vendor code writes through an emotion cache.
 *
 * `@lobehub/editor`, `@lobehub/charts` and the `@lobehub/ui` pieces they render
 * still style themselves with antd-style (`createStaticStyles`, `createStyles`,
 * `cx`, `createGlobalStyle`), which writes through emotion. Emotion's rules are
 * unlayered, so they would beat every Tailwind v4 utility (`@layer utilities`)
 * and a nested rule such as `.css-x hr` would reach first-party components
 * rendered inside a vendor tree.
 *
 * Every insert is therefore rewritten:
 *
 * - Class rules go into `@layer antd-style` (ordered below `components` and
 *   `utilities` in `globals.css`) and are prefixed with
 *   `:where(.orvilo-editor-scope)`, so they only match inside a LobeThemeScope
 *   (`src/components/LobeThemeScope`). `:where()` adds no specificity.
 * - Selector-less fragments (keyframes, `createGlobalStyle` sheets such as the
 *   lobehub `EssentialStyle`) are layered too. They cannot be scoped without
 *   parsing them; their remaining global selectors are listed in
 *   docs/development/antd-global-style-layer.md.
 *
 * This module is pure: the runtime patch lives in
 * `src/components/LobeThemeScope/installStyleLayer.ts`, and the Vite
 * precompiler (`plugins/vite/staticStylesPrecompile.ts`) bakes the same rewrite
 * into build-time compiled rules.
 */

export const ANTD_STYLE_LAYER = 'antd-style';

/** The only subtree vendor emotion class rules may match. */
export const VENDOR_STYLE_SCOPE = '.orvilo-editor-scope';

/** Vendor emotion output is layered and scoped at runtime and in the precompiler. */
export const ANTD_STYLE_LAYER_ENABLED = true;

interface SerializedStyles {
  name: string;
  styles: string;
}

export interface LayerOptions {
  layer?: string;
  /** Ancestor selector class rules must sit under; omit to only layer them. */
  scope?: string;
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
 * A non-empty selector is a class rule: it is scoped and layered. An empty
 * selector (keyframes, global sheets) is layered as is.
 */
export const toLayeredInsertArgs = (
  layer: string,
  selector: string,
  serialized: SerializedStyles,
  scope?: string,
): [string, SerializedStyles] => {
  if (!selector) {
    return ['', { ...serialized, styles: `@layer ${layer}{${serialized.styles}}` }];
  }

  const scoped = scope ? `:where(${scope}) ${selector}` : selector;
  return ['', { ...serialized, styles: `@layer ${layer}{${scoped}{${serialized.styles}}}` }];
};

/**
 * Wraps `cache.insert` in place. Rules inserted before this call stay unlayered
 * and unscoped, so it must run before the first vendor style is created.
 *
 * - `patched`: wrapped, nothing was inserted yet.
 * - `already-patched`: a previous call (for example before an HMR reload) did it.
 * - `late`: wrapped, but the cache already held rules that stay as they were.
 */
export const layerEmotionCache = (
  cache: LayerableEmotionCache,
  { layer = ANTD_STYLE_LAYER, scope }: LayerOptions = {},
): LayerPatchResult => {
  const target = cache as LayerableEmotionCache & { [PATCHED]?: true };
  if (target[PATCHED]) return 'already-patched';

  const insert = cache.insert.bind(cache);
  cache.insert = (selector, serialized, sheet, shouldCache) => {
    const [nextSelector, nextSerialized] = toLayeredInsertArgs(layer, selector, serialized, scope);
    return insert(nextSelector, nextSerialized, sheet, shouldCache);
  };
  target[PATCHED] = true;

  return Object.keys(cache.inserted).length === 0 ? 'patched' : 'late';
};

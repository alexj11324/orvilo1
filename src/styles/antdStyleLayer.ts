/**
 * Side-effect module: routes every antd-style rule created at runtime into
 * `@layer antd-style`.
 *
 * Must be the FIRST import of every renderer entry (it is the first line of
 * `src/initialize.ts`). ES modules evaluate in import order, so this runs before
 * any `createStaticStyles` call in the 960+ modules that follow, including the
 * ones inside `@lobehub/ui`, which share the same default emotion cache.
 *
 * Production builds precompile pure `createStaticStyles` callbacks at build time
 * and insert them with `cache.sheet.insert`, which skips `cache.insert`. That
 * path is layered in `plugins/vite/staticStylesPrecompile.ts` instead.
 *
 * Layer order lives in `src/app/globals.css`:
 * `@layer theme, base, antd, components, antd-style, utilities;`
 *
 * To turn the experiment off, set `ANTD_STYLE_LAYER_ENABLED` to false in
 * `layerEmotionCache.ts`.
 */
import { styleManager } from 'antd-style';

import { ANTD_STYLE_LAYER_ENABLED, layerEmotionCache } from './layerEmotionCache';

if (ANTD_STYLE_LAYER_ENABLED && layerEmotionCache(styleManager.cache) === 'late') {
  console.error(
    '[antdStyleLayer] antd-style rules were inserted before the layer patch ran; ' +
      'those rules stay unlayered. Keep this module the first import of the entry.',
  );
}

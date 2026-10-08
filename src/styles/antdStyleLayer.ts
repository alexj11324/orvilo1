/**
 * Side-effect module: routes every antd-style rule into `@layer antd-style`.
 *
 * Must be the FIRST import of every renderer entry (it is the first line of
 * `src/initialize.ts`). ES modules evaluate in import order, so this runs before
 * any `createStaticStyles` call in the 960+ modules that follow, including the
 * ones inside `@lobehub/ui`, which share the same default emotion cache.
 *
 * Layer order lives in `src/app/globals.css`:
 * `@layer theme, base, antd, components, antd-style, utilities;`
 *
 * To turn the experiment off, set `ANTD_STYLE_LAYER_ENABLED` to false (rules go
 * back to unlayered; the unused layer name in globals.css is harmless).
 */
import { styleManager } from 'antd-style';

import { layerEmotionCache } from './layerEmotionCache';

export const ANTD_STYLE_LAYER_ENABLED = true;

if (ANTD_STYLE_LAYER_ENABLED && layerEmotionCache(styleManager.cache) === 'late') {
  console.error(
    '[antdStyleLayer] antd-style rules were inserted before the layer patch ran; ' +
      'those rules stay unlayered. Keep this module the first import of the entry.',
  );
}

/**
 * Puts every rule antd-style's shared emotion cache writes into `@layer
 * antd-style` and confines class rules to `.orvilo-editor-scope` (see
 * `src/styles/layerEmotionCache.ts`).
 *
 * Vendor modules (`@lobehub/editor`, `@lobehub/ui`, `@lobehub/charts`) call
 * `createStaticStyles` while they evaluate, and rules inserted before the patch
 * stay unlayered and unscoped. Import this module for its side effect as the
 * first import of every client entry (`src/initialize.ts` and the micro-app
 * `entry.client.tsx` files), before any vendor module can load.
 */
import { styleManager } from 'antd-style';

import {
  ANTD_STYLE_LAYER,
  layerEmotionCache,
  type LayerPatchResult,
  VENDOR_STYLE_SCOPE,
} from '@/styles/layerEmotionCache';

export const installVendorStyleLayer = (): LayerPatchResult =>
  layerEmotionCache(styleManager.cache, { layer: ANTD_STYLE_LAYER, scope: VENDOR_STYLE_SCOPE });

const result = installVendorStyleLayer();

if (result === 'late' && typeof console !== 'undefined') {
  console.warn(
    '[orvilo] antd-style rules were inserted before the vendor style layer was installed; ' +
      'they stay unlayered. Import installStyleLayer before any vendor module.',
  );
}

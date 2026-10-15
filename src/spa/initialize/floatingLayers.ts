import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';

import { setVendorFloatingCollisionPadding } from '@/components/LobeThemeScope/floating';
import { setFloatingCollisionPadding } from '@/libs/floatingCollisionPadding';

export const reserveTitleBarForFloatingLayers = () => {
  // Editor menus and popovers are lobehub components with their own setter.
  setVendorFloatingCollisionPadding({ top: TITLE_BAR_HEIGHT });
  setFloatingCollisionPadding({ top: TITLE_BAR_HEIGHT });
};

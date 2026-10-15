// The base-ui setter still positions the floating layers of retained @lobehub/ui
// components (Image viewer toolbar, Markdown, …); drop it when those retire.
import { setFloatingCollisionPadding as setLobeFloatingCollisionPadding } from '@lobehub/ui/base-ui';
import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';

import { setFloatingCollisionPadding } from '@/libs/floatingCollisionPadding';

export const reserveTitleBarForFloatingLayers = () => {
  setLobeFloatingCollisionPadding({ top: TITLE_BAR_HEIGHT });
  setFloatingCollisionPadding({ top: TITLE_BAR_HEIGHT });
};

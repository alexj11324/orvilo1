import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';

import { setFloatingCollisionPadding } from '@/libs/contextMenu/collisionPadding';

export const reserveTitleBarForFloatingLayers = () => {
  setFloatingCollisionPadding({ top: TITLE_BAR_HEIGHT });
};

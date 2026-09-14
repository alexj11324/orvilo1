import { setFloatingCollisionPadding } from '@lobehub/ui/base-ui';
import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';

export const reserveTitleBarForFloatingLayers = () => {
  setFloatingCollisionPadding({ top: TITLE_BAR_HEIGHT });
};

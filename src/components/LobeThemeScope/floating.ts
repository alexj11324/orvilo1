// The lobehub menus and popovers that @lobehub/editor renders position
// themselves with lobehub's own collision padding, not the local one.
import { setFloatingCollisionPadding } from '@lobehub/ui/base-ui';

type Padding = Parameters<typeof setFloatingCollisionPadding>[0];

export const setVendorFloatingCollisionPadding = (padding: Padding) =>
  setFloatingCollisionPadding(padding);

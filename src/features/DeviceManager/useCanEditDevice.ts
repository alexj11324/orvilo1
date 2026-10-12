import type { DeviceListItem } from '@orvilo/types';
import { useCallback } from 'react';

import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

/** Managing a device stays with its owner; using an Agent does not transfer device ownership. */
export const useCanEditDevice = () => {
  const userId = useUserStore(userProfileSelectors.userId);
  return useCallback(
    (device: DeviceListItem) => device.registered && !!userId && device.enroller?.userId === userId,
    [userId],
  );
};

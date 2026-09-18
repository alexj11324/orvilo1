import type { RecentItem } from '@orvilo/types';

import { LocalStorageQueryProjectionStorage } from '@/libs/queryProjectionStorage';

export const recentProjection = new LocalStorageQueryProjectionStorage<RecentItem[]>({
  namespace: 'orvilo-home-recents-v3',
});

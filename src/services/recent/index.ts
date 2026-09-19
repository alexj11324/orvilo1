import type { RecentItem } from '@orvilo/types';

import { lambdaClient } from '@/libs/trpc/client';

export { RECENT_SIDEBAR_TYPES, recentTypesForWorkspace } from './recentTypes';

class RecentService {
  getAll = (
    limit?: number,
    types?: readonly RecentItem['type'][],
    withTopicPreview?: boolean,
    mineOnly?: boolean,
    /** Drop topics owned by a private agent/group — the team tab's feed. */
    sharedOnly?: boolean,
  ): Promise<RecentItem[]> => {
    return lambdaClient.recent.getAll.query({
      limit,
      mineOnly,
      sharedOnly,
      types: types ? [...types] : undefined,
      withTopicPreview,
    });
  };
}

export const recentService = new RecentService();

import type { SlackIntegrationStatus } from '@orvilo/types';
import useSWRInfinite from 'swr/infinite';

import { useClientDataSWR } from '@/libs/swr';
import { augmentKey } from '@/libs/swr/augmentKey';
import type { SlackChannelChoice } from '@/services/slackIntegration';
import { slackIntegrationService } from '@/services/slackIntegration';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

const statusKey = (workspaceId: string, userId?: string) => [
  'slack-integration',
  workspaceId,
  'status',
  userId,
];
export const useFetchSlackIntegration = (workspaceId: string | null) => {
  const userId = useUserStore(userProfileSelectors.userId);
  return useClientDataSWR<SlackIntegrationStatus>(
    workspaceId ? statusKey(workspaceId, userId) : null,
    () => slackIntegrationService.status(workspaceId!),
  );
};

export const useFetchSlackChannels = (workspaceId: string, enabled: boolean) => {
  const response = useSWRInfinite<{ channels: SlackChannelChoice[]; nextCursor?: string }>(
    (index, previous) =>
      !enabled || (index > 0 && !previous?.nextCursor)
        ? null
        : (augmentKey(
            ['slack-integration', workspaceId, 'channels', previous?.nextCursor || ''],
            workspaceId,
          ) as string[]),
    (key: unknown) => {
      // augmentKey appends scope after the four domain key fields.
      const cursor = (key as string[])[3];
      return slackIntegrationService.channels(workspaceId, cursor || undefined);
    },
    { revalidateFirstPage: false, shouldRetryOnError: false },
  );
  return {
    ...response,
    channels: response.data?.flatMap((page) => page.channels) || [],
    hasMore: Boolean(response.data?.at(-1)?.nextCursor),
  };
};

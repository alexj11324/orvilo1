import { CHAT_TOPIC_URL } from '@orvilo/const';

import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';

/**
 * The canonical target for a legacy `/agent/:aid/:topicId` deep link:
 * `/chat/:topicId` (workspace-prefixed when a workspace is active), with the
 * original query string (`?thread=…` and friends) and `#` anchor preserved.
 */
export const legacyAgentTopicTarget = ({
  topicId,
  workspaceSlug,
  search = '',
  hash = '',
}: {
  topicId: string;
  workspaceSlug?: string | null;
  search?: string;
  hash?: string;
}): string => `${buildWorkspaceAwarePath(CHAT_TOPIC_URL(topicId), workspaceSlug)}${search}${hash}`;

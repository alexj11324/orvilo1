'use client';

import { useFetchWorkspaceMembers } from '@/business/client/hooks/useFetchWorkspaceMembers';
import { useWorkspaceMembers } from '@/business/client/hooks/useWorkspaceMembers';
import Avatar from '@/components/Avatar';
import { createTopicCommentMentionItems } from '@/features/Portal/TopicComments/mentionData';

import type { NativeMentionOptions } from './mentions';

/** Same fetched roster, deduplication, label precedence, stable IDs and search
 * config as the existing document/comment picker; no SDK command imports. */
export function useNativeWorkspaceMentions(
  workspaceScoped: boolean,
): NativeMentionOptions | undefined {
  useFetchWorkspaceMembers();
  const members = useWorkspaceMembers();
  if (!workspaceScoped) return undefined;
  return {
    maxLength: 50,
    fuseOptions: { keys: ['label', 'metadata.description'], threshold: 0.35 },
    items: createTopicCommentMentionItems(members).map(({ avatar, ...item }) => ({
      ...item,
      icon: <Avatar avatar={avatar} size={24} />,
    })),
  };
}

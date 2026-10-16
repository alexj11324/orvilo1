import type { IEditor, ISlashMenuOption } from '@lobehub/editor';
import type { EditorProps } from '@lobehub/editor/react';
import { useCallback, useMemo } from 'react';

import { useFetchWorkspaceMembers } from '@/business/client/hooks/useFetchWorkspaceMembers';
import { useWorkspaceMembers } from '@/business/client/hooks/useWorkspaceMembers';
import Avatar from '@/components/Avatar';

import {
  createTopicCommentMentionItems,
  insertTopicCommentMention,
  type MentionableWorkspaceMember,
  writeTopicCommentMentionMarkdown,
} from './editorUtils';

/**
 * Shared comment mention source. Mention metadata carries a stable `type`, so
 * Issue callers may add authorized Agent candidates without changing the editor JSON.
 */
export const useWorkspaceCommentMentionOption = (
  agents?: Array<{ id: string; name: string; avatar?: string | null }>,
): EditorProps['mentionOption'] => {
  useFetchWorkspaceMembers();
  const workspaceMembers = useWorkspaceMembers() as MentionableWorkspaceMember[];

  const mentionItems = useMemo<ISlashMenuOption[]>(
    () =>
      [
        ...createTopicCommentMentionItems(workspaceMembers),
        ...(agents?.map((agent) => ({
          key: `agent-${agent.id}`,
          label: agent.name,
          avatar: agent.avatar || agent.name,
          metadata: { id: agent.id, type: 'agent', timestamp: 0 },
        })) ?? []),
      ].map(({ avatar, ...item }) => ({
        ...item,
        icon: <Avatar avatar={avatar} size={24} />,
      })),
    [workspaceMembers, agents],
  );

  const handleMentionSelect = useCallback((editor: IEditor, option: ISlashMenuOption) => {
    insertTopicCommentMention(editor, option);
  }, []);

  return useMemo(
    () => ({
      fuseOptions: { keys: ['label', 'metadata.description'], threshold: 0.35 },
      items: mentionItems,
      markdownWriter: writeTopicCommentMentionMarkdown,
      maxLength: 50,
      onSelect: handleMentionSelect,
    }),
    [handleMentionSelect, mentionItems],
  );
};

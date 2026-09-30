import isEqual from 'fast-deep-equal';
import { memo } from 'react';

import { usePermission } from '@/hooks/usePermission';

import { useConversationStore } from '../../../store';
import ContentBlock from './ContentBlock';
import type { RenderableAssistantContentBlock } from './types';

interface GroupItemProps extends RenderableAssistantContentBlock {
  assistantId: string;
  contentId?: string;
  disableEditing?: boolean;
  messageIndex: number;
}

const GroupItem = memo<GroupItemProps>(
  ({ contentId, disableEditing, error, assistantId, ...item }) => {
    const { allowed: canEdit } = usePermission('edit_own_content');
    const toggleMessageEditing = useConversationStore((s) => s.toggleMessageEditing);

    return item.id === contentId ? (
      <div
        className="flex flex-col"
        onDoubleClick={(e) => {
          if (!canEdit || disableEditing || error || !e.altKey) return;
          toggleMessageEditing(item.id, true);
        }}
      >
        <ContentBlock
          {...item}
          assistantId={assistantId}
          disableEditing={disableEditing}
          error={error}
        />
      </div>
    ) : (
      <ContentBlock
        {...item}
        assistantId={assistantId}
        disableEditing={disableEditing}
        error={error}
      />
    );
  },
  isEqual,
);

export default GroupItem;

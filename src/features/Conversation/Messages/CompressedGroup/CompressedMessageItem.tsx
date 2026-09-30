'use client';

import { agentDisplayName, type UIChatMessage } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { useAgentMeta } from '../../hooks';
import ContentBlock from '../AssistantGroup/components/ContentBlock';
import UserMessageContent from '../User/components/MessageContent';
import { getBotSender, resolveSenderIdentity } from '../User/resolveSenderIdentity';

interface CompressedMessageItemProps {
  message: UIChatMessage;
}

/**
 * Renders a single message within a compressed group
 * Reuses existing User and Assistant content components for consistency
 */
const CompressedMessageItem = memo<CompressedMessageItemProps>(({ message }) => {
  const { t } = useTranslation('chat');
  const userAvatar = useUserAvatar();
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const agentAvatar = useAgentMeta(message.agentId);
  const { role, children, sender } = message;

  // Render user message
  if (role === 'user') {
    // A shared (workspace) topic's compressed history may hold messages from
    // other members — render the sender's identity, not the viewer's.
    const { avatar, title } = resolveSenderIdentity({
      botSender: getBotSender(message),
      currentUserId,
      selfAvatar: userAvatar,
      sender,
      unknownLabel: t('sender.unknownMember'),
    });
    return (
      <div className="flex gap-2 py-1">
        <Avatar avatar={avatar} name={title} size={28} title={title || undefined} />
        <div className="flex flex-col flex-1" style={{ overflow: 'hidden' }}>
          <UserMessageContent {...message} />
        </div>
      </div>
    );
  }

  // Render assistant message (standalone without tools)
  if (role === 'assistant') {
    return (
      <div className="flex gap-2 py-1">
        <Avatar {...agentAvatar} name={agentDisplayName(agentAvatar)} size={28} />
        <div className="flex flex-col flex-1" style={{ overflow: 'hidden' }}>
          <ContentBlock
            disableEditing
            assistantId={message.id}
            content={message.content}
            id={message.id}
          />
        </div>
      </div>
    );
  }

  // Render assistantGroup (assistant message with tool calls)
  if (role === 'assistantGroup' && children) {
    return (
      <div className="flex gap-2 py-1">
        <Avatar {...agentAvatar} name={agentDisplayName(agentAvatar)} size={28} />
        <div className="flex flex-col flex-1 gap-2" style={{ overflow: 'hidden' }}>
          {children.map((block) => (
            <ContentBlock {...block} disableEditing assistantId={message.id} key={block.id} />
          ))}
        </div>
      </div>
    );
  }

  // Skip other roles (tool, system, etc.)
  return null;
});

CompressedMessageItem.displayName = 'CompressedMessageItem';

export default CompressedMessageItem;

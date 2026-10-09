'use client';

import { agentDisplayName } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';

import { Message } from '@/components/ai-elements/message';

import FollowUpChips from '../FollowUp/FollowUpChips';
import { contextSelectors, useConversationStore } from '../store';
import Actions from './components/Actions';
import Avatar from './components/Avatar';
import ErrorContent from './components/ErrorContent';
import MessageContent from './components/MessageContent';
import Title from './components/Title';
import { styles } from './style';
import type { ChatItemProps } from './type';

const ChatItem = memo<ChatItemProps>(
  ({
    onAvatarClick,
    avatarProps,
    assistantAvatar,
    customAvatarRender,
    afterActions,
    actionAddon,
    actions,
    className,
    loading,
    message,
    placeholderMessage = '...',
    placement = 'left',
    avatar,
    error,
    showTitle,
    time,
    editing,
    messageExtra,
    children,
    customErrorRender,
    onDoubleClick,
    aboveMessage,
    belowMessage,
    headerAddon,
    showAvatar = true,
    titleAddon,
    disabled = false,
    id,
    style,
    ...rest
  }) => {
    const isUser = placement === 'right';
    const conversationKey = useConversationStore(contextSelectors.conversationKey);
    const isEmptyMessage =
      !message || String(message).trim() === '' || message === placeholderMessage;
    const errorContent = error && (
      <ErrorContent customErrorRender={customErrorRender} error={error} id={id} />
    );

    const avatarContent = (
      <Avatar
        alt={avatarProps?.alt || agentDisplayName(avatar, 'avatar')}
        assistantAvatar={assistantAvatar}
        loading={loading}
        shape={'square'}
        onClick={onAvatarClick}
        {...avatarProps}
        avatar={avatar}
      />
    );

    return (
      <Message
        from={isUser ? 'user' : 'assistant'}
        {...rest}
        className={cn('message-wrapper', styles.container, className)}
        data-message-id={id}
        style={style}
      >
        {(showAvatar || showTitle || headerAddon || time !== undefined) && (
          <div
            className={cn('message-header flex items-center gap-2', isUser && 'flex-row-reverse')}
          >
            {showAvatar &&
              (customAvatarRender ? customAvatarRender(avatar, avatarContent) : avatarContent)}
            {headerAddon}
            <Title avatar={avatar} showTitle={showTitle} time={time} titleAddon={titleAddon} />
          </div>
        )}
        {aboveMessage}
        {error && isEmptyMessage ? (
          errorContent
        ) : (
          <MessageContent
            disabled={disabled}
            editing={editing}
            id={id!}
            message={message}
            messageExtra={
              <>
                {errorContent}
                {messageExtra}
              </>
            }
            onDoubleClick={onDoubleClick}
          >
            {children}
          </MessageContent>
        )}
        {belowMessage}
        {id && conversationKey && (
          <FollowUpChips conversationKey={conversationKey} messageId={id} />
        )}
        {(actionAddon || actions) && (
          <Actions actionAddon={actionAddon} actions={actions} placement={placement} />
        )}
        {afterActions}
      </Message>
    );
  },
);

export default ChatItem;

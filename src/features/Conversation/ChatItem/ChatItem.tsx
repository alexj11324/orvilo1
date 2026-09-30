'use client';

import { agentDisplayName } from '@orvilo/types';
import { cx } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';

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
        loading={loading}
        shape={'square'}
        onClick={onAvatarClick}
        {...avatarProps}
        avatar={avatar}
      />
    );

    return (
      <div
        {...rest}
        data-message-id={id}
        className={cn(
          'flex flex-col gap-2 py-2',
          cx('message-wrapper', styles.container, className),
        )}
        style={{
          paddingInlineStart: isUser ? 36 : 0,
          ...style,
        }}
      >
        <div
          className={cn('flex items-center gap-2', 'message-header')}
          style={{ flexDirection: isUser ? 'row-reverse' : 'row' }}
        >
          {showAvatar &&
            (customAvatarRender ? customAvatarRender(avatar, avatarContent) : avatarContent)}
          {headerAddon}
          <Title avatar={avatar} showTitle={showTitle} time={time} titleAddon={titleAddon} />
        </div>
        <div
          className={cn('flex flex-col gap-2', 'message-body')}
          style={{
            maxWidth: '100%',
            overflow: 'hidden',
            position: 'relative',
            width: isUser ? undefined : '100%',
          }}
        >
          {aboveMessage}
          {error && isEmptyMessage ? (
            errorContent
          ) : (
            <MessageContent
              disabled={disabled}
              editing={editing}
              id={id!}
              message={message}
              variant={isUser ? 'bubble' : undefined}
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
        </div>
        {id && conversationKey && (
          <FollowUpChips conversationKey={conversationKey} messageId={id} />
        )}
        {(actionAddon || actions) && (
          <Actions actionAddon={actionAddon} actions={actions} placement={placement} />
        )}
        {afterActions && (
          <div
            className="flex flex-col"
            style={{
              width: isUser ? undefined : '100%',
            }}
          >
            {afterActions}
          </div>
        )}
      </div>
    );
  },
);

export default ChatItem;

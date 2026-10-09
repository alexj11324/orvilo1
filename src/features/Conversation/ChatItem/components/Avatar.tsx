import { DEFAULT_INBOX_AVATAR } from '@orvilo/const';
import { agentDisplayName } from '@orvilo/types';
import { BotAvatar } from 'bot-avatars';
import { type CSSProperties, type MouseEventHandler } from 'react';
import { memo } from 'react';

import A from '@/components/Avatar';
import { useIsDark } from '@/hooks/useIsDark';

import { type ChatItemProps } from '../type';

export interface AvatarProps {
  alt?: string;
  assistantAvatar?: boolean;
  avatar: ChatItemProps['avatar'];
  loading?: boolean;
  onClick?: ChatItemProps['onAvatarClick'] | MouseEventHandler<HTMLDivElement>;
  size?: number;
  style?: CSSProperties;
  unoptimized?: boolean;
}

const Avatar = memo<AvatarProps>(
  ({ loading, avatar, unoptimized, onClick, size = 28, style, alt, assistantAvatar }) => {
    const dark = useIsDark();
    const useBot = assistantAvatar && (!avatar.avatar || avatar.avatar === DEFAULT_INBOX_AVATAR);
    const displayName = agentDisplayName(avatar);

    return (
      <A
        alt={alt || displayName}
        animation={loading}
        background={useBot ? 'transparent' : avatar.backgroundColor}
        name={displayName}
        shape={'square'}
        size={size}
        // The upstream canvas overscans its box for jumps and turns.
        style={useBot ? { ...style, overflow: 'visible' } : style}
        title={displayName}
        unoptimized={unoptimized}
        avatar={
          useBot ? (
            <BotAvatar
              aria-hidden="true"
              interactive={false}
              shading="fabric"
              size={size}
              state={loading ? 'working' : 'default'}
              theme={dark ? 'dark' : 'light'}
              type="clover"
            />
          ) : (
            avatar.avatar
          )
        }
        onClick={onClick}
      />
    );
  },
);

export default Avatar;

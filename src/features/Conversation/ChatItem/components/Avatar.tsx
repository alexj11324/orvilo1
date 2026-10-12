import { DEFAULT_INBOX_AVATAR } from '@orvilo/const';
import { agentDisplayName } from '@orvilo/types';
import { BotAvatar } from 'bot-avatars';
import { type CSSProperties, type MouseEventHandler } from 'react';
import { memo } from 'react';

import A from '@/components/Avatar';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useIsDark } from '@/hooks/useIsDark';
import { useRevealEpoch } from '@/hooks/useRevealEpoch';

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

const DefaultBotAvatar = memo<{ loading?: boolean; size: number }>(({ loading, size }) => {
  const dark = useIsDark();
  // The canvas keeps its drawing layers on the DOM node; after a tab was
  // hidden and shown again they come back empty and only the eyes are drawn.
  const revealEpoch = useRevealEpoch();

  return (
    <BotAvatar
      aria-hidden="true"
      interactive={false}
      key={revealEpoch}
      shading="fabric"
      size={size}
      state={loading ? 'working' : 'default'}
      theme={dark ? 'dark' : 'light'}
      type="clover"
    />
  );
});

const Avatar = memo<AvatarProps>(
  ({ loading, avatar, unoptimized, onClick, size = 28, style, alt, assistantAvatar }) => {
    const useBot = assistantAvatar && (!avatar.avatar || avatar.avatar === DEFAULT_INBOX_AVATAR);
    const displayName = agentDisplayName(avatar);

    // Assistant rows explicitly opt into Libraries.dev/default or custom avatars.
    // Other agent identity surfaces keep the canonical runtime branding from canary.
    if (avatar.agentId && !assistantAvatar) {
      return (
        <div className="inline-flex" style={style} onClick={onClick}>
          <AssigneeAvatar agentId={avatar.agentId} size={size} />
        </div>
      );
    }

    return (
      <A
        alt={alt || displayName}
        animation={loading}
        avatar={useBot ? <DefaultBotAvatar loading={loading} size={size} /> : avatar.avatar}
        background={useBot ? 'transparent' : avatar.backgroundColor}
        name={displayName}
        shape={'square'}
        size={size}
        // The upstream canvas overscans its box for jumps and turns.
        style={useBot ? { ...style, overflow: 'visible' } : style}
        title={displayName}
        unoptimized={unoptimized}
        onClick={onClick}
      />
    );
  },
);

export default Avatar;

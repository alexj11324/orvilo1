import { agentDisplayName } from '@orvilo/types';
import { type CSSProperties, type MouseEventHandler } from 'react';
import { memo } from 'react';

import A from '@/components/Avatar';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';

import { type ChatItemProps } from '../type';

export interface AvatarProps {
  alt?: string;
  avatar: ChatItemProps['avatar'];
  loading?: boolean;
  onClick?: ChatItemProps['onAvatarClick'] | MouseEventHandler<HTMLDivElement>;
  size?: number;
  style?: CSSProperties;
  unoptimized?: boolean;
}

const Avatar = memo<AvatarProps>(
  ({ loading, avatar, unoptimized, onClick, size = 28, style, alt }) => {
    const displayName = agentDisplayName(avatar);

    if (avatar.agentId) {
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
        avatar={avatar.avatar}
        background={avatar.backgroundColor}
        name={displayName}
        shape={'square'}
        size={size}
        style={style}
        title={displayName}
        unoptimized={unoptimized}
        onClick={onClick}
      />
    );
  },
);

export default Avatar;

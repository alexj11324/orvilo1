import { Avatar } from '@lobehub/ui/base-ui';
import { McpIcon, SkillsIcon } from '@lobehub/ui/icons';
import { memo } from 'react';

interface MentionItemIconProps {
  avatar?: string;
  category: 'skill' | 'tool';
  label: string;
  size?: number;
}

const isAvatarPlaceholder = (avatar?: string) => Boolean(avatar && avatar.endsWith('_AVATAR'));

const MentionItemIcon = memo<MentionItemIconProps>(({ avatar, category, label, size = 24 }) => {
  const normalizedAvatar = isAvatarPlaceholder(avatar) ? undefined : avatar;

  if (category === 'tool' && !normalizedAvatar) {
    return (
      <span className="anticon" role="img">
        <McpIcon
          fill={'transparent'}
          height={Math.round(size * 0.8)}
          size={Math.round(size * 0.8)}
          width={Math.round(size * 0.8)}
        />
      </span>
    );
  }

  if (category === 'skill' && !normalizedAvatar) {
    return (
      <span className="anticon" role="img">
        <SkillsIcon
          fill={'transparent'}
          height={Math.round(size * 0.8)}
          size={Math.round(size * 0.8)}
          width={Math.round(size * 0.8)}
        />
      </span>
    );
  }

  return (
    <Avatar
      avatar={normalizedAvatar}
      shape={'square'}
      size={size}
      style={{ flex: 'none', overflow: 'hidden' }}
      title={label}
    />
  );
});

MentionItemIcon.displayName = 'MentionItemIcon';

export default MentionItemIcon;

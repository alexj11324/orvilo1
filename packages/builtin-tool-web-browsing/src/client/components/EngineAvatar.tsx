import { memo } from 'react';

import Avatar from '@/components/Avatar';
import AvatarGroup from '@/components/Avatar/AvatarGroup';

import { ENGINE_ICON_MAP } from '../../const';

interface EngineAvatarGroupProps {
  engines: string[];
}

interface EngineAvatarProps {
  engine: string;
  size?: number;
}
export const EngineAvatar = memo<EngineAvatarProps>(({ engine }) => (
  <Avatar alt={engine} avatar={ENGINE_ICON_MAP[engine]} style={{ height: 16, width: 16 }} />
));

export const EngineAvatarGroup = memo<EngineAvatarGroupProps>(({ engines }) => {
  return (
    <AvatarGroup
      shape={'circle'}
      size={14}
      items={engines.map((engine) => ({
        avatar: ENGINE_ICON_MAP[engine],
        background: 'var(--background)',
        key: engine,
        title: engine,
      }))}
    />
  );
});

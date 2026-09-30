'use client';

import { SkillsIcon } from '@lobehub/ui/icons';
import { cn } from 'cn';
import { type CSSProperties, memo } from 'react';

interface SkillAvatarProps {
  className?: string;
  size?: number;
  style?: CSSProperties;
}

const SkillAvatar = memo<SkillAvatarProps>(({ size = 40, className, style }) => {
  return (
    <div
      className={cn('flex items-center justify-center', className)}
      style={{
        borderRadius: Math.floor(size * 0.1),
        color: '#000',
        height: size,
        overflow: 'hidden',
        width: size,
        ...style,
        flex: none,
      }}
    >
      <SkillsIcon color={'#000'} size={size} style={{ transform: 'scale(0.75)' }} />
    </div>
  );
});

SkillAvatar.displayName = 'SkillAvatar';

export default SkillAvatar;

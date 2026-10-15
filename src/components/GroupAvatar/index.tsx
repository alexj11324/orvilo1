'use client';

import { cn } from 'cn';
import type { ComponentProps } from 'react';

import Avatar, { type AvatarProps } from '@/components/Avatar';

export type GroupAvatarItem = string | Omit<AvatarProps, 'size'>;
export interface GroupAvatarProps extends ComponentProps<'div'> {
  avatars?: GroupAvatarItem[];
  avatarShape?: 'circle' | 'square';
  cornerShape?: 'circle' | 'square';
  grid?: 2 | 3 | 'auto';
  size?: number;
}

/** Native identity collage; each tile uses the existing avatar image/fallback owner. */
export function GroupAvatar({
  avatars = [],
  avatarShape = 'square',
  cornerShape = 'square',
  grid = 2,
  size = 32,
  className,
  style,
  ...rest
}: GroupAvatarProps) {
  const columns = grid === 'auto' ? (avatars.length > 4 ? 3 : 2) : grid;
  const tileSize = Math.floor((size / columns) * (cornerShape === 'circle' ? 0.65 : 0.75));
  const gap = Math.floor((size - tileSize * columns) / (cornerShape === 'circle' ? 6 : 4));
  const visible = avatars.slice(0, columns * columns);
  const single = visible.length === 1;
  return (
    <div
      {...rest}
      style={{ width: size, height: size, ...style }}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden bg-card',
        cornerShape === 'circle' ? 'rounded-full' : 'rounded-(--radius-card)',
        className,
      )}
    >
      <div
        className="grid items-center justify-items-center"
        style={{
          gap,
          gridTemplateColumns: single ? '1fr' : `repeat(${columns}, minmax(0, 1fr))`,
          width: single ? size * 0.8 : tileSize * columns + gap,
        }}
      >
        {visible.map((item, index) => (
          <Avatar
            {...(typeof item === 'string' ? { avatar: item } : item)}
            key={index}
            shape={avatarShape}
            size={single ? size * 0.8 : tileSize}
          />
        ))}
      </div>
    </div>
  );
}

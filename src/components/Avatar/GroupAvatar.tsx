'use client';

import { cn } from 'cn';
import { type HTMLAttributes, memo } from 'react';

import Avatar, { type AvatarProps } from './index';

export type GroupAvatarItem = string | Omit<AvatarProps, 'size'>;

export interface GroupAvatarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  avatars?: GroupAvatarItem[];
  avatarShape?: AvatarProps['shape'];
  /** Outer frame: the rounded entity tile, or a circle. */
  cornerShape?: 'circle' | 'square';
  /** Columns (and rows) of the member grid; `auto` uses 3 above four members. */
  grid?: 2 | 3 | 'auto';
  /** Outer frame width and height in pixels. */
  size?: number;
}

/** Tile and gap sizes for a `gridSize`×`gridSize` member grid inside a `size` frame. */
export const getGroupAvatarLayout = (
  size: number,
  count: number,
  grid: GroupAvatarProps['grid'],
  isCircle: boolean,
) => {
  const gridSize = grid === 'auto' ? (count > 4 ? 3 : 2) : (grid ?? 2);
  const avatarSize = Math.floor((size / gridSize) * (isCircle ? 0.65 : 0.75));
  const gapSize = Math.floor((size - avatarSize * gridSize) / (isCircle ? 6 : 4));
  return { avatarSize, gapSize, gridSize };
};

/**
 * A group identity: up to `grid`² member avatars tiled inside one frame. A
 * single member fills most of the frame instead of a lone grid cell.
 */
const GroupAvatar = memo<GroupAvatarProps>(
  ({
    avatarShape = 'square',
    avatars = [],
    className,
    cornerShape = 'square',
    grid = 2,
    size = 32,
    style,
    ...rest
  }) => {
    const isCircle = cornerShape === 'circle';
    const { avatarSize, gapSize, gridSize } = getGroupAvatarLayout(
      size,
      avatars.length,
      grid,
      isCircle,
    );
    const items = avatars.slice(0, gridSize * gridSize);
    const isSingle = items.length === 1;
    const itemSize = isSingle ? size * 0.8 : avatarSize;

    const tiles = items.map((item, index) =>
      typeof item === 'string' ? (
        <Avatar avatar={item} key={index} shape={avatarShape} size={itemSize} />
      ) : (
        <Avatar {...item} key={index} shape={avatarShape} size={itemSize} />
      ),
    );

    return (
      <div
        style={{ height: size, width: size, ...style }}
        className={cn(
          'relative flex flex-none items-center justify-center overflow-hidden bg-muted',
          isCircle ? 'rounded-full' : 'rounded-(--radius-card)',
          className,
        )}
        {...rest}
      >
        {isSingle ? (
          tiles
        ) : (
          <div
            style={{
              display: 'grid',
              gap: gapSize,
              gridTemplateColumns: `repeat(${gridSize}, ${avatarSize}px)`,
            }}
          >
            {tiles}
          </div>
        )}
      </div>
    );
  },
);
GroupAvatar.displayName = 'GroupAvatar';

export default GroupAvatar;

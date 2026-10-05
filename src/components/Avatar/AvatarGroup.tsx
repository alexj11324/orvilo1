'use client';

import { cn } from 'cn';
import { type CSSProperties, type HTMLAttributes, memo } from 'react';

import Avatar, { type AvatarProps } from './index';

interface AvatarGroupItemType extends Pick<
  AvatarProps,
  'alt' | 'avatar' | 'className' | 'loading' | 'onClick' | 'style' | 'title'
> {
  key: string;
}

interface AvatarGroupProps
  extends
    Pick<
      AvatarProps,
      | 'animation'
      | 'background'
      | 'bordered'
      | 'draggable'
      | 'shadow'
      | 'shape'
      | 'size'
      | 'variant'
    >,
    Omit<HTMLAttributes<HTMLDivElement>, 'draggable' | 'onClick'> {
  classNames?: {
    avatar?: string;
    count?: string;
  };
  /** Spacing between tiles; defaults to a `-size / 4` overlap. */
  gap?: number;
  items: AvatarGroupItemType[];
  /** Cap the rendered tiles; the remainder collapses into a `+N` tile. */
  max?: number;
  onClick?: (props: { item: AvatarGroupItemType; key: string }) => void;
  styles?: {
    avatar?: CSSProperties;
    count?: CSSProperties;
  };
  /** Render earlier tiles on top (reverse stacking). */
  zIndexReverse?: boolean;
}

const AvatarGroup = memo<AvatarGroupProps>(
  ({
    animation,
    background,
    bordered,
    className,
    classNames,
    draggable,
    gap,
    items,
    max,
    onClick,
    shadow,
    shape,
    size = 48,
    style,
    styles: customStyles,
    variant = 'borderless',
    zIndexReverse,
    ...rest
  }) => {
    const avatars = max ? items.slice(0, max) : items;
    const restAvatars = max ? items.slice(max) : [];
    const gapValue = gap ?? Math.floor(-size / 4);
    const avatarProps = {
      animation,
      background,
      bordered,
      draggable,
      shadow,
      shape,
      size,
      variant,
    };

    return (
      <div
        className={cn('flex flex-row', className)}
        style={{ gap, position: 'relative', ...style }}
        {...rest}
      >
        {avatars.map((avatar, index) => {
          const {
            key,
            style: avatarStyle,
            className: avatarClassName,
            ...restAvatarProps
          } = avatar;
          return (
            <Avatar
              className={cn(classNames?.avatar, avatarClassName)}
              key={key}
              onClick={() => onClick?.({ item: avatar, key })}
              {...avatarProps}
              {...restAvatarProps}
              style={{
                marginLeft: index === 0 ? 0 : gapValue,
                zIndex: zIndexReverse ? items.length - index : index,
                ...customStyles?.avatar,
                ...avatarStyle,
              }}
            />
          );
        })}
        {max && restAvatars.length > 0 ? (
          <Avatar
            {...avatarProps}
            avatar={`+${restAvatars.length}`}
            background={'var(--foreground)'}
            className={cn(classNames?.count)}
            style={{
              color: 'var(--background)',
              marginLeft: gapValue,
              zIndex: zIndexReverse ? 0 : avatars.length,
              ...customStyles?.count,
            }}
          />
        ) : null}
      </div>
    );
  },
);
AvatarGroup.displayName = 'AvatarGroup';

export default AvatarGroup;
export { type AvatarGroupItemType, type AvatarGroupProps };

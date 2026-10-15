'use client';

import { cn } from 'cn';
import { memo, useMemo } from 'react';

import GroupAvatar, { type GroupAvatarProps } from '@/components/Avatar/GroupAvatar';
import { Skeleton } from '@/components/ui/skeleton';
import { DEFAULT_AVATAR } from '@/const/meta';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/slices/auth/selectors';

import styles from './GroupAvatar.module.css';

interface GroupAvatarComponentProps extends GroupAvatarProps {
  background?: string;
  loading?: boolean;
}

const GroupAvatarComponent = memo<GroupAvatarComponentProps>(
  ({
    size = 28,
    avatars = [],
    avatarShape = 'square',
    cornerShape = 'square',
    background,
    className,
    loading,
    style,
    ...rest
  }) => {
    const [userAvatar, nickName, username] = useUserStore((s) => [
      userProfileSelectors.userAvatar(s),
      userProfileSelectors.nickName(s),
      userProfileSelectors.username(s),
    ]);

    const groupAvatars = useMemo(() => {
      let displayAvatars = avatars;
      if (displayAvatars.length === 0) {
        displayAvatars = [
          {
            avatar: DEFAULT_AVATAR,
          },
        ];
      }
      return [
        {
          avatar: userAvatar || nickName || username,
          style: { color: 'var(--foreground)' },
        },
        ...displayAvatars,
      ];
    }, [avatars, userAvatar, nickName, username]);

    if (loading)
      return (
        <Skeleton
          className={cn('shrink-0', cornerShape === 'circle' ? 'rounded-full' : styles.identity)}
          style={{ width: size, height: size }}
        />
      );

    return (
      <GroupAvatar
        avatarShape={avatarShape}
        className={className}
        cornerShape={cornerShape}
        size={size}
        style={style ?? (background && background !== 'rgba(0,0,0,0)' ? { background } : undefined)}
        avatars={groupAvatars.map((agent: any) => ({
          avatar: agent.avatar || DEFAULT_AVATAR,
          background: agent?.backgroundColor || undefined,
          ...agent,
        }))}
        {...rest}
      />
    );
  },
);

export default GroupAvatarComponent;

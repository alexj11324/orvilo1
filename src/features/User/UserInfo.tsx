'use client';

import { cssVar } from 'antd-style';
import { type ComponentProps, memo } from 'react';

import ThemeButton from '@/features/User/UserPanel/ThemeButton';
import { useUserStore } from '@/store/user';
import { authSelectors, userProfileSelectors } from '@/store/user/selectors';

import { type UserAvatarProps } from './UserAvatar';
import UserAvatar from './UserAvatar';

export interface UserInfoProps extends ComponentProps<'div'> {
  avatarProps?: Partial<UserAvatarProps>;
  onClick?: () => void;
}

const UserInfo = memo<UserInfoProps>(({ avatarProps, onClick, ...rest }) => {
  const isSignedIn = useUserStore(authSelectors.isLogin);
  const [nickname, username] = useUserStore((s) => [
    userProfileSelectors.nickName(s),
    userProfileSelectors.displayUserName(s),
  ]);

  return (
    <div className="flex items-center gap-3 justify-between py-3 px-3" {...rest}>
      <div className="flex items-center gap-2.5" onClick={onClick}>
        <UserAvatar background={cssVar.colorFill} size={36} {...(avatarProps as any)} />
        <div className="flex flex-col flex-1">
          <div className="font-bold" style={{ lineHeight: 1.4 }}>
            {nickname}
          </div>
          {username && (
            <div className="text-[12px] text-muted-foreground" style={{ lineHeight: 1.4 }}>
              {username}
            </div>
          )}
        </div>
      </div>
      {isSignedIn && <ThemeButton placement={'right'} size={16} />}
    </div>
  );
});

export default UserInfo;

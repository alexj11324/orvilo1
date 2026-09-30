'use client';

import { memo } from 'react';

import DataStatistics from '@/features/User/DataStatistics';
import UserInfo from '@/features/User/UserInfo';
import UserLoginOrSignup from '@/features/User/UserLoginOrSignup/Community';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

const UserBanner = memo(() => {
  const isLoginWithAuth = useUserStore(authSelectors.isLoginWithAuth);
  const [signIn] = useUserStore((s) => [s.openLogin]);

  return (
    <div className="flex flex-col gap-3 py-2">
      {isLoginWithAuth ? (
        <>
          <WorkspaceLink style={{ color: 'inherit' }} to="/settings/profile">
            <UserInfo />
          </WorkspaceLink>
          <WorkspaceLink style={{ color: 'inherit' }} to="/settings/stats">
            <DataStatistics paddingInline={12} />
          </WorkspaceLink>
        </>
      ) : (
        <UserLoginOrSignup
          onClick={() => {
            signIn();
          }}
        />
      )}
    </div>
  );
});

export default UserBanner;

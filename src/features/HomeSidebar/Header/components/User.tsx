'use client';

import { cx } from 'antd-style';
import { ChevronDownIcon } from 'lucide-react';
import { memo } from 'react';

import { useActiveIdentity } from '@/business/client/hooks/useActiveIdentity';
import { ProductLogo } from '@/components/Branding';
import { USER_DROPDOWN_ICON_ID } from '@/features/NavPanel/constants';
import UserAvatar from '@/features/User/UserAvatar';
import UserPanel from '@/features/User/UserPanel';
import { useUserStore } from '@/store/user';
import { authSelectors, userProfileSelectors } from '@/store/user/selectors';

// The dropdown is a button surface, not selectable text. Without
// `user-select: none` a triple-click (or click-drag through the avatar /
// name) paints the system text-selection highlight across the whole row;
// that bright blue is heavier than the Sidebar's active-route fill below
// and inverts the visual hierarchy.

const User = memo<{ lite?: boolean }>(({ lite }) => {
  const [nickname, username, isSignedIn] = useUserStore((s) => [
    userProfileSelectors.nickName(s),
    userProfileSelectors.username(s),
    authSelectors.isLogin(s),
  ]);

  // When in a team workspace, reflect the workspace context in the header
  // (avatar + name) instead of the user's identity. Personal workspaces and
  // OSS builds fall back to the user-level display.
  const activeIdentity = useActiveIdentity();
  const displayAvatar = activeIdentity?.avatar ?? undefined;
  const displayName = activeIdentity?.name ?? (nickname || username);

  return (
    <UserPanel>
      <div
        className={cx(
          'flex min-h-8 min-w-8 cursor-pointer select-none items-center gap-2 overflow-hidden rounded-(--radius-button) ps-0.5 py-0.5 text-sm hover:bg-accent',
          lite ? 'pe-0.5' : 'pe-2',
        )}
      >
        <UserAvatar
          avatarOverride={displayAvatar}
          nameOverride={activeIdentity?.name ?? undefined}
          shape={'square'}
          size={28}
        />
        {!lite && (
          <div className="flex items-center gap-1 overflow-hidden">
            {!isSignedIn && !activeIdentity ? (
              <ProductLogo color="var(--foreground)" size={28} type={'text'} />
            ) : (
              <div className="flex-1 truncate font-medium">{displayName}</div>
            )}
            <ChevronDownIcon
              className="text-foreground-description"
              id={USER_DROPDOWN_ICON_ID}
              size={16}
            />
          </div>
        )}
      </div>
    </UserPanel>
  );
});

export default User;

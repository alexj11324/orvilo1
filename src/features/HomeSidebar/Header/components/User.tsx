'use client';

import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
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
const styles = createStaticStyles(({ css }) => ({
  trigger: css`
    user-select: none;
  `,
}));

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
          styles.trigger,
          'flex cursor-pointer items-center gap-2 py-[2px] hover:bg-[var(--ant-color-fill-tertiary)]',
        )}
        style={{
          borderRadius: 10,
          minWidth: 32,
          overflow: 'hidden',
          paddingInlineEnd: lite ? 2 : 8,
          paddingInlineStart: 2,
        }}
      >
        <UserAvatar
          avatarOverride={displayAvatar}
          nameOverride={activeIdentity?.name ?? undefined}
          shape={'square'}
          size={28}
        />
        {!lite && (
          <div className="flex items-center gap-1" style={{ overflow: 'hidden' }}>
            {!isSignedIn && !activeIdentity ? (
              <ProductLogo color={cssVar.colorText} size={28} type={'text'} />
            ) : (
              <Text ellipsis style={{ flex: 1 }} weight={500}>
                {displayName}
              </Text>
            )}
            <ChevronDownIcon color={cssVar.colorTextDescription} id={USER_DROPDOWN_ICON_ID} />
          </div>
        )}
      </div>
    </UserPanel>
  );
});

export default User;

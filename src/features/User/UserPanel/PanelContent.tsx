import { type FC } from 'react';

import BusinessPanelContent from '@/business/client/features/User/BusinessPanelContent';
import UserPanelAccountSection from '@/business/client/features/User/UserPanelAccountSection';
import UserPanelStatistics from '@/business/client/features/User/UserPanelStatistics';
import Menu, { type MenuProps } from '@/components/Menu';
import { isDesktop } from '@/const/version';
import UserInfo from '@/features/User/UserInfo';
import { useSignOut } from '@/hooks/useSignOut';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import UserLoginOrSignup from '../UserLoginOrSignup';
import { useMenu } from './useMenu';

/**
 * Account-menu contents. Deliberately without a workspace switcher:
 * `ReUIShell/WorkspaceSwitcher` already sits at the top of the sidebar with the
 * same list, the same `workspaceSwitcher.label` heading and the same
 * `switchWorkspace`, so the copy that used to live here was a second entry point
 * for one ability. This menu owns account actions only.
 */
const PanelContent: FC<{ closePopover: () => void }> = ({ closePopover }) => {
  const isLoginWithAuth = useUserStore(authSelectors.isLoginWithAuth);
  const openSignIn = useUserStore((s) => s.openLogin);
  const enableBusinessFeatures = useServerConfigStore(serverConfigSelectors.enableBusinessFeatures);
  const { mainItems, logoutItems } = useMenu();
  const signOut = useSignOut();

  const handleSignIn = () => {
    openSignIn();
    closePopover();
  };

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    closePopover();

    if (key === 'logout') void signOut();
  };

  return (
    <div className="flex flex-col gap-0.5" style={{ minWidth: 300 }}>
      {isDesktop || isLoginWithAuth ? (
        <>
          <UserInfo avatarProps={{ clickable: false }} />
          <UserPanelStatistics />
          {enableBusinessFeatures && <BusinessPanelContent />}
        </>
      ) : (
        <UserLoginOrSignup onClick={handleSignIn} />
      )}

      <Menu items={[...(mainItems ?? []), ...(logoutItems ?? [])]} onClick={handleMenuClick} />

      <UserPanelAccountSection onNavigate={closePopover} />
    </div>
  );
};

export default PanelContent;

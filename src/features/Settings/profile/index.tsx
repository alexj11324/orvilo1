'use client';

import { isDesktop } from '@orvilo/const';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { SettingsProfileRowSkeleton } from '@/components/Skeleton/Settings/Profile';
import { Separator } from '@/components/ui/separator';
import SettingHeader from '@/features/Settings/features/SettingHeader';
import { useServerConfigStore } from '@/store/serverConfig';
import { serverConfigSelectors } from '@/store/serverConfig/selectors';
import { useToolStore } from '@/store/tool';
import { ComposioServerStatus } from '@/store/tool/slices/composioStore';
import { useUserStore } from '@/store/user';
import { authSelectors, userProfileSelectors } from '@/store/user/selectors';

import AvatarRow from './features/AvatarRow';
import ComposioAuthorizationList from './features/ComposioAuthorizationList';
import EmailRow from './features/EmailRow';
import FullNameRow from './features/FullNameRow';
import { JobTitleRow } from './features/JobTitleRow';
import PasswordRow from './features/PasswordRow';
import ProfileRow from './features/ProfileRow';
import SSOProvidersList from './features/SSOProvidersList';
import UsernameRow from './features/UsernameRow';

interface ProfileSettingProps {
  showSettingHeader?: boolean;
}

const ProfileSetting = ({ showSettingHeader = true }: ProfileSettingProps) => {
  const isLogin = useUserStore(authSelectors.isLogin);
  const [userProfile, isUserLoaded] = useUserStore((s) => [
    userProfileSelectors.userProfile(s),
    s.isLoaded,
  ]);
  const isLoadedAuthProviders = useUserStore(authSelectors.isLoadedAuthProviders);
  const fetchAuthProviders = useUserStore((s) => s.fetchAuthProviders);
  const enableComposio = useServerConfigStore(serverConfigSelectors.enableComposio);
  const disableEmailPassword = useServerConfigStore(serverConfigSelectors.disableEmailPassword);
  const [servers, isServersInit, useFetchUserComposioConnections] = useToolStore((s) => [
    s.composioServers,
    s.isComposioServersInit,
    s.useFetchUserComposioConnections,
  ]);
  const connectedServers = servers.filter((s) => s.status === ComposioServerStatus.ACTIVE);

  // Fetch Composio servers
  useFetchUserComposioConnections(enableComposio);

  // Only the core profile rows (avatar / name / username / email) gate on the
  // user record itself. Auth-providers (SSO) and Composio are independent, slower
  // sub-sections that render their own rows when ready — folding them into one
  // composite gate let a single slow/failed dependency skeleton the whole tab.
  const isLoading = !isUserLoaded;

  useEffect(() => {
    if (isLogin) {
      fetchAuthProviders();
    }
  }, [isLogin, fetchAuthProviders]);

  const { t } = useTranslation('auth');

  return (
    <>
      {showSettingHeader && <SettingHeader title={t('profile.title')} />}
      <div className="flex w-full flex-col rounded-xl border border-border bg-card px-4">
        <div className="flex flex-col" style={{ display: isLoading ? 'flex' : 'none' }}>
          <SettingsProfileRowSkeleton />
          <Separator />
          <SettingsProfileRowSkeleton />
          <Separator />
          <SettingsProfileRowSkeleton />
          <Separator />
          <SettingsProfileRowSkeleton />
        </div>
        <div className="flex flex-col" style={{ display: isLoading ? 'none' : 'flex' }}>
          <AvatarRow />

          <Separator />

          {isLogin && userProfile?.email && (
            <>
              <EmailRow />
              <Separator />
            </>
          )}

          <FullNameRow />

          <Separator />

          <JobTitleRow />

          <Separator />

          <UsernameRow />

          {!isDesktop && isLogin && !disableEmailPassword && (
            <>
              <Separator />
              <PasswordRow />
            </>
          )}

          {isLogin && !isDesktop && isLoadedAuthProviders && (
            <>
              <Separator />
              <ProfileRow anchor={'profile-connected-accounts'} label={t('profile.sso.providers')}>
                <SSOProvidersList />
              </ProfileRow>
            </>
          )}

          {enableComposio && isServersInit && connectedServers.length > 0 && (
            <>
              <Separator />
              <ProfileRow
                anchor={'profile-authorizations'}
                label={t('profile.authorizations.title')}
              >
                <ComposioAuthorizationList servers={connectedServers} />
              </ProfileRow>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default ProfileSetting;

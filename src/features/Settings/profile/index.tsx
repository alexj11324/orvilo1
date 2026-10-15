'use client';

import { isDesktop } from '@orvilo/const';
import { cn } from 'cn';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { SettingsProfileRowSkeleton } from '@/components/Skeleton/Settings/Profile';
import { Separator } from '@/components/ui/separator';
import { settingWidthClassNames } from '@/features/Setting/settingWidth';
import SettingHeader from '@/features/Settings/features/SettingHeader';
import { useServerConfigStore } from '@/store/serverConfig';
import { serverConfigSelectors } from '@/store/serverConfig/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors, userProfileSelectors } from '@/store/user/selectors';

import AvatarRow from './features/AvatarRow';
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
  const disableEmailPassword = useServerConfigStore(serverConfigSelectors.disableEmailPassword);

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
      <div
        className={cn(
          'mx-auto flex w-full flex-col rounded-(--radius-card) border border-border bg-card px-4',
          settingWidthClassNames.form,
        )}
      >
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
        </div>
      </div>
    </>
  );
};

export default ProfileSetting;

'use client';
import { isDesktop } from '@orvilo/const';
import { ExternalLinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { getHostPort } from '@/platform';
import { useServerConfigStore } from '@/store/serverConfig';
import { serverConfigSelectors } from '@/store/serverConfig/selectors';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import ProfileRow from './ProfileRow';

/**
 * Email changes are owned by the accounts portal (Clerk). Both platforms link
 * out — desktop via the system browser, web via a new tab.
 */
const EmailRow = () => {
  const { t } = useTranslation('auth');
  const email = useUserStore(userProfileSelectors.email);
  const accountsUrl = useServerConfigStore(serverConfigSelectors.authAccountsUrl);

  const openAccountsPortal = () => {
    if (isDesktop) {
      void getHostPort().openExternal(accountsUrl);
      return;
    }
    window.open(accountsUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <ProfileRow
      anchor={'profile-email'}
      label={t('profile.email')}
      action={
        <Button
          className="text-sm"
          style={{ cursor: 'pointer', fontSize: 13 }}
          type="button"
          variant="link"
          onClick={openAccountsPortal}
        >
          <div className="flex items-center gap-2">
            {t('profile.updateEmail')}
            <ExternalLinkIcon className="shrink-0" size={12} />
          </div>
        </Button>
      }
    >
      <span>{email || '--'}</span>
    </ProfileRow>
  );
};

export default EmailRow;

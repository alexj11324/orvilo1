'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { isDesktop } from '@orvilo/const';
import { ExternalLinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { electronSystemService } from '@/services/electron/system';
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
      void electronSystemService.openExternalLink(accountsUrl);
      return;
    }
    window.open(accountsUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <ProfileRow
      anchor={'profile-email'}
      label={t('profile.email')}
      action={
        <Text style={{ cursor: 'pointer', fontSize: 13 }} onClick={openAccountsPortal}>
          <Flexbox horizontal align={'center'} gap={4}>
            {t('profile.updateEmail')}
            <Icon icon={ExternalLinkIcon} size={12} />
          </Flexbox>
        </Text>
      }
    >
      <Text>{email || '--'}</Text>
    </ProfileRow>
  );
};

export default EmailRow;

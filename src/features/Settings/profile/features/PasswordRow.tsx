'use client';

import { Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { ExternalLinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useServerConfigStore } from '@/store/serverConfig';
import { serverConfigSelectors } from '@/store/serverConfig/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import ProfileRow from './ProfileRow';

/**
 * Password set/reset is owned by the accounts portal (Clerk) — the row links
 * out instead of calling a local reset endpoint.
 */
const PasswordRow = () => {
  const { t } = useTranslation('auth');
  const hasPasswordAccount = useUserStore(authSelectors.hasPasswordAccount);
  const accountsUrl = useServerConfigStore(serverConfigSelectors.authAccountsUrl);

  return (
    <ProfileRow
      anchor={'profile-password'}
      label={t('profile.password')}
      action={
        <Text
          style={{ cursor: 'pointer', fontSize: 13 }}
          onClick={() => window.open(accountsUrl, '_blank', 'noopener,noreferrer')}
        >
          {hasPasswordAccount ? t('profile.changePassword') : t('profile.setPassword')}{' '}
          <Icon icon={ExternalLinkIcon} size={12} style={{ verticalAlign: 'middle' }} />
        </Text>
      }
    >
      <Text fontSize={12} type={'secondary'}>
        {hasPasswordAccount ? '••••••••' : '--'}
      </Text>
    </ProfileRow>
  );
};

export default PasswordRow;

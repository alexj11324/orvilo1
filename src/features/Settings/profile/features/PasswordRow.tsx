'use client';

import { ExternalLinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { Button } from '@/components/ui/button';
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
  const error = useUserStore((state) => state.authProvidersError);
  const retry = useUserStore((state) => state.refreshAuthProviders);
  const accountsUrl = useServerConfigStore(serverConfigSelectors.authAccountsUrl);

  return (
    <ProfileRow
      anchor={'profile-password'}
      label={t('profile.password')}
      action={
        <Button
          className="text-sm"
          style={{ cursor: 'pointer', fontSize: 13 }}
          type="button"
          variant="link"
          onClick={() => window.open(accountsUrl, '_blank', 'noopener,noreferrer')}
        >
          {error
            ? t('profile.sso.manageOnPortal')
            : hasPasswordAccount
              ? t('profile.changePassword')
              : t('profile.setPassword')}{' '}
          <ExternalLinkIcon className="shrink-0" size={12} style={{ verticalAlign: 'middle' }} />
        </Button>
      }
    >
      {error ? (
        <AsyncError error={error} variant="inline" onRetry={() => void retry()} />
      ) : (
        <span>{hasPasswordAccount ? '••••••••' : '--'}</span>
      )}
    </ProfileRow>
  );
};

export default PasswordRow;

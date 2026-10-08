import { ExternalLinkIcon } from 'lucide-react';
import { type CSSProperties } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import AuthIcons from '@/components/AuthIcons';
import { Button } from '@/components/ui/button';
import { useServerConfigStore } from '@/store/serverConfig';
import { serverConfigSelectors } from '@/store/serverConfig/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

const providerNameStyle: CSSProperties = {
  textTransform: 'capitalize',
};

/**
 * Linked sign-in methods, sourced from Clerk via `/api/auth/accounts`.
 * Linking/unlinking lives on the accounts portal — the list is read-only here.
 */
export const SSOProvidersList = memo(() => {
  const providers = useUserStore(authSelectors.authProviders);
  const error = useUserStore((state) => state.authProvidersError);
  const retry = useUserStore((state) => state.refreshAuthProviders);
  const accountsUrl = useServerConfigStore(serverConfigSelectors.authAccountsUrl);
  const { t } = useTranslation('auth');

  if (error) return <AsyncError error={error} variant="inline" onRetry={() => void retry()} />;

  return (
    <div className="flex flex-col gap-2">
      {providers.map((item) => (
        <div
          className="flex flex-row gap-[6px] items-center"
          key={[item.provider, item.providerAccountId].join('-')}
          style={{ fontSize: 12 }}
        >
          {AuthIcons(item.provider, 16)}
          <span style={providerNameStyle}>{item.provider}</span>
          {item.email && <span className="text-[11px] text-muted-foreground">· {item.email}</span>}
        </div>
      ))}

      {providers.length === 0 && <span>--</span>}

      <Button
        className="text-[12px] text-muted-foreground"
        style={{ cursor: 'pointer' }}
        type="button"
        variant="link"
        onClick={() => window.open(accountsUrl, '_blank', 'noopener,noreferrer')}
      >
        <div className="flex items-center gap-1">
          {t('profile.sso.manageOnPortal')}
          <ExternalLinkIcon className="shrink-0" size={12} />
        </div>
      </Button>
    </div>
  );
});

export default SSOProvidersList;

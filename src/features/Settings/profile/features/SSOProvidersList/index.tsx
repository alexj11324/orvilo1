import { Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { ExternalLinkIcon } from 'lucide-react';
import { type CSSProperties } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AuthIcons from '@/components/AuthIcons';
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
  const accountsUrl = useServerConfigStore(serverConfigSelectors.authAccountsUrl);
  const { t } = useTranslation('auth');

  return (
    <Flexbox gap={8}>
      {providers.map((item) => (
        <Flexbox
          horizontal
          align={'center'}
          gap={6}
          key={[item.provider, item.providerAccountId].join('-')}
          style={{ fontSize: 12 }}
        >
          {AuthIcons(item.provider, 16)}
          <span style={providerNameStyle}>{item.provider}</span>
          {item.email && (
            <Text fontSize={11} type="secondary">
              · {item.email}
            </Text>
          )}
        </Flexbox>
      ))}

      {providers.length === 0 && (
        <Text fontSize={11} type="secondary">
          --
        </Text>
      )}

      <Text
        fontSize={12}
        style={{ cursor: 'pointer' }}
        type="secondary"
        onClick={() => window.open(accountsUrl, '_blank', 'noopener,noreferrer')}
      >
        <Flexbox horizontal align={'center'} gap={4}>
          {t('profile.sso.manageOnPortal')}
          <Icon icon={ExternalLinkIcon} size={12} />
        </Flexbox>
      </Text>
    </Flexbox>
  );
});

export default SSOProvidersList;

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import { type TokenBreakdown } from './useTokenBreakdown';

interface TokenDetailsProps {
  breakdown: TokenBreakdown;
}

/** Estimated context composition; these are not provider-reported usage or costs. */
const TokenDetails = memo<TokenDetailsProps>(({ breakdown }) => {
  const { t, i18n } = useTranslation('chat');
  const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);
  const { chatsToken, historySummaryToken, maxTokens, systemRoleToken, toolsToken, totalToken } =
    breakdown;
  const format = new Intl.NumberFormat(i18n.language);
  const rows = [
    ...(isDevMode
      ? [
          { label: t('tokenDetails.systemRole'), value: systemRoleToken },
          { label: t('tokenDetails.tools'), value: toolsToken },
          { label: t('tokenDetails.historySummary'), value: historySummaryToken },
          { label: t('tokenDetails.chats'), value: chatsToken },
        ]
      : []),
    { label: t('tokenDetails.used'), value: totalToken },
    { label: t('tokenDetails.rest'), value: Math.max(0, maxTokens - totalToken) },
  ];

  return (
    <dl className="space-y-2">
      {rows.map(({ label, value }) => (
        <div className="flex items-center justify-between gap-3 text-xs" key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="tabular-nums">{format.format(value)}</dd>
        </div>
      ))}
    </dl>
  );
});

TokenDetails.displayName = 'ContextWindowTokenDetails';

export default TokenDetails;

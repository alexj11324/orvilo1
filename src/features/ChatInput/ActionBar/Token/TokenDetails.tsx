import { cssVar } from 'antd-style';
import numeral from 'numeral';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import { SimpleTooltip } from '../../SimpleTooltip';
import TokenProgress from './TokenProgress';
import { type TokenBreakdown } from './useTokenBreakdown';

interface TokenDetailsProps {
  breakdown: TokenBreakdown;
}

const TokenDetails = memo<TokenDetailsProps>(({ breakdown }) => {
  const { t } = useTranslation(['chat', 'components']);

  const { chatsToken, historySummaryToken, maxTokens, systemRoleToken, toolsToken, totalToken } =
    breakdown;
  const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);

  return (
    <div className="flex flex-col gap-3" style={{ minWidth: 200 }}>
      <div className="flex flex-row items-center gap-1 justify-between w-[100%]">
        <div style={{ color: cssVar.colorTextDescription }}>{t('tokenDetails.title')}</div>
        <SimpleTooltip
          contentStyle={{ maxWidth: 'unset', pointerEvents: 'none' }}
          title={t('ModelSelect.featureTag.tokens', {
            ns: 'components',
            tokens: numeral(maxTokens).format('0,0'),
          })}
        >
          <div
            className="flex flex-col items-center justify-center h-[20px] px-1"
            style={{
              background: cssVar.colorFillTertiary,
              borderRadius: 4,
              color: cssVar.colorTextSecondary,
              fontFamily: cssVar.fontFamilyCode,
              fontSize: 11,
            }}
          >
            TOKEN
          </div>
        </SimpleTooltip>
      </div>
      {isDevMode && (
        <TokenProgress
          showIcon
          data={[
            {
              color: cssVar.magenta,
              id: 'systemRole',
              title: t('tokenDetails.systemRole'),
              value: systemRoleToken,
            },
            {
              color: cssVar.geekblue,
              id: 'tools',
              title: t('tokenDetails.tools'),
              value: toolsToken,
            },
            {
              color: cssVar.orange,
              id: 'historySummary',
              title: t('tokenDetails.historySummary'),
              value: historySummaryToken,
            },
            {
              color: cssVar.gold,
              id: 'chats',
              title: t('tokenDetails.chats'),
              value: chatsToken,
            },
          ]}
        />
      )}
      <TokenProgress
        showIcon={isDevMode}
        showTotal={t('tokenDetails.total')}
        data={[
          {
            color: cssVar.colorSuccess,
            id: 'used',
            title: t('tokenDetails.used'),
            value: totalToken,
          },
          {
            color: cssVar.colorFill,
            id: 'rest',
            title: t('tokenDetails.rest'),
            value: maxTokens - totalToken,
          },
        ]}
      />
    </div>
  );
});

TokenDetails.displayName = 'ContextWindowTokenDetails';

export default TokenDetails;

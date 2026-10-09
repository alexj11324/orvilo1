import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextTrigger,
} from '@/components/ai-elements/context';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import TokenDetails from './TokenDetails';
import { useTokenBreakdown } from './useTokenBreakdown';

const Token = memo(() => {
  const { t } = useTranslation('chat');

  const { chatsToken, historySummaryToken, maxTokens, systemRoleToken, toolsToken, totalToken } =
    useTokenBreakdown();
  const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);
  const content = useMemo(
    () => (
      <TokenDetails
        breakdown={{
          chatsToken,
          historySummaryToken,
          maxTokens,
          systemRoleToken,
          toolsToken,
          totalToken,
        }}
      />
    ),
    [chatsToken, historySummaryToken, maxTokens, systemRoleToken, toolsToken, totalToken],
  );

  // Keep the composer quiet for regular users until context pressure is real;
  // dev mode always shows the tag for inspection.
  if (!isDevMode && maxTokens > 0 && totalToken / maxTokens <= 0.5) return null;

  return (
    <Context maxTokens={maxTokens} usedTokens={totalToken}>
      <ContextTrigger aria-label={t('tokenDetails.title')} className="h-7 gap-1 px-1 text-xs" />
      <ContextContent align="end" side="top">
        <ContextContentHeader />
        <ContextContentBody>{content}</ContextContentBody>
      </ContextContent>
    </Context>
  );
});

Token.displayName = 'ContextWindowToken';

export default Token;

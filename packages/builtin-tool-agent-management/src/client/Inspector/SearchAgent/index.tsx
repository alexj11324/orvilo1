'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { highlightTextStyles, shinyTextStyles } from '@/styles';

import type { SearchAgentParams, SearchAgentSource } from '../../../types';

const getSourceTitleKey = (source: SearchAgentSource = 'all') => {
  switch (source) {
    case 'user': {
      return 'builtins.orvilo-agent-management.inspector.searchAgent.user';
    }
    case 'market': {
      return 'builtins.orvilo-agent-management.inspector.searchAgent.market';
    }
    default: {
      return 'builtins.orvilo-agent-management.inspector.searchAgent.all';
    }
  }
};

export const SearchAgentInspector = memo<BuiltinInspectorProps<SearchAgentParams>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const keyword = args?.keyword || partialArgs?.keyword;
    const source = args?.source || partialArgs?.source || 'all';

    const titleKey = useMemo(() => getSourceTitleKey(source), [source]);

    if (isArgumentsStreaming && !keyword) {
      return (
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-agent-management.apiName.searchAgent')}
          </span>
        </div>
      );
    }

    return (
      <div className="flex flex-row items-center gap-2 overflow-hidden">
        <span
          className={cn(
            'shrink-0 whitespace-nowrap text-muted-foreground',
            isArgumentsStreaming && shinyTextStyles.shinyText,
          )}
        >
          {t(titleKey)}
        </span>
        {keyword && <span className={highlightTextStyles.primary}>{keyword}</span>}
      </div>
    );
  },
);

SearchAgentInspector.displayName = 'SearchAgentInspector';

export default SearchAgentInspector;

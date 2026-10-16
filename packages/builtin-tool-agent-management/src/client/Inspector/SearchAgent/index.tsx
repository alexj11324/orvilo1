'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { highlightTextStyles, shinyTextStyles } from '@/styles';

import type { SearchAgentParams } from '../../../types';

export const SearchAgentInspector = memo<BuiltinInspectorProps<SearchAgentParams>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const keyword = args?.keyword || partialArgs?.keyword;

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
          {t('builtins.orvilo-agent-management.inspector.searchAgent.user')}
        </span>
        {keyword && <span className={highlightTextStyles.primary}>{keyword}</span>}
      </div>
    );
  },
);

SearchAgentInspector.displayName = 'SearchAgentInspector';

export default SearchAgentInspector;

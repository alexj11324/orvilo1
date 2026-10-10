'use client';

import type { ReplaceTextArgs } from '@orvilo/editor-runtime';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { ArrowRight } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { ReplaceTextState } from '../../../types';

const styles = {
  arrow: 'mx-1 text-[var(--ant-color-text-quaternary)]',
  from: 'text-muted-foreground line-through',
  title: 'me-2 text-foreground',
};

export const ReplaceTextInspector = memo<BuiltinInspectorProps<ReplaceTextArgs, ReplaceTextState>>(
  ({ args, partialArgs, isArgumentsStreaming, pluginState }) => {
    const { t } = useTranslation('plugin');

    const from = args?.searchText || partialArgs?.searchText;
    const to = args?.newText ?? partialArgs?.newText;

    // During streaming without searchText yet, show init message
    if (isArgumentsStreaming && !from) {
      return (
        <div className={inspectorTextStyles.root}>
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-page-agent.apiName.replaceText.init')}
          </span>
        </div>
      );
    }

    const count = pluginState?.replacementCount ?? 0;
    const hasResult = from && to !== undefined;

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn(styles.title, isArgumentsStreaming && shinyTextStyles.shinyText)}>
          {t('builtins.orvilo-page-agent.apiName.replaceText')}
        </span>
        {hasResult && (
          <>
            <span className={styles.from}>{from}</span>
            <ArrowRight className={styles.arrow} size={12} />
            <span className={highlightTextStyles.gold}>
              {to || t('builtins.orvilo-page-agent.apiName.replaceText.empty')}
            </span>
            {count > 0 && (
              <span className="font-mono rounded bg-muted px-1 text-[12px] text-muted-foreground">
                {' '}
                ({t('builtins.orvilo-page-agent.apiName.replaceText.count', { count })})
              </span>
            )}
          </>
        )}
      </div>
    );
  },
);

ReplaceTextInspector.displayName = 'ReplaceTextInspector';

export default ReplaceTextInspector;

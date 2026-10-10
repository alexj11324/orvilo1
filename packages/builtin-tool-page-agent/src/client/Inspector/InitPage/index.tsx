'use client';

import type { InitDocumentArgs } from '@orvilo/editor-runtime';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { Plus } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { oneLineEllipsis, shinyTextStyles } from '@/styles';

import type { InitDocumentState } from '../../../types';
import { AnimatedNumber } from '../../components/AnimatedNumber';

const styles = {
  title: 'me-2 text-foreground',
};

export const InitPageInspector = memo<BuiltinInspectorProps<InitDocumentArgs, InitDocumentState>>(
  ({ args, partialArgs, isArgumentsStreaming, pluginState }) => {
    const { t } = useTranslation('plugin');

    // Calculate lines and chars from markdown content
    const markdown = args?.markdown || partialArgs?.markdown || '';
    const lines = markdown ? markdown.split('\n').length : 0;
    const chars = markdown.length;

    // If we have state, use nodeCount as lines indicator
    const displayLines = pluginState?.nodeCount || lines;
    const hasContent = displayLines > 0 || chars > 0;

    // During streaming without content, show init
    if (isArgumentsStreaming) {
      if (!hasContent)
        return (
          <div className={oneLineEllipsis}>
            <span className={shinyTextStyles.shinyText}>
              {t('builtins.orvilo-page-agent.apiName.initPage')}
            </span>
          </div>
        );

      // During streaming with content, show "creating" title with shiny effect
      return (
        <div className={oneLineEllipsis}>
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-page-agent.apiName.initPage.creating')}
          </span>
          {displayLines > 0 && (
            <span
              className="font-mono rounded bg-muted px-1 text-[12px]"
              style={{ color: 'var(--success)' }}
            >
              {' '}
              <Plus size={12} />
              <AnimatedNumber value={displayLines} />
              {t('builtins.orvilo-page-agent.apiName.initPage.lines')}
            </span>
          )}
          {chars > 0 && (
            <span
              className="font-mono rounded bg-muted px-1 text-[12px]"
              style={{ color: 'var(--ant-color-text-description)' }}
            >
              {' '}
              <AnimatedNumber value={chars} />
              {t('builtins.orvilo-page-agent.apiName.initPage.chars')}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className={oneLineEllipsis}>
        <span className={styles.title}>
          {t('builtins.orvilo-page-agent.apiName.initPage.result')}
        </span>
        {displayLines > 0 && (
          <span
            className="font-mono rounded bg-muted px-1 text-[12px]"
            style={{ color: 'var(--success)' }}
          >
            <Plus size={12} />
            <AnimatedNumber value={displayLines} />
            {t('builtins.orvilo-page-agent.apiName.initPage.lines')}
          </span>
        )}
        {chars > 0 && (
          <span
            className="font-mono rounded bg-muted px-1 text-[12px]"
            style={{ color: 'var(--ant-color-text-description)' }}
          >
            {' '}
            <AnimatedNumber value={chars} />
            {t('builtins.orvilo-page-agent.apiName.initPage.chars')}
          </span>
        )}
      </div>
    );
  },
);

InitPageInspector.displayName = 'InitPageInspector';

export default InitPageInspector;

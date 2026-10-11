'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { VentCategory, VentParams, VentState } from '../../../types';

const CATEGORY_LABEL_KEYS = {
  doc_conflict: 'builtins.orvilo-agent.apiName.vent.category.doc_conflict',
  env_limitation: 'builtins.orvilo-agent.apiName.vent.category.env_limitation',
  missing_tool: 'builtins.orvilo-agent.apiName.vent.category.missing_tool',
  other: 'builtins.orvilo-agent.apiName.vent.category.other',
  platform_bug: 'builtins.orvilo-agent.apiName.vent.category.platform_bug',
  schema_mismatch: 'builtins.orvilo-agent.apiName.vent.category.schema_mismatch',
} as const satisfies Record<VentCategory, string>;

const getTitleKey = (category?: VentCategory) =>
  category ? CATEGORY_LABEL_KEYS[category] : ('builtins.orvilo-agent.apiName.vent' as const);

const styles = {
  iconRecorded: 'shrink-0 text-success-text',
  iconRejected: 'shrink-0 text-warning-text',
  meta: 'shrink-0 text-xs leading-5 text-foreground-tertiary',
  summary: 'min-w-0 max-w-80 truncate',
};

export const VentInspector = memo<BuiltinInspectorProps<VentParams, VentState>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
    const { t } = useTranslation('plugin');

    const data = args ?? partialArgs;
    const summary = data?.summary;
    const hasContext = Boolean(summary || data?.category);
    const title = t(getTitleKey(data?.category));

    if (isArgumentsStreaming && !hasContext) {
      return (
        <div className={cn(inspectorTextStyles.root, 'text-sm leading-5.5')}>
          <span className={shinyTextStyles.shinyText}>{title}</span>
        </div>
      );
    }

    const isSettled = !isArgumentsStreaming && !isLoading && !!pluginState;

    return (
      <div className={cn(inspectorTextStyles.root, 'flex-wrap gap-1 text-sm leading-5.5')}>
        <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
          {title}
        </span>
        {summary && (
          <span className={cn(highlightTextStyles.primary, styles.summary)}>{summary}</span>
        )}
        {isSettled &&
          pluginState &&
          (pluginState.recorded ? (
            <CheckCircle2 className={styles.iconRecorded} size={14} />
          ) : (
            <>
              <CircleAlert className={styles.iconRejected} size={14} />
              <span className={styles.meta}>
                {t('builtins.orvilo-agent.apiName.vent.rejected')}
              </span>
            </>
          ))}
      </div>
    );
  },
);

VentInspector.displayName = 'VentInspector';

export default VentInspector;

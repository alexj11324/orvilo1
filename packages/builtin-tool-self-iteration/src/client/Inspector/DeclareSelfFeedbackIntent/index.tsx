'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cx } from 'antd-style';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type {
  DeclareSelfFeedbackIntentParams,
  DeclareSelfFeedbackIntentState,
} from '../../../types';

const getIntentLabelKey = (data?: Partial<DeclareSelfFeedbackIntentParams>) => {
  if (data?.kind === 'memory' && data.action === 'write') {
    return 'builtins.orvilo-self-feedback-intent.inspector.memory.write';
  }

  if (data?.kind === 'skill' && data.action === 'create') {
    return 'builtins.orvilo-self-feedback-intent.inspector.skill.create';
  }

  if (data?.kind === 'skill' && data.action === 'refine') {
    return 'builtins.orvilo-self-feedback-intent.inspector.skill.refine';
  }

  if (data?.kind === 'skill' && data.action === 'consolidate') {
    return 'builtins.orvilo-self-feedback-intent.inspector.skill.consolidate';
  }

  if (data?.kind === 'gap' && data.action === 'proposal') {
    return 'builtins.orvilo-self-feedback-intent.inspector.gap.proposal';
  }

  return 'builtins.orvilo-self-feedback-intent.apiName.declareSelfFeedbackIntent';
};

const styles = {
  iconAccepted: 'shrink-0 text-success-text',
  iconRejected: 'shrink-0 text-warning-text',
  meta: 'shrink-0 text-xs leading-5 text-foreground-tertiary',
  summary: 'overflow-hidden min-w-0 max-w-80 text-ellipsis whitespace-nowrap',
};

export const DeclareSelfFeedbackIntentInspector = memo<
  BuiltinInspectorProps<DeclareSelfFeedbackIntentParams, DeclareSelfFeedbackIntentState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const data = args ?? partialArgs;
  const summary = data?.summary;
  const hasContext = Boolean(summary || data?.kind || data?.action);
  const title = t(getIntentLabelKey(data));

  if (isArgumentsStreaming && !hasContext) {
    return (
      <div className={cx(inspectorTextStyles.root, 'text-sm leading-5.5')}>
        <span className={shinyTextStyles.shinyText}>{title}</span>
      </div>
    );
  }

  const isSettled = !isArgumentsStreaming && !isLoading && !!pluginState;

  return (
    <div
      className={cx(inspectorTextStyles.root, 'text-sm leading-5.5')}
      style={{ flexWrap: 'wrap', gap: 4 }}
    >
      <span className={cx((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {title}
      </span>
      {summary && (
        <span className={cx(highlightTextStyles.primary, styles.summary)}>{summary}</span>
      )}
      {isSettled &&
        pluginState &&
        (pluginState.accepted ? (
          <CheckCircle2 className={styles.iconAccepted} size={16} />
        ) : (
          <>
            <CircleAlert className={styles.iconRejected} size={16} />
            <span className={styles.meta}>
              {t('builtins.orvilo-self-feedback-intent.inspector.rejected')}
            </span>
          </>
        ))}
    </div>
  );
});

DeclareSelfFeedbackIntentInspector.displayName = 'DeclareSelfFeedbackIntentInspector';

export default DeclareSelfFeedbackIntentInspector;

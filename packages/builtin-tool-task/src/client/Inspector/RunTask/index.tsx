'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Play } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { RunTaskParams, RunTaskState } from '../../../types';

const styles = {
  identifierChip:
    'shrink-0 rounded-[999px] bg-accent px-2 py-0.5 font-mono text-[12px] text-muted-foreground',
  promptChip:
    'inline-flex min-w-0 max-w-[240px] shrink items-center truncate rounded-[999px] bg-accent px-2 py-0.5 text-[12px] text-foreground',
  separator: 'shrink-0 text-[var(--ant-color-text-quaternary)]',
};

export const RunTaskInspector = memo<BuiltinInspectorProps<RunTaskParams, RunTaskState>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
    const { t } = useTranslation('plugin');

    const params = args || partialArgs || ({} as Partial<RunTaskParams>);
    const identifier = params.identifier;
    const continueTopicId = params.continueTopicId;
    const prompt = params.prompt;

    return (
      <div className={inspectorTextStyles.root} style={{ flexWrap: 'wrap', gap: 4 }}>
        <Play size={12} style={{ color: 'var(--warning)' }} />
        <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
          {t('builtins.orvilo-task.apiName.runTask')}
        </span>
        {identifier && (
          <span className={styles.identifierChip} style={{ marginInlineStart: 4 }}>
            {identifier}
          </span>
        )}
        {continueTopicId && (
          <>
            <span className={styles.separator}>·</span>
            <span style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
              {t('builtins.orvilo-task.run.continueTopic')}
            </span>
          </>
        )}
        {prompt && (
          <>
            <span className={styles.separator}>·</span>
            <span className={styles.promptChip}>{prompt}</span>
          </>
        )}
      </div>
    );
  },
);

RunTaskInspector.displayName = 'RunTaskInspector';

export default RunTaskInspector;

'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { Play } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { RunTaskParams, RunTaskState } from '../../../types';
import { InlineField, monoChipClassName, SectionField, TaskResultCard } from '../shared';

const styles = {
  topicChip:
    'inline-flex items-center gap-1 self-start rounded-[999px] bg-[var(--ant-color-info-bg)] px-2 py-0.5 text-[12px] text-info',
};

export const RunTaskRender = memo<BuiltinRenderProps<RunTaskParams, RunTaskState>>(
  ({ args, pluginState }) => {
    const { t } = useTranslation('plugin');

    const params = args ?? ({} as Partial<RunTaskParams>);
    const identifier = pluginState?.identifier ?? params.identifier;
    const prompt = params.prompt;
    const continueTopic = !!params.continueTopicId;
    const topicId = pluginState?.topicId;

    const hasBody = !!prompt || continueTopic || !!topicId;

    return (
      <TaskResultCard
        icon={Play}
        iconColor={'var(--warning)'}
        identifier={identifier}
        title={t('builtins.orvilo-task.apiName.runTask')}
      >
        {hasBody ? (
          <>
            {continueTopic && (
              <span className={styles.topicChip}>
                {t('builtins.orvilo-task.run.continueTopic')}
              </span>
            )}
            {prompt && (
              <SectionField label={t('builtins.orvilo-task.run.prompt')}>
                <Markdown fontSize={12} variant={'chat'}>
                  {prompt}
                </Markdown>
              </SectionField>
            )}
            {topicId && (
              <InlineField label={t('builtins.orvilo-task.run.topic')}>
                <span className={monoChipClassName}>{topicId}</span>
              </InlineField>
            )}
          </>
        ) : null}
      </TaskResultCard>
    );
  },
);

RunTaskRender.displayName = 'RunTaskRender';

export default RunTaskRender;

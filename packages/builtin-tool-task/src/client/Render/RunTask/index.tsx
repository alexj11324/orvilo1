'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { Play } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { RunTaskParams, RunTaskState } from '../../../types';
import { InlineField, monoChipClassName, SectionField, TaskResultCard } from '../shared';

const styles = createStaticStyles(({ css, cssVar }) => ({
  topicChip: css`
    display: inline-flex;
    gap: 4px;
    align-items: center;
    align-self: flex-start;

    padding-block: 2px;
    padding-inline: 8px;
    border-radius: 999px;

    font-size: 12px;
    color: ${cssVar.colorInfo};

    background: ${cssVar.colorInfoBg};
  `,
}));

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
        iconColor={cssVar.colorWarning}
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

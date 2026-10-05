'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { highlightTextStyles, shinyTextStyles } from '@/styles';

import type { UpdatePromptParams } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  root: css`
    overflow: hidden;
    display: flex;
    gap: 8px;
    align-items: center;
  `,
  title: css`
    flex-shrink: 0;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;
  `,
}));

export const UpdatePromptInspector = memo<BuiltinInspectorProps<UpdatePromptParams>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const agentId = args?.agentId || partialArgs?.agentId;

    if (isArgumentsStreaming && !agentId) {
      return (
        <div className={styles.root}>
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-agent-management.apiName.updatePrompt')}
          </span>
        </div>
      );
    }

    return (
      <div className={cx('flex flex-row items-center gap-2', styles.root)}>
        <span className={cx(styles.title, isArgumentsStreaming && shinyTextStyles.shinyText)}>
          {t('builtins.orvilo-agent-management.inspector.updatePrompt.title')}
        </span>
        {agentId && <span className={highlightTextStyles.primary}>{agentId}</span>}
      </div>
    );
  },
);

UpdatePromptInspector.displayName = 'UpdatePromptInspector';

export default UpdatePromptInspector;

'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { ClearTodosParams, ClearTodosState } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  mode: css`
    padding-block-end: 1px;
    color: ${cssVar.colorText};
    background: linear-gradient(to top, ${cssVar.colorWarningBg} 40%, transparent 40%);
  `,
}));

export const ClearTodosInspector = memo<BuiltinInspectorProps<ClearTodosParams, ClearTodosState>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const mode = args?.mode || partialArgs?.mode;

    if (isArgumentsStreaming && !mode) {
      return (
        <div className={inspectorTextStyles.root}>
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-agent.apiName.clearTodos')}
          </span>
        </div>
      );
    }

    const modeLabel =
      mode === 'all'
        ? t('builtins.orvilo-agent.apiName.clearTodos.modeAll')
        : t('builtins.orvilo-agent.apiName.clearTodos.modeCompleted');

    return (
      <div
        className={cx(inspectorTextStyles.root, isArgumentsStreaming && shinyTextStyles.shinyText)}
      >
        <Trans
          components={{ mode: <span className={styles.mode} /> }}
          i18nKey="builtins.orvilo-agent.apiName.clearTodos.result"
          ns="plugin"
          values={{ mode: modeLabel }}
        />
      </div>
    );
  },
);

ClearTodosInspector.displayName = 'ClearTodosInspector';

export default ClearTodosInspector;

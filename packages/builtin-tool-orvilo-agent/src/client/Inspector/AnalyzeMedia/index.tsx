'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cssVar, cx } from 'antd-style';
import { memo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { highlightTextStyles, inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { AnalyzeMediaParams, AnalyzeMediaState } from '../../../types';

const getArrayLength = (value?: string[]) => (Array.isArray(value) ? value.length : 0);

export const AnalyzeMediaInspector = memo<
  BuiltinInspectorProps<AnalyzeMediaParams, AnalyzeMediaState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const question = args?.question || partialArgs?.question;
  const mediaCount =
    pluginState?.files?.length ??
    getArrayLength(args?.refs || partialArgs?.refs) +
      getArrayLength(args?.urls || partialArgs?.urls);

  if (isArgumentsStreaming && !question) {
    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-agent.apiName.analyzeMedia')}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cx(
        inspectorTextStyles.root,
        (isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText,
      )}
    >
      {question ? (
        <Trans
          components={{ question: <span className={highlightTextStyles.primary} /> }}
          i18nKey="builtins.orvilo-agent.apiName.analyzeMedia.result"
          ns="plugin"
          values={{ question }}
        />
      ) : (
        <span>{t('builtins.orvilo-agent.apiName.analyzeMedia')}</span>
      )}
      {!isArgumentsStreaming && !isLoading && mediaCount > 0 && (
        <span
          className="text-[12px]"
          style={{ marginInlineStart: 6, color: cssVar.colorTextDescription }}
        >
          · {t('builtins.orvilo-agent.apiName.analyzeMedia.mediaCount', { count: mediaCount })}
        </span>
      )}
    </div>
  );
});

AnalyzeMediaInspector.displayName = 'AnalyzeMediaInspector';

export default AnalyzeMediaInspector;

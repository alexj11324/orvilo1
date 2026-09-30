'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { UpdateGroupPromptParams, UpdateGroupPromptState } from '../../../types';

const styles = createStaticStyles(({ css, cssVar: cv }) => ({
  groupName: css`
    overflow: hidden;

    max-width: 120px;

    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  label: css`
    flex-shrink: 0;
    color: ${cv.colorTextSecondary};
    white-space: nowrap;
  `,
  root: css`
    overflow: hidden;
    display: flex;
    gap: 6px;
    align-items: center;
  `,
}));

export const UpdateGroupPromptInspector = memo<
  BuiltinInspectorProps<UpdateGroupPromptParams, UpdateGroupPromptState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const prompt = args?.prompt || partialArgs?.prompt;

  // Calculate length difference
  const lengthDiff = useMemo(() => {
    if (!pluginState) return null;

    const newLength = pluginState.newPrompt?.length ?? 0;
    const prevLength = pluginState.previousPrompt?.length ?? 0;
    return newLength - prevLength;
  }, [pluginState]);

  // Initial streaming state
  if (isArgumentsStreaming && !prompt) {
    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-group-agent-builder.apiName.updateGroupPrompt')}
        </span>
      </div>
    );
  }

  const streamingLength = prompt?.length ?? 0;

  return (
    <div className={cn('flex', 'items-center', 'gap-[6px]', styles.root)}>
      <span
        className={cx(
          styles.label,
          (isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText,
        )}
      >
        {t('builtins.orvilo-group-agent-builder.apiName.updateGroupPrompt')}
      </span>
      {/* Show length diff when completed */}
      {!isLoading && !isArgumentsStreaming && lengthDiff !== null && (
        <span
          className="font-mono rounded bg-muted px-1 text-[12px]"
          style={{ color: lengthDiff >= 0 ? cssVar.colorSuccess : cssVar.colorError }}
        >
          {lengthDiff >= 0 ? '+' : ''}
          {lengthDiff}
          {t('builtins.orvilo-agent-builder.inspector.chars')}
        </span>
      )}
      {/* Show streaming length */}
      {(isArgumentsStreaming || isLoading) && streamingLength > 0 && (
        <span
          className="font-mono rounded bg-muted px-1 text-[12px]"
          style={{ color: cssVar.colorTextDescription }}
        >
          ({streamingLength}
          {t('builtins.orvilo-agent-builder.inspector.chars')})
        </span>
      )}
    </div>
  );
});

UpdateGroupPromptInspector.displayName = 'UpdateGroupPromptInspector';

export default UpdateGroupPromptInspector;

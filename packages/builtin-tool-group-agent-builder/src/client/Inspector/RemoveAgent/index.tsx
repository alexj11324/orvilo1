'use client';

import { Avatar } from '@lobehub/ui/base-ui';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { Check } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { shinyTextStyles } from '@/styles';

import type { RemoveAgentParams, RemoveAgentState } from '../../../types';

const styles = createStaticStyles(({ css, cssVar: cv }) => ({
  root: css`
    overflow: hidden;
    display: flex;
    gap: 8px;
    align-items: center;
  `,
  statusIcon: css`
    flex-shrink: 0;
    margin-block-end: -2px;
  `,
  title: css`
    flex-shrink: 0;
    color: ${cv.colorTextSecondary};
    white-space: nowrap;
  `,
}));

export const RemoveAgentInspector = memo<
  BuiltinInspectorProps<RemoveAgentParams, RemoveAgentState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const agentId = args?.agentId || partialArgs?.agentId;
  const displayName = pluginState?.agentName || agentId;
  const avatar = pluginState?.agentAvatar;

  // Initial streaming state
  if (isArgumentsStreaming && !agentId) {
    return (
      <div className={styles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-group-agent-builder.apiName.removeAgent')}
        </span>
      </div>
    );
  }

  const isSuccess = pluginState?.success;

  return (
    <div className={cn('flex', 'items-center', 'gap-2', styles.root)}>
      <span
        className={cx(
          styles.title,
          (isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText,
        )}
      >
        {t('builtins.orvilo-group-agent-builder.apiName.removeAgent')}:
      </span>
      {avatar && (
        <Avatar avatar={avatar} shape={'square'} size={20} title={displayName || undefined} />
      )}
      {displayName && <span>{displayName}</span>}
      {!isLoading && isSuccess && (
        <Check className={styles.statusIcon} color={cssVar.colorSuccess} size={14} />
      )}
    </div>
  );
});

RemoveAgentInspector.displayName = 'RemoveAgentInspector';

export default RemoveAgentInspector;

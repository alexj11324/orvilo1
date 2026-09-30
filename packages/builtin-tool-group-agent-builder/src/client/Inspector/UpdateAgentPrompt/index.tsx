'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { UpdateAgentPromptParams, UpdateAgentPromptState } from '../../../types';

const styles = createStaticStyles(({ css, cssVar: cv }) => ({
  agentName: css`
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

    min-width: 0;
  `,
}));

export const UpdateAgentPromptInspector = memo<
  BuiltinInspectorProps<UpdateAgentPromptParams, UpdateAgentPromptState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const agentId = args?.agentId || partialArgs?.agentId;
  const prompt = args?.prompt || partialArgs?.prompt;

  // Get agent info from the current group
  const agent = useAgentGroupStore((s) => {
    const agents = s.activeGroupId ? agentGroupSelectors.getGroupAgents(s.activeGroupId)(s) : [];
    return agents.find((a) => a.id === agentId);
  });

  // Calculate length difference
  const lengthDiff = useMemo(() => {
    if (!pluginState) return null;

    const newLength = pluginState.newPrompt?.length ?? 0;
    const prevLength = pluginState.previousPrompt?.length ?? 0;
    return newLength - prevLength;
  }, [pluginState]);

  // Initial streaming state
  if (isArgumentsStreaming && !agentId) {
    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-group-agent-builder.apiName.updateAgentPrompt')}
        </span>
      </div>
    );
  }

  const streamingLength = prompt?.length ?? 0;

  const isSupervisor = agent?.isSupervisor ?? false;

  // Use different i18n key for supervisor
  const labelKey = isSupervisor
    ? 'builtins.orvilo-group-agent-builder.apiName.updateSupervisorPrompt'
    : 'builtins.orvilo-group-agent-builder.apiName.updateAgentPrompt';

  return (
    <div className={cn('flex', 'items-center', 'gap-[6px]', styles.root)}>
      <span
        className={cx(
          styles.label,
          (isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText,
        )}
      >
        {t(labelKey)}
      </span>
      {/* Only show avatar and title for non-supervisor agents */}
      {agent && !isSupervisor && (
        <>
          <Avatar avatar={agent.avatar ?? undefined} size={18} title={agent.title ?? undefined} />
          <div className={cn('truncate', 'block', styles.agentName)} title={agent.title}>
            {agent.title}
          </div>
        </>
      )}
      {/* Show length diff when completed */}
      {!isLoading && !isArgumentsStreaming && lengthDiff !== null && (
        <span
          className="font-mono rounded bg-muted px-1 whitespace-nowrap text-[12px]"
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

UpdateAgentPromptInspector.displayName = 'UpdateAgentPromptInspector';

export default UpdateAgentPromptInspector;

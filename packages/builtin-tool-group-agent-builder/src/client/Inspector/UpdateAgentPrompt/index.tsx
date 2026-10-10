'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { UpdateAgentPromptParams, UpdateAgentPromptState } from '../../../types';

const styles = {
  agentName: 'max-w-[120px] truncate font-medium',
  label: 'shrink-0 whitespace-nowrap text-muted-foreground',
  root: 'flex items-center gap-1.5 overflow-hidden min-w-0',
};

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
        className={cn(
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
          <div
            className={cn('truncate', 'block', styles.agentName)}
            title={agent.title ?? undefined}
          >
            {agent.title}
          </div>
        </>
      )}
      {/* Show length diff when completed */}
      {!isLoading && !isArgumentsStreaming && lengthDiff !== null && (
        <span
          className="font-mono rounded bg-muted px-1 whitespace-nowrap text-[12px]"
          style={{ color: lengthDiff >= 0 ? 'var(--success)' : 'var(--destructive)' }}
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
          style={{ color: 'var(--ant-color-text-description)' }}
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

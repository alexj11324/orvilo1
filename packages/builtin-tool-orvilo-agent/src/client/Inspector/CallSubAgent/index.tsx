'use client';
import { GroupBotIcon } from '@lobehub/ui/icons';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { CallSubAgentParams, CallSubAgentState } from '../../../types';
import { SubAgentStats } from '../../components/SubAgentStats';

const styles = {
  chip: 'inline-flex min-w-0 shrink truncate items-center rounded-full bg-muted px-2.5 py-0.5 text-xs leading-5 text-foreground',
  icon: 'shrink-0 text-foreground-description',
  label: 'shrink-0 text-foreground',
  root: 'gap-1.5 text-sm leading-5.5',
};

/**
 * Collapsed row for orvilo-agent's `callSubAgent`. Mirrors the Claude Code Agent
 * tool: leading bot icon + "Call SubAgent" label + the description in a chip,
 * with a compact stats tail (tool count · model · tokens) that ticks up live
 * while the sub-agent runs and settles on the persisted totals when it finishes.
 */
export const CallSubAgentInspector = memo<
  BuiltinInspectorProps<CallSubAgentParams, CallSubAgentState>
>(({ args, partialArgs, pluginState, isArgumentsStreaming, isLoading }) => {
  const { t } = useTranslation('plugin');

  const description = (args?.description || partialArgs?.description)?.trim();
  const isShiny = isArgumentsStreaming || isLoading;

  // The completion bridge writes the authoritative stats flat onto pluginState at
  // the end of the run; until then `progress` holds the live totals streamed off
  // the running sub-agent. Prefer the flat ones so the tail never regresses to a
  // stale live sample once the run is done.
  const hasFinalStats =
    pluginState?.totalTokens !== undefined || pluginState?.totalToolCalls !== undefined;
  const stats = hasFinalStats ? pluginState : pluginState?.progress;

  return (
    <div className={cn(inspectorTextStyles.root, styles.root)}>
      <GroupBotIcon className={styles.icon} size={14} />
      <span className={cn(styles.label, isShiny && shinyTextStyles.shinyText)}>
        {t('builtins.orvilo-agent.apiName.callSubAgent')}
      </span>
      {description && <span className={styles.chip}>{description}</span>}
      {stats && (
        <SubAgentStats
          model={stats.model}
          totalTokens={stats.totalTokens}
          totalToolCalls={stats.totalToolCalls}
        />
      )}
    </div>
  );
});

CallSubAgentInspector.displayName = 'CallSubAgentInspector';

export default CallSubAgentInspector;

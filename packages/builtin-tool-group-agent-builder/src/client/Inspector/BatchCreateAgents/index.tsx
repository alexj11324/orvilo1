'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Check } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { shinyTextStyles } from '@/styles';

import type { BatchCreateAgentsParams, BatchCreateAgentsState } from '../../../types';

const styles = {
  avatarGroup: 'flex items-center gap-0.5',
  count: 'text-[12px] text-muted-foreground',
  root: 'flex items-center gap-2 overflow-hidden',
  statusIcon: 'shrink-0 [margin-block-end:-2px]',
  title: 'shrink-0 whitespace-nowrap text-muted-foreground',
};

export const BatchCreateAgentsInspector = memo<
  BuiltinInspectorProps<BatchCreateAgentsParams, BatchCreateAgentsState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const agents = args?.agents || partialArgs?.agents;

  // Get display info from agents
  const displayInfo = useMemo(() => {
    if (!agents || agents.length === 0) return null;

    const count = agents.length;
    const displayAgents = agents.slice(0, 3); // Show up to 3 avatars

    return { count, displayAgents };
  }, [agents]);

  // Initial streaming state
  if (isArgumentsStreaming && !displayInfo) {
    return (
      <div className={styles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-group-agent-builder.apiName.batchCreateAgents')}
        </span>
      </div>
    );
  }

  const isSuccess = pluginState?.successCount === pluginState?.agents?.length;
  const successCount = pluginState?.successCount ?? 0;
  const totalCount = displayInfo?.count ?? 0;

  return (
    <div className={cn('flex', 'items-center', 'gap-2', styles.root)}>
      <span
        className={cn(
          styles.title,
          (isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText,
        )}
      >
        {t('builtins.orvilo-group-agent-builder.apiName.batchCreateAgents')}:
      </span>
      {displayInfo && (
        <>
          <div className={styles.avatarGroup}>
            {displayInfo.displayAgents?.map((agent, index) => (
              <Avatar
                avatar={agent.avatar}
                key={index}
                shape={'square'}
                size={20}
                title={agent.title}
              />
            ))}
          </div>
          <span className={styles.count}>
            {pluginState
              ? `${successCount}/${totalCount}`
              : `${totalCount} ${t('builtins.orvilo-group-agent-builder.inspector.agents')}`}
          </span>
        </>
      )}
      {!isLoading && isSuccess && (
        <Check className={styles.statusIcon} color={'var(--success)'} size={14} />
      )}
    </div>
  );
});

BatchCreateAgentsInspector.displayName = 'BatchCreateAgentsInspector';

export default BatchCreateAgentsInspector;

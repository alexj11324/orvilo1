'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { Check } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { shinyTextStyles } from '@/styles';

import type { InviteAgentParams, InviteAgentState } from '../../../types';

const styles = {
  root: 'flex items-center gap-2 overflow-hidden',
  statusIcon: 'shrink-0 [margin-block-end:-2px]',
  title: 'shrink-0 whitespace-nowrap text-muted-foreground',
};

export const InviteAgentInspector = memo<
  BuiltinInspectorProps<InviteAgentParams, InviteAgentState>
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
          {t('builtins.orvilo-group-agent-builder.apiName.inviteAgent')}
        </span>
      </div>
    );
  }

  const isSuccess = pluginState?.success;

  return (
    <div className={cn('flex', 'items-center', 'gap-2', styles.root)}>
      <span
        className={cn(
          styles.title,
          (isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText,
        )}
      >
        {t('builtins.orvilo-group-agent-builder.apiName.inviteAgent')}:
      </span>
      {avatar && (
        <Avatar avatar={avatar} shape={'square'} size={20} title={displayName || undefined} />
      )}
      {displayName && <span>{displayName}</span>}
      {!isLoading && isSuccess && (
        <Check className={styles.statusIcon} color={'var(--success)'} size={14} />
      )}
    </div>
  );
});

InviteAgentInspector.displayName = 'InviteAgentInspector';

export default InviteAgentInspector;

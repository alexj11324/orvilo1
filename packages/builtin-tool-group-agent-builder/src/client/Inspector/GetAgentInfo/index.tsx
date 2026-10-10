'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { shinyGroupStyles, shinyTextStyles } from '@/styles';

import type { GetAgentInfoParams } from '../../../types';

interface GetAgentInfoState {
  avatar?: string;
  title?: string;
}

const styles = {
  root: 'flex items-center gap-2 overflow-hidden',
  title: 'shrink-0 whitespace-nowrap text-muted-foreground',
};

export const GetAgentInfoInspector = memo<
  BuiltinInspectorProps<GetAgentInfoParams, GetAgentInfoState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const agentId = args?.agentId || partialArgs?.agentId;
  const title = pluginState?.title;
  const avatar = pluginState?.avatar;

  // Initial streaming state
  if (isArgumentsStreaming && !agentId) {
    return (
      <div className={styles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-group-agent-builder.apiName.getAgentInfo')}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn('flex', 'items-center', 'gap-2', cn(styles.root, shinyGroupStyles.shinyGroup))}
    >
      <span
        className={cn(
          styles.title,
          (isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText,
        )}
      >
        {t('builtins.orvilo-group-agent-builder.apiName.getAgentInfo')}:
      </span>
      {avatar && <Avatar avatar={avatar} shape={'square'} size={20} title={title || undefined} />}
      <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
        {title || agentId}
      </span>
    </div>
  );
});

GetAgentInfoInspector.displayName = 'GetAgentInfoInspector';

export default GetAgentInfoInspector;

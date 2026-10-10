'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { highlightTextStyles, shinyTextStyles } from '@/styles';

import type { GetAgentDetailParams, GetAgentDetailState } from '../../../types';

export const GetAgentDetailInspector = memo<
  BuiltinInspectorProps<GetAgentDetailParams, GetAgentDetailState>
>(({ args, partialArgs, isArgumentsStreaming, pluginState }) => {
  const { t } = useTranslation('plugin');

  const agentId = args?.agentId || partialArgs?.agentId;
  // Once the result lands, show the resolved agent name instead of the opaque
  // `agt_xxx` id; keep the id reachable via tooltip.
  const meta = pluginState?.meta;
  const title = meta?.title;

  if (isArgumentsStreaming && !agentId) {
    return (
      <div className="flex items-center gap-2 overflow-hidden">
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-agent-management.apiName.getAgentDetail')}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-row items-center gap-2 overflow-hidden">
      <span
        className={cn(
          'shrink-0 whitespace-nowrap text-muted-foreground',
          isArgumentsStreaming && shinyTextStyles.shinyText,
        )}
      >
        {t('builtins.orvilo-agent-management.inspector.getAgentDetail.title')}
      </span>
      {title ? (
        <SimpleTooltip title={agentId}>
          <div className="flex flex-row items-center gap-1.5">
            {meta?.avatar && (
              <Avatar
                avatar={meta.avatar}
                background={meta.backgroundColor}
                shape={'square'}
                size={16}
              />
            )}
            <span className={highlightTextStyles.primary}>{title}</span>
          </div>
        </SimpleTooltip>
      ) : (
        agentId && <span className={highlightTextStyles.primary}>{agentId}</span>
      )}
    </div>
  );
});

GetAgentDetailInspector.displayName = 'GetAgentDetailInspector';

export default GetAgentDetailInspector;

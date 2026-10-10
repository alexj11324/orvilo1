'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DuplicateAgentParams, DuplicateAgentState } from '../../../types';

export const DuplicateAgentRender = memo<
  BuiltinRenderProps<DuplicateAgentParams, DuplicateAgentState>
>(({ pluginState }) => {
  const { t } = useTranslation('plugin');

  if (!pluginState?.success) return null;

  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--ant-color-fill-quaternary)] p-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs leading-[inherit] font-medium text-muted-foreground">
            {t('builtins.orvilo-agent-management.render.duplicateAgent.sourceId')}
          </span>
          <span className="text-[13px]">{pluginState.sourceAgentId}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs leading-[inherit] font-medium text-muted-foreground">
            {t('builtins.orvilo-agent-management.render.duplicateAgent.newId')}
          </span>
          <span className="text-[13px]">{pluginState.newAgentId}</span>
        </div>
      </div>
    </div>
  );
});

DuplicateAgentRender.displayName = 'DuplicateAgentRender';

export default DuplicateAgentRender;

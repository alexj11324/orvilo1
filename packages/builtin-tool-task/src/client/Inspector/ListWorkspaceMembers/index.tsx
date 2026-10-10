'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { ListWorkspaceMembersParams, ListWorkspaceMembersState } from '../../../types';

export const ListWorkspaceMembersInspector = memo<
  BuiltinInspectorProps<ListWorkspaceMembersParams, ListWorkspaceMembersState>
>(({ isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');
  const count = pluginState?.count;

  return (
    <div
      className={cn(
        inspectorTextStyles.root,
        (isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText,
      )}
    >
      <span>{t('builtins.orvilo-task.apiName.listWorkspaceMembers')}</span>
      {typeof count === 'number' && (
        <span
          className="font-mono rounded bg-muted px-1 text-[12px]"
          style={{ color: 'var(--muted-foreground)' }}
        >
          {count}
        </span>
      )}
    </div>
  );
});

ListWorkspaceMembersInspector.displayName = 'ListWorkspaceMembersInspector';

export default ListWorkspaceMembersInspector;

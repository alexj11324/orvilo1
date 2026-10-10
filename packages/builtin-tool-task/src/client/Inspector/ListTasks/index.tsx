'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { ListTasksParams, ListTasksState } from '../../../types';

export const ListTasksInspector = memo<BuiltinInspectorProps<ListTasksParams, ListTasksState>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
    const { t } = useTranslation('plugin');

    const filters = args || partialArgs || {};
    const total = pluginState?.total;
    const count = pluginState?.count;

    const filterParts: string[] = [];
    if (filters.parentIdentifier) filterParts.push(filters.parentIdentifier);
    if (filters.statuses?.length) filterParts.push(filters.statuses.join(','));
    if (filters.priorities?.length) filterParts.push(`p=${filters.priorities.join(',')}`);
    const filterText = filterParts.join(' · ');

    if (isArgumentsStreaming && !filterText) {
      return (
        <div className={inspectorTextStyles.root}>
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-task.apiName.listTasks')}
          </span>
        </div>
      );
    }

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn(isLoading && shinyTextStyles.shinyText)}>
          {t('builtins.orvilo-task.apiName.listTasks')}
        </span>
        {filterText && (
          <span className="text-[12px]" style={{ color: 'var(--ant-color-text-tertiary)' }}>
            {' · '}
            {filterText}
          </span>
        )}
        {typeof count === 'number' && (
          <span
            className="font-mono rounded bg-muted px-1 text-[12px]"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {typeof total === 'number' && total !== count ? `${count}/${total}` : count}
          </span>
        )}
      </div>
    );
  },
);

ListTasksInspector.displayName = 'ListTasksInspector';

export default ListTasksInspector;

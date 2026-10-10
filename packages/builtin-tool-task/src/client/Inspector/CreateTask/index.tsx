'use client';

import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { CornerDownRight } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { CreateTaskParams, CreateTaskState } from '../../../types';

const styles = {
  chip: 'inline-flex min-w-0 max-w-[240px] shrink items-center truncate rounded-[999px] bg-accent px-2 py-0.5 text-[12px] text-foreground ms-1.5',
  identifierChip:
    'shrink-0 rounded-[999px] bg-accent px-2 py-0.5 font-mono text-[12px] text-muted-foreground',
  subtaskTag:
    'inline-flex shrink-0 items-center gap-1 rounded-[999px] border border-sidebar-border bg-transparent px-1.5 py-px font-mono text-[11px] text-[var(--ant-color-text-tertiary)]',
};

export const CreateTaskInspector = memo<BuiltinInspectorProps<CreateTaskParams, CreateTaskState>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
    const { t } = useTranslation('plugin');

    const name = args?.name || partialArgs?.name;
    const identifier = pluginState?.identifier;
    const parentIdentifier = args?.parentIdentifier || partialArgs?.parentIdentifier;

    if (isArgumentsStreaming && !name) {
      return (
        <div className={inspectorTextStyles.root}>
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-task.apiName.createTask')}
          </span>
        </div>
      );
    }

    return (
      <div className={inspectorTextStyles.root} style={{ flexWrap: 'wrap', gap: 4 }}>
        <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
          {t('builtins.orvilo-task.apiName.createTask')}
        </span>
        {identifier && (
          <span className={styles.identifierChip} style={{ marginInlineStart: 6 }}>
            {identifier}
          </span>
        )}
        {name && (
          <span className={styles.chip} style={{ color: 'var(--foreground)' }}>
            {name}
          </span>
        )}
        {parentIdentifier && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className={styles.subtaskTag}>
                  <CornerDownRight size={11} />
                  {parentIdentifier}
                </span>
              }
            />
            <TooltipContent>
              {t('builtins.orvilo-task.create.subtaskOf', { parent: parentIdentifier })}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  },
);

CreateTaskInspector.displayName = 'CreateTaskInspector';

export default CreateTaskInspector;

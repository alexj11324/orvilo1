'use client';

import { type BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { AlertTriangle } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { ActivatedToolInfo, ActivateToolsParams, ActivateToolsState } from '../../../types';

const styles = {
  notFoundHint: 'shrink-0 max-w-full text-xs leading-[inherit] text-warning',
  tool: 'overflow-hidden inline-flex shrink gap-1.5 items-center min-w-0 py-0.5 ps-2.5 pe-2.5 border border-sidebar-border rounded-full text-xs leading-[inherit] text-foreground bg-accent',
  toolName: 'truncate min-w-0',
  tools: 'inline-flex flex-wrap gap-1 items-center ms-1',
};

export const ActivateToolsInspector = memo<
  BuiltinInspectorProps<ActivateToolsParams, ActivateToolsState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const identifiers = args?.identifiers || partialArgs?.identifiers;
  const activatedTools = pluginState?.activatedTools;
  const notFoundList = pluginState?.notFound ?? [];
  const requestedTools: ActivatedToolInfo[] =
    identifiers?.map((id) => ({ apiCount: 0, identifier: id, name: id })) ?? [];
  const visibleTools =
    activatedTools && activatedTools.length > 0 ? activatedTools : requestedTools;

  // Streaming / Loading: show identifiers from arguments
  if (isArgumentsStreaming || isLoading) {
    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>
          {t('builtins.orvilo-activator.apiName.activateTools')}
        </span>
        {identifiers && identifiers.length > 0 && (
          <span className={styles.tools}>
            {identifiers.map((id) => (
              <span className={styles.tool} key={id}>
                <span className={styles.toolName}>{id}</span>
              </span>
            ))}
          </span>
        )}
      </div>
    );
  }

  // Finished: show activated tool names with avatars; surface notFound in the title row
  const hasNotFound = notFoundList.length > 0;
  const notFoundTitle = notFoundList.join(', ');

  return (
    <div className={cn('flex', 'gap-2', inspectorTextStyles.root)} style={{ flexWrap: 'wrap' }}>
      <span>{t('builtins.orvilo-activator.apiName.activateTools')}</span>
      {hasNotFound && (
        <Tooltip>
          <TooltipTrigger
            render={
              <div className={cn('flex', 'gap-1', styles.notFoundHint)}>
                <AlertTriangle style={{ color: 'var(--warning)' }} />
                <span>
                  {t('builtins.orvilo-activator.inspector.activateTools.notFoundCount', {
                    count: notFoundList.length,
                  })}
                </span>
              </div>
            }
          />
          <TooltipContent>{notFoundTitle}</TooltipContent>
        </Tooltip>
      )}
      {visibleTools.length > 0 && (
        <span className={styles.tools}>
          {visibleTools.map((tool) => (
            <span className={styles.tool} key={tool.identifier}>
              {tool.avatar && <Avatar avatar={tool.avatar} size={14} title={tool.name} />}
              <span className={styles.toolName}>{tool.name}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  );
});

ActivateToolsInspector.displayName = 'ActivateToolsInspector';

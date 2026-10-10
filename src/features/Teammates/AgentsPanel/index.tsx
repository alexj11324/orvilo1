'use client';

import { cn } from 'cn';
import { Bot } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge as Tag } from '@/components/reui/badge';
import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';

import type { WorkspaceAgentSummary } from '../api/contract';
import { useWorkspaceAgentsQuery } from '../api/hooks';

const styles = {
  cell: 'flex gap-1.5 items-center min-w-0 text-sm leading-5.5 text-muted-foreground',
  headerCell: 'text-xs leading-5 font-medium text-foreground-tertiary uppercase tracking-normal',
  name: 'overflow-hidden text-sm leading-5.5 font-medium text-foreground text-ellipsis whitespace-nowrap',
  projects: 'overflow-hidden text-ellipsis whitespace-nowrap',
  row: 'grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_90px] gap-3 items-center py-2.5 px-1 border-b border-divider',
  table: 'min-w-140',
  tableScroll: 'overflow-x-auto',
};

const STATUS_CLASSES = {
  active: 'border-success-border bg-success-wash text-success-text',
  disabled: 'border-divider bg-fill-quaternary text-muted-foreground',
} as const satisfies Record<NonNullable<WorkspaceAgentSummary['status']>, string>;

interface AgentRowProps {
  agent: WorkspaceAgentSummary;
}

const AgentRow = memo<AgentRowProps>(({ agent }) => {
  const { t } = useTranslation('setting');
  const maintainerName = agent.maintainer?.name ?? agent.maintainer?.id ?? '—';
  const projectNames = useMemo(
    () => (agent.projects ?? []).map((project) => project.name).join(', '),
    [agent.projects],
  );
  const status = agent.status ?? 'active';

  return (
    <div className={styles.row}>
      <div className={styles.cell}>
        <AssigneeAvatar agentId={agent.id} size={32} />
        <div className="flex min-w-0 flex-1 flex-col gap-0">
          <span className={styles.name}>
            <Bot className="me-1.5" size={12} />
            {agent.name}
          </span>
        </div>
      </div>
      <div className={styles.cell}>{maintainerName}</div>
      <div className={styles.cell}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <span className={styles.projects}>
                    {projectNames || t('workspaceSetting.agents.noProjects')}
                  </span>
                </span>
              }
            />
            <TooltipContent>{projectNames}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div>
        <Tag
          className={cn('py-0 text-xs leading-5', STATUS_CLASSES[status])}
          size="xl"
          variant="secondary"
        >
          {t(`workspaceSetting.agents.status.${status}`, { defaultValue: status })}
        </Tag>
      </div>
    </div>
  );
});

AgentRow.displayName = 'AgentRow';

/**
 * Workspace-visible agent roster — read-only v1. Agents are rendered as
 * agents (bot badge, maintainer attribution), never as human accounts. Per-agent
 * grants are not shown: the API does not report them yet.
 */
export const AgentsPanel = memo(() => {
  const { t } = useTranslation('setting');
  const { data, error, isLoading, mutate } = useWorkspaceAgentsQuery();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 py-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div className="flex items-center gap-2.5" key={i}>
            <Skeleton className="mb-0 h-3 w-3/10" />
            <Skeleton className="mb-0 h-3 w-1/4" />
            <Skeleton className="mb-0 h-3 w-1/4" />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <Alert className="rounded-(--radius-card) text-sm leading-5.5" variant="destructive">
        <AlertTitle className="line-clamp-none text-sm leading-5.5 tracking-normal">
          {t('workspaceSetting.agents.loadFailed')}
        </AlertTitle>
        <AlertAction>
          {
            <Button size="lg" onClick={() => void mutate()}>
              {t('retry', { ns: 'common' })}
            </Button>
          }
        </AlertAction>
      </Alert>
    );
  }

  const agents = data ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className={styles.tableScroll}>
        <div className={styles.table}>
          <div className={styles.row}>
            <span className={styles.headerCell}>{t('workspaceSetting.agents.columnAgent')}</span>
            <span className={styles.headerCell}>
              {t('workspaceSetting.agents.columnMaintainer')}
            </span>
            <span className={styles.headerCell}>{t('workspaceSetting.agents.columnProjects')}</span>
            <span className={styles.headerCell}>{t('workspaceSetting.agents.columnStatus')}</span>
          </div>
          {agents.map((agent) => (
            <AgentRow agent={agent} key={agent.id} />
          ))}
        </div>
      </div>
      {agents.length === 0 && (
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyDescription className="text-sm leading-5.5">
              {t('workspaceSetting.agents.empty')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
});

AgentsPanel.displayName = 'AgentsPanel';

export default AgentsPanel;

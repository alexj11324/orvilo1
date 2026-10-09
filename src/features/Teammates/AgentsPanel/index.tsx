'use client';

import { createStaticStyles, cssVar } from 'antd-style';
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

const styles = createStaticStyles(({ css }) => ({
  cell: css`
    display: flex;
    gap: 6px;
    align-items: center;

    min-width: 0;

    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  headerCell: css`
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextTertiary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
  name: css`
    overflow: hidden;

    font-size: 14px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  projects: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  row: css`
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.2fr) 90px;
    gap: 12px;
    align-items: center;

    padding-block: 10px;
    padding-inline: 4px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  table: css`
    /* Four columns floor at ~560px; below that the wrapper scrolls
       horizontally instead of crushing cells or overflowing the page. */
    min-width: 560px;
  `,
  tableScroll: css`
    overflow-x: auto;
  `,
}));

const STATUS_COLOR = {
  active: 'green',
  disabled: 'default',
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
        <div className="flex flex-col flex-1 gap-[0px]" style={{ minWidth: 0 }}>
          <span className={styles.name}>
            <Bot size={12} style={{ marginInlineEnd: 6 }} />
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
        <Tag style={{ color: STATUS_COLOR[status] }}>
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
      <div className="flex flex-col gap-4" style={{ paddingBlock: 8 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div className="flex items-center gap-2.5" key={i}>
            <Skeleton className="h-3" style={{ marginBottom: 0, width: '30%' }} />
            <Skeleton className="h-3" style={{ marginBottom: 0, width: '25%' }} />
            <Skeleton className="h-3" style={{ marginBottom: 0, width: '25%' }} />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('workspaceSetting.agents.loadFailed')}</AlertTitle>
        <AlertAction>
          {
            <Button size="sm" onClick={() => void mutate()}>
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
        <Empty style={{ paddingBlock: 32 }}>
          <EmptyHeader>
            <EmptyDescription>{t('workspaceSetting.agents.empty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
});

AgentsPanel.displayName = 'AgentsPanel';

export default AgentsPanel;

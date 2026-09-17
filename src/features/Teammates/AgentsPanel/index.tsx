'use client';

import { Empty, Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { Alert, Button, Skeleton, Tag } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Bot, Check, Minus } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';

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
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.2fr) 90px 80px 80px;
    gap: 12px;
    align-items: center;

    padding-block: 10px;
    padding-inline: 4px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

const STATUS_COLOR: Record<string, string> = {
  disabled: 'default',
  idle: 'default',
  online: 'green',
  running: 'processing',
};

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
  const status = agent.status ?? 'idle';

  return (
    <div className={styles.row}>
      <div className={styles.cell}>
        <Avatar avatar={agent.avatar} name={agent.name} size={32} title={agent.name} />
        <Flexbox flex={1} gap={0} style={{ minWidth: 0 }}>
          <span className={styles.name}>
            <Icon icon={Bot} size={12} style={{ marginInlineEnd: 6 }} />
            {agent.name}
          </span>
        </Flexbox>
      </div>
      <div className={styles.cell}>{maintainerName}</div>
      <div className={styles.cell}>
        <Tooltip title={projectNames}>
          <span className={styles.projects}>
            {projectNames || t('workspaceSetting.agents.noProjects')}
          </span>
        </Tooltip>
      </div>
      <div>
        <Tag color={STATUS_COLOR[status] ?? 'default'}>
          {t(`workspaceSetting.agents.status.${status}`, { defaultValue: status })}
        </Tag>
      </div>
      {/* v1 read-only: capability columns exist so the shape is stable when
          the backend starts reporting per-agent grants. */}
      <div className={styles.cell}>
        <Icon icon={Check} size={14} style={{ color: cssVar.colorSuccess }} />
        <span>{t('workspaceSetting.agents.canUse')}</span>
      </div>
      <div className={styles.cell}>
        <Icon icon={Minus} size={14} style={{ color: cssVar.colorTextTertiary }} />
        <span>{t('workspaceSetting.agents.cannotEdit')}</span>
      </div>
    </div>
  );
});

AgentRow.displayName = 'AgentRow';

/**
 * Workspace-visible agent roster — read-only v1. Agents are rendered as
 * agents (bot badge, maintainer attribution), never as human accounts; the
 * 'can use' / 'can edit' columns are static placeholders until the backend
 * reports per-agent grants.
 */
export const AgentsPanel = memo(() => {
  const { t } = useTranslation('setting');
  const { data, error, isLoading, mutate } = useWorkspaceAgentsQuery();

  if (isLoading) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (error) {
    return (
      <Alert
        title={t('workspaceSetting.agents.loadFailed')}
        type="error"
        action={
          <Button size="small" onClick={() => void mutate()}>
            {t('retry', { ns: 'common' })}
          </Button>
        }
      />
    );
  }

  const agents = data ?? [];

  return (
    <Flexbox gap={8}>
      <div className={styles.row}>
        <span className={styles.headerCell}>{t('workspaceSetting.agents.columnAgent')}</span>
        <span className={styles.headerCell}>{t('workspaceSetting.agents.columnMaintainer')}</span>
        <span className={styles.headerCell}>{t('workspaceSetting.agents.columnProjects')}</span>
        <span className={styles.headerCell}>{t('workspaceSetting.agents.columnStatus')}</span>
        <span className={styles.headerCell}>{t('workspaceSetting.agents.columnCanUse')}</span>
        <span className={styles.headerCell}>{t('workspaceSetting.agents.columnCanEdit')}</span>
      </div>
      {agents.map((agent) => (
        <AgentRow agent={agent} key={agent.id} />
      ))}
      {agents.length === 0 && (
        <Empty description={t('workspaceSetting.agents.empty')} style={{ paddingBlock: 32 }} />
      )}
    </Flexbox>
  );
});

AgentsPanel.displayName = 'AgentsPanel';

export default AgentsPanel;

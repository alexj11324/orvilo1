'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import { PinIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import AsyncBoundary from '@/components/AsyncBoundary';
import Avatar from '@/components/Avatar';
import { DEFAULT_AVATAR } from '@/const/meta';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

import { type AgentRow, useHomeAgentRows } from './useHomeAgentRows';

const styles = createStaticStyles(({ css, cssVar }) => ({
  active: css`
    background: ${cssVar.colorFillTertiary};
  `,
  item: css`
    cursor: pointer;
    padding-block: 6px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
  list: css`
    padding: 8px;
  `,
  sectionHeader: css`
    padding-block: 4px;
    padding-inline: 8px;
    line-height: 20px;
  `,
}));

interface AgentListProps {
  activeAgentId: string;
  /** Thrown error from the agent-list SWR — surfaced as a failure state. */
  error?: unknown;
  /** Also list the builtin task agent — the composer chip offers every conversation target. */
  includeTaskAgent?: boolean;
  onRetry?: () => void;
  onSelect: (agentId: string) => void;
}

// Same spec as the agent-detail SwitchPanel's section header.
const SectionHeader = memo<{ children: ReactNode }>(({ children }) => (
  <div className={cx(styles.sectionHeader, 'flex flex-col')}>
    <div className="text-[12px] text-muted-foreground font-medium">{children}</div>
  </div>
));

const AgentList = memo<AgentListProps>(
  ({ activeAgentId, error, includeTaskAgent, onRetry, onSelect }) => {
    const { t } = useTranslation('common');

    const isInit = useHomeStore(homeAgentListSelectors.isAgentListInit);
    const { privateRows, showPrivateSection, workspaceRows } = useHomeAgentRows({
      includeTaskAgent,
    });

    const renderRow = (row: AgentRow) => {
      const isActive = row.id === activeAgentId;

      return (
        <div
          key={row.id}
          className={cx(
            `${styles.item} ${isActive ? styles.active : ''}`,
            'flex items-center gap-2 cursor-pointer hover:bg-[var(--ant-color-fill-tertiary)]',
          )}
          onClick={() => onSelect(row.id)}
        >
          <Avatar
            avatar={row.avatar || DEFAULT_AVATAR}
            background={row.backgroundColor}
            name={row.title}
            shape={'square'}
            size={24}
          />
          <div
            className="truncate font-[isActive ? 600 : 500]"
            style={{ flex: 1, color: isActive ? cssVar.colorText : cssVar.colorTextSecondary }}
          >
            {row.title}
          </div>
          {row.pinned && (
            <ActionIcon icon={PinIcon} size={12} style={{ opacity: 0.5, pointerEvents: 'none' }} />
          )}
        </div>
      );
    };

    // Error gated ahead of the skeleton so a failed list fetch shows Retry instead
    // of a permanent skeleton (`isAgentListInit` only flips on success).
    return (
      <AsyncBoundary
        data={isInit ? workspaceRows : undefined}
        error={error}
        errorVariant={'block'}
        isLoading={!isInit && !error}
        loading={<SkeletonList rows={6} style={{ padding: 8 }} />}
        onRetry={onRetry}
      >
        <div
          className={cx(styles.list, 'flex flex-col gap-0.5')}
          style={{ maxHeight: 360, overflowY: 'auto', width: '100%' }}
        >
          {showPrivateSection ? (
            <>
              <SectionHeader>{t('navPanel.privateAgents')}</SectionHeader>
              {privateRows.map(renderRow)}
              <SectionHeader>{t('navPanel.publicAgents')}</SectionHeader>
              {workspaceRows.map(renderRow)}
            </>
          ) : (
            [...workspaceRows, ...privateRows].map(renderRow)
          )}
        </div>
      </AsyncBoundary>
    );
  },
);

export default AgentList;

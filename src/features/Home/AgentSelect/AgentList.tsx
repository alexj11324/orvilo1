'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import { PinIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import AsyncBoundary from '@/components/AsyncBoundary';
import { Button } from '@/components/ui/button';
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
  /**
   * Extra section rendered under the agent rows, inside the same scroll region.
   * The composer picker uses it for locally detected harnesses, whose data
   * source (the desktop binary probe) is independent of the agent-list fetch —
   * hence a sibling of the async gate rather than a child of it.
   */
  bottomSection?: ReactNode;
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
  ({ activeAgentId, bottomSection, error, includeTaskAgent, onRetry, onSelect }) => {
    const { t } = useTranslation('common');

    const isInit = useHomeStore(homeAgentListSelectors.isAgentListInit);
    const { privateRows, showPrivateSection, workspaceRows } = useHomeAgentRows({
      includeTaskAgent,
    });

    const renderRow = (row: AgentRow) => {
      const isActive = row.id === activeAgentId;

      return (
        <Button
          aria-pressed={isActive}
          key={row.id}
          type="button"
          variant="ghost"
          className={cx(
            `${styles.item} ${isActive ? styles.active : ''}`,
            'flex h-auto w-full justify-start items-center gap-2 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-[var(--ant-color-fill-tertiary)]',
          )}
          onClick={() => onSelect(row.id)}
        >
          <AgentRuntimeIcon size={24} type={row.heteroType} />
          <div
            className={cx('truncate', isActive ? 'font-semibold' : 'font-medium')}
            style={{ flex: 1, color: isActive ? cssVar.colorText : cssVar.colorTextSecondary }}
          >
            {row.title}
          </div>
          {row.pinned && <PinIcon aria-hidden size={12} style={{ opacity: 0.5, flexShrink: 0 }} />}
        </Button>
      );
    };

    const rows = showPrivateSection ? (
      <>
        <SectionHeader>{t('navPanel.privateAgents')}</SectionHeader>
        {privateRows.map(renderRow)}
        <SectionHeader>{t('navPanel.publicAgents')}</SectionHeader>
        {workspaceRows.map(renderRow)}
      </>
    ) : (
      [...workspaceRows, ...privateRows].map(renderRow)
    );

    // Error gated ahead of the skeleton so a failed list fetch shows Retry instead
    // of a permanent skeleton (`isAgentListInit` only flips on success).
    const boundaryProps = {
      data: isInit ? workspaceRows : undefined,
      error,
      errorVariant: 'block' as const,
      isLoading: !isInit && !error,
      onRetry,
    };

    // No bottom section (settings, and the composer picker on the web build) →
    // the markup is the one this component always had: the async gate is the
    // root and every state owns its own padding, including the error card that
    // `AsyncBoundary` renders flush.
    if (!bottomSection)
      return (
        <AsyncBoundary
          {...boundaryProps}
          loading={<SkeletonList rows={6} style={{ padding: 8 }} />}
        >
          <div
            className={cx(styles.list, 'flex flex-col gap-0.5')}
            style={{ maxHeight: 360, overflowY: 'auto', width: '100%' }}
          >
            {rows}
          </div>
        </AsyncBoundary>
      );

    // With one, the scroll region wraps the async gate instead: the harness
    // section shares the panel's single scrollbar rather than adding a second
    // one, and it still renders when the agent-list fetch is loading or failed
    // (its data never went through that fetch). The wrapper takes over the
    // skeleton's padding, which is why the loading node changes above.
    return (
      <div
        className={cx(styles.list, 'flex flex-col gap-0.5')}
        style={{ maxHeight: 360, overflowY: 'auto', width: '100%' }}
      >
        <AsyncBoundary {...boundaryProps} loading={<SkeletonList rows={6} />}>
          {rows}
        </AsyncBoundary>
        {bottomSection}
      </div>
    );
  },
);

export default AgentList;

'use client';

import { cn } from 'cn';
import { CheckIcon, PinIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import AsyncBoundary from '@/components/AsyncBoundary';
import { Button } from '@/components/ui/button';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

import { ConfiguredAgentRow } from './ConfiguredAgentRow';
import { type AgentRow, useHomeAgentRows } from './useHomeAgentRows';

const styles = {
  active: 'bg-accent',
  item: "w-full justify-start gap-2 rounded-(--radius-button) px-2 py-0.5 text-left text-sm leading-5.5 hover:bg-selected pointer-coarse:after:absolute pointer-coarse:after:inset-[calc(var(--spacing)*-1.75)] pointer-coarse:after:content-['']",
  list: 'flex w-full max-h-90 flex-col gap-0.5 overflow-y-auto p-2',
  sectionHeader: 'flex flex-col px-2 py-1 text-xs font-medium leading-5 text-muted-foreground',
};

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
  onConfigure?: (agentId: string) => void;
  onRetry?: () => void;
  onSelect: (agentId: string) => void;
}

// Same spec as the agent-detail SwitchPanel's section header.
const SectionHeader = memo<{ children: ReactNode }>(({ children }) => (
  <div className={styles.sectionHeader}>{children}</div>
));

const AgentList = memo<AgentListProps>(
  ({ activeAgentId, bottomSection, error, includeTaskAgent, onConfigure, onRetry, onSelect }) => {
    const { t } = useTranslation('common');

    const isInit = useHomeStore(homeAgentListSelectors.isAgentListInit);
    const { privateRows, showPrivateSection, workspaceRows } = useHomeAgentRows({
      includeTaskAgent,
    });

    const renderRow = (row: AgentRow) => {
      const isActive = row.id === activeAgentId;

      if (onConfigure)
        return (
          <ConfiguredAgentRow
            active={isActive}
            key={row.id}
            row={row}
            onConfigure={onConfigure}
            onSelect={onSelect}
          />
        );

      return (
        <div className="contents pointer-coarse:block pointer-coarse:py-1.5" key={row.id}>
          <Button
            aria-pressed={isActive}
            className={cn('relative', styles.item, isActive && styles.active)}
            size="compact"
            type="button"
            variant="ghost"
            onClick={() => onSelect(row.id)}
          >
            <AgentRuntimeIcon size={24} type={row.heterogeneousType || 'orvilo'} />
            <div
              className={cn(
                'min-w-0 flex-1 truncate',
                isActive ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground',
              )}
            >
              {row.title}
            </div>
            {isActive && <CheckIcon aria-hidden className="shrink-0 text-primary" size={16} />}
            {row.pinned && (
              <PinIcon aria-hidden className="shrink-0 text-foreground-tertiary" size={16} />
            )}
          </Button>
        </div>
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
          loading={<SkeletonList className="flex flex-col p-2" rows={6} />}
        >
          <div className={styles.list}>{rows}</div>
        </AsyncBoundary>
      );

    // With one, the scroll region wraps the async gate instead: the harness
    // section shares the panel's single scrollbar rather than adding a second
    // one, and it still renders when the agent-list fetch is loading or failed
    // (its data never went through that fetch). The wrapper takes over the
    // skeleton's padding, which is why the loading node changes above.
    return (
      <div className={styles.list}>
        <AsyncBoundary {...boundaryProps} loading={<SkeletonList rows={6} />}>
          {rows}
        </AsyncBoundary>
        {bottomSection}
      </div>
    );
  },
);

export default AgentList;

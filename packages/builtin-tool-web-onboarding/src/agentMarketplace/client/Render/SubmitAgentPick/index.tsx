'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';

import type { InstallMarketplaceAgentSummary } from '../../../pickResult';
import type { SubmitAgentPickArgs } from '../../../types';

interface SubmitAgentPickState {
  installedAgentIds?: string[];
  selectedAgentIds?: string[];
  skippedAgentIds?: string[];
  summaries?: InstallMarketplaceAgentSummary[];
}

const styles = {
  card: 'flex items-center gap-3 p-4 border border-divider rounded-(--radius-card) bg-card',
  cardSkipped: 'opacity-65',
  description: 'line-clamp-2 text-sm leading-5.5 text-muted-foreground',
  list: 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 w-full',
  meta: 'shrink-0 text-xs leading-5 text-foreground-tertiary',
  skippedTag:
    'shrink-0 mis-1 py-0.25 px-1.5 rounded-(--radius-chip) text-xs leading-5 text-foreground-tertiary bg-muted',
  title: 'flex-1 min-w-0 truncate text-sm leading-5.5 font-semibold text-foreground',
  titleRow: 'flex items-center gap-1.5 w-full',
};

export type SubmitAgentPickRenderProps = Pick<
  BuiltinRenderProps<SubmitAgentPickArgs, SubmitAgentPickState>,
  'pluginState'
>;

const SubmitAgentPick = memo<SubmitAgentPickRenderProps>(({ pluginState }) => {
  const { t } = useTranslation('tool');
  const summaries = pluginState?.summaries ?? [];

  if (summaries.length === 0) return null;

  const installedCount = summaries.filter((s) => !s.skipped).length;
  const skippedCount = summaries.length - installedCount;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs leading-5 text-muted-foreground">
        {t('agentMarketplace.inspector.pickCount', { count: installedCount })}
        {skippedCount > 0 &&
          ` · ${t('agentMarketplace.render.alreadyInLibrary', { count: skippedCount })}`}
      </div>
      <div className={styles.list}>
        {summaries.map((summary) => (
          <div
            className={cn(styles.card, summary.skipped && styles.cardSkipped)}
            key={summary.templateId}
          >
            <Avatar avatar={summary.avatar || '🤖'} shape="square" size={36} />
            <div className="flex flex-col flex-1 min-w-0 gap-1">
              <div className={styles.titleRow}>
                <span className={styles.title}>{summary.title || summary.templateId}</span>
                {summary.skipped && (
                  <span className={styles.skippedTag}>
                    {t('agentMarketplace.render.alreadyInLibraryTag')}
                  </span>
                )}
              </div>
              {summary.description && (
                <div className={styles.description}>{summary.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

SubmitAgentPick.displayName = 'SubmitAgentPick';

export default SubmitAgentPick;

'use client';

import type { SavedViewItem } from '@orvilo/database/schemas';
import type { WorkQueryGroupBy, WorkQueryLayout } from '@orvilo/types';
import { cn } from 'cn';
import { Columns3Icon, ListIcon, ListTodoIcon } from 'lucide-react';
import { createElement, memo, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import Avatar from '@/components/Avatar';
import { resolveProjectStatus } from '@/components/ExecutionStatus';
import { COLUMN_I18N_KEYS } from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import type { WorkQueryGroupPage } from '@/features/MyWork/workQueryPaging';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { workAttentionService } from '@/services/workAttention';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { buildSavedViewDetailSummary } from './savedViewDetails';

/**
 * The reference details pane carries Assignees/Labels/Projects/Teams facet
 * tabs. The server facet contract (`WORK_QUERY_FACET_FIELDS`) only supports
 * projectId/teamId/status/workflowCategory — Assignees and Labels stay out
 * until the contract returns full-query totals for them.
 */
type FacetTabKey = 'projects' | 'teams';

const FACET_FIELDS: Record<FacetTabKey, 'projectId' | 'teamId'> = {
  projects: 'projectId',
  teams: 'teamId',
};

interface SavedViewDetailsPanelProps {
  groupBy?: WorkQueryGroupBy;
  groups?: WorkQueryGroupPage<{ id: string }>[];
  layout?: WorkQueryLayout;
  title: string;
  total?: number;
  view: SavedViewItem;
}

const DetailRow = memo<{ label: string; value: ReactNode }>(({ label, value }) => (
  <div
    className={cn(
      'flex items-center justify-between gap-4',
      'min-h-9.5 px-3.5 not-last:border-be not-last:border-solid not-last:border-divider',
    )}
  >
    <div className="text-xs text-muted-foreground">{label}</div>
    {typeof value === 'string' ? (
      <div className="truncate block text-sm leading-5.5 font-medium">{value}</div>
    ) : (
      value
    )}
  </div>
));

DetailRow.displayName = 'SavedViewDetailRow';

const SavedViewDetailsPanel = memo<SavedViewDetailsPanelProps>(
  ({ groupBy, groups, layout, title, total, view }) => {
    const { t } = useTranslation(['common', 'chat', 'project']);
    const workspaceId = useActiveWorkspaceId();
    const currentUserId = useUserStore(userProfileSelectors.userId);
    const currentUserName = useUserStore(userProfileSelectors.displayUserName);
    const currentUserAvatar = useUserStore(userProfileSelectors.userAvatar);
    const { members } = useWorkspaceMembersQuery();
    const [facetTab, setFacetTab] = useState<FacetTabKey>('projects');
    const summary = useMemo(
      () =>
        buildSavedViewDetailSummary({
          entityType: view.entityType,
          groupBy,
          groups,
          layout,
          total,
          visibility: view.visibility,
        }),
      [groupBy, groups, layout, total, view.entityType, view.visibility],
    );

    /* SavedViewItem stores ownerUserId only — resolve the display name through
       the workspace roster, same as the directory's Owner column. */
    const owner = useMemo(() => {
      if (view.ownerUserId === currentUserId) {
        return { avatar: currentUserAvatar || undefined, name: currentUserName };
      }
      const member = members?.find((entry) => entry.userId === view.ownerUserId);
      return {
        avatar: member?.user?.avatar ?? undefined,
        name: member?.user?.fullName || member?.user?.username || member?.user?.email || '',
      };
    }, [currentUserAvatar, currentUserId, currentUserName, members, view.ownerUserId]);

    const queryJson = useMemo(() => JSON.stringify(view.queryAst), [view.queryAst]);
    // facetTasks rejects non-task queries — project views get no facet card
    // until the server contract learns to facet project rows.
    const facetsSupported = view.entityType === 'task';
    const { data: facetData } = useSWR(
      workspaceId && view && facetsSupported
        ? ['savedview-facet', workspaceId, view.id, facetTab, queryJson]
        : null,
      () => workAttentionService.facet({ field: FACET_FIELDS[facetTab], query: view.queryAst }),
      { revalidateOnFocus: false },
    );
    const facetBuckets = facetData?.data.buckets ?? [];
    const restrictedCount = facetData?.data.restrictedCount ?? 0;

    return (
      <div className="flex flex-col gap-2.5">
        <div
          className={cn(
            'flex flex-col',
            'overflow-hidden border border-solid border-divider rounded-(--radius-card) bg-card',
          )}
        >
          <div
            className={cn(
              'flex items-center gap-2.5',
              'py-3 px-3.5 border-be border-solid border-divider',
            )}
          >
            <ListTodoIcon className="text-muted-foreground" size={16} />
            <div className="truncate block text-sm font-semibold">{title}</div>
          </div>
          <DetailRow
            label={t('savedViews.visibility', { ns: 'common' })}
            value={t(
              summary.visibility === 'private'
                ? 'savedViews.visibilityPrivate'
                : summary.visibility === 'team'
                  ? 'savedViews.visibilityTeam'
                  : 'savedViews.visibilityWorkspace',
              { ns: 'common' },
            )}
          />
          <DetailRow
            label={t('savedViews.column.owner', { ns: 'common' })}
            value={
              owner.name ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar avatar={owner.avatar} name={owner.name} size={20} />
                  <div className="truncate block text-sm leading-5.5 font-medium">{owner.name}</div>
                </div>
              ) : (
                '—'
              )
            }
          />
          <DetailRow
            label={t('savedViews.entityType', { ns: 'common' })}
            value={t(
              summary.entityType === 'project'
                ? 'savedViews.entityProject'
                : 'savedViews.entityTask',
              { ns: 'common' },
            )}
          />
          <DetailRow
            label={t('savedViews.display', { ns: 'common' })}
            value={t(
              summary.layout === 'board' ? 'savedViews.layoutBoard' : 'savedViews.layoutList',
              { ns: 'common' },
            )}
          />
          <DetailRow
            label={t('savedViews.grouping', { ns: 'common' })}
            value={t(`savedViews.groupBy.${summary.groupBy}` as never, { ns: 'common' })}
          />
          <DetailRow
            label={t('savedViews.results', { ns: 'common' })}
            value={t('savedViews.resultCount', { count: summary.total, ns: 'common' })}
          />
        </div>

        {/* Projects/Teams facet tabs — the two entity tabs the server facet
            contract supports. Counts come from the complete evaluated query,
            not just the loaded page; restricted buckets stay aggregated so
            unreadable names never leak. */}
        {facetsSupported ? (
          <div
            className={cn(
              'flex flex-col',
              'overflow-hidden border border-solid border-divider rounded-(--radius-card) bg-card',
            )}
          >
            <div
              className={cn(
                'flex items-center gap-1.5',
                'py-3 px-3.5 border-be border-solid border-divider',
              )}
            >
              {(['projects', 'teams'] as const).map((tab) => (
                <button
                  aria-pressed={facetTab === tab}
                  key={tab}
                  type="button"
                  className={cn(
                    'cursor-pointer min-h-8 py-1 px-2.5 border-0 rounded-full text-xs font-medium leading-5 text-muted-foreground bg-transparent hover:text-foreground',
                    facetTab === tab && 'text-foreground bg-selected',
                  )}
                  onClick={() => setFacetTab(tab)}
                >
                  {t(tab === 'projects' ? 'savedViews.facetProjects' : 'savedViews.facetTeams', {
                    ns: 'common',
                  })}
                </button>
              ))}
            </div>
            <div className="pbe-2 px-1.5">
              {facetBuckets.length === 0 && restrictedCount === 0 ? (
                <div className="text-xs text-muted-foreground py-1 px-2">
                  {t('savedViews.noMatches', { ns: 'common' })}
                </div>
              ) : (
                <>
                  {facetBuckets.map((bucket) => (
                    <div
                      key={bucket.key ?? 'none'}
                      className={cn(
                        'flex items-center justify-between',
                        'flex items-center justify-between py-1.5 px-2 text-sm leading-5.5',
                      )}
                    >
                      <div className="truncate block text-sm leading-5.5">
                        {bucket.name ??
                          (bucket.key === null
                            ? t(
                                facetTab === 'projects'
                                  ? 'savedViews.facetNoProject'
                                  : 'savedViews.facetNoTeam',
                                { ns: 'common' },
                              )
                            : t('savedViews.facetRestricted', { ns: 'common' }))}
                      </div>
                      <div className="text-xs text-muted-foreground">{bucket.count}</div>
                    </div>
                  ))}
                  {restrictedCount > 0 ? (
                    <div
                      className={cn(
                        'flex items-center justify-between',
                        'flex items-center justify-between py-1.5 px-2 text-sm leading-5.5',
                      )}
                    >
                      <div className="text-sm leading-5.5 text-muted-foreground">
                        {t('savedViews.facetRestricted', { ns: 'common' })}
                      </div>
                      <div className="text-xs text-muted-foreground">{restrictedCount}</div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}

        {summary.groups.length > 0 ? (
          <div
            className={cn(
              'flex flex-col',
              'overflow-hidden border border-solid border-divider rounded-(--radius-card) bg-card',
            )}
          >
            <div
              className={cn('flex flex-col', 'py-3 px-3.5 border-be border-solid border-divider')}
            >
              <div className="text-xs text-muted-foreground font-medium">
                {t('savedViews.groupCounts', { ns: 'common' })}
              </div>
            </div>
            {summary.groups.map((group) => {
              const labelKey = COLUMN_I18N_KEYS[group.key];
              const groupLabel =
                summary.entityType === 'project'
                  ? t(`status.${resolveProjectStatus(group.key)}` as never, { ns: 'project' })
                  : labelKey
                    ? t(labelKey as never, { ns: 'chat' })
                    : group.key;
              return (
                <div
                  key={group.key}
                  className={cn(
                    'flex items-center justify-between',
                    'min-h-9 px-3.5 not-last:border-be not-last:border-solid not-last:border-divider',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {createElement(layout === 'board' ? Columns3Icon : ListIcon, {
                      className: 'text-foreground-tertiary',
                      size: 14,
                    })}
                    <div className="text-sm leading-5.5">{groupLabel}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{group.total}</div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  },
);

SavedViewDetailsPanel.displayName = 'SavedViewDetailsPanel';

export default SavedViewDetailsPanel;

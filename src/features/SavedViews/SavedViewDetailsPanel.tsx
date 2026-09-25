'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { SavedViewItem } from '@orvilo/database/schemas';
import type { WorkQueryGroupBy, WorkQueryLayout } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { Columns3Icon, ListIcon, ListTodoIcon } from 'lucide-react';
import { memo, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import Avatar from '@/components/Avatar';
import { resolveProjectStatus } from '@/components/ExecutionStatus';
import { COLUMN_I18N_KEYS } from '@/features/AgentTasks/AgentTaskList/KanbanColumn';
import type { WorkQueryGroupPage } from '@/features/MyWork/workQueryPaging';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
import { workAttentionService } from '@/services/workAttention';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { buildSavedViewDetailSummary } from './savedViewDetails';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  cardHeader: css`
    padding-block: 12px;
    padding-inline: 14px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  groupRow: css`
    min-height: 36px;
    padding-inline: 14px;

    &:not(:last-child) {
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  metaRow: css`
    min-height: 38px;
    padding-inline: 14px;

    &:not(:last-child) {
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  facetList: css`
    padding-block-end: 8px;
    padding-inline: 6px;
  `,
  facetRow: css`
    display: flex;
    align-items: center;
    justify-content: space-between;

    padding-block: 5px;
    padding-inline: 8px;

    font-size: 13px;
  `,
  facetTab: css`
    cursor: pointer;

    padding-block: 4px;
    padding-inline: 10px;
    border: none;
    border-radius: 9999px;

    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  facetTabActive: css`
    color: ${cssVar.colorText};
    background: ${cssVar.colorFillSecondary};
  `,
  ownerCell: css`
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  `,
  titleIcon: css`
    color: ${cssVar.colorTextSecondary};
  `,
}));

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
  <Flexbox horizontal align="center" className={styles.metaRow} gap={16} justify="space-between">
    <Text fontSize={12} type="secondary">
      {label}
    </Text>
    {typeof value === 'string' ? (
      <Text ellipsis fontSize={13} weight={500}>
        {value}
      </Text>
    ) : (
      value
    )}
  </Flexbox>
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
      <Flexbox gap={10}>
        <Flexbox className={styles.card}>
          <Flexbox horizontal align="center" className={styles.cardHeader} gap={10}>
            <Icon className={styles.titleIcon} icon={ListTodoIcon} size={16} />
            <Text ellipsis fontSize={14} weight={600}>
              {title}
            </Text>
          </Flexbox>
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
                <div className={styles.ownerCell}>
                  <Avatar avatar={owner.avatar} name={owner.name} size={20} />
                  <Text ellipsis fontSize={13} weight={500}>
                    {owner.name}
                  </Text>
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
        </Flexbox>

        {/* Projects/Teams facet tabs — the two entity tabs the server facet
            contract supports. Counts come from the complete evaluated query,
            not just the loaded page; restricted buckets stay aggregated so
            unreadable names never leak. */}
        {facetsSupported ? (
          <Flexbox className={styles.card}>
            <Flexbox horizontal align="center" className={styles.cardHeader} gap={6}>
              {(['projects', 'teams'] as const).map((tab) => (
                <button
                  aria-pressed={facetTab === tab}
                  className={`${styles.facetTab} ${facetTab === tab ? styles.facetTabActive : ''}`}
                  key={tab}
                  type="button"
                  onClick={() => setFacetTab(tab)}
                >
                  {t(tab === 'projects' ? 'savedViews.facetProjects' : 'savedViews.facetTeams', {
                    ns: 'common',
                  })}
                </button>
              ))}
            </Flexbox>
            <div className={styles.facetList}>
              {facetBuckets.length === 0 && restrictedCount === 0 ? (
                <Text fontSize={12} style={{ paddingBlock: 4, paddingInline: 8 }} type="secondary">
                  {t('savedViews.noMatches', { ns: 'common' })}
                </Text>
              ) : (
                <>
                  {facetBuckets.map((bucket) => (
                    <Flexbox
                      horizontal
                      align="center"
                      className={styles.facetRow}
                      justify="space-between"
                      key={bucket.key ?? 'none'}
                    >
                      <Text ellipsis fontSize={13}>
                        {bucket.name ??
                          (bucket.key === null
                            ? t(
                                facetTab === 'projects'
                                  ? 'savedViews.facetNoProject'
                                  : 'savedViews.facetNoTeam',
                                { ns: 'common' },
                              )
                            : t('savedViews.facetRestricted', { ns: 'common' }))}
                      </Text>
                      <Text fontSize={12} type="secondary">
                        {bucket.count}
                      </Text>
                    </Flexbox>
                  ))}
                  {restrictedCount > 0 ? (
                    <Flexbox
                      horizontal
                      align="center"
                      className={styles.facetRow}
                      justify="space-between"
                    >
                      <Text fontSize={13} type="secondary">
                        {t('savedViews.facetRestricted', { ns: 'common' })}
                      </Text>
                      <Text fontSize={12} type="secondary">
                        {restrictedCount}
                      </Text>
                    </Flexbox>
                  ) : null}
                </>
              )}
            </div>
          </Flexbox>
        ) : null}

        {summary.groups.length > 0 ? (
          <Flexbox className={styles.card}>
            <Flexbox className={styles.cardHeader}>
              <Text fontSize={12} type="secondary" weight={500}>
                {t('savedViews.groupCounts', { ns: 'common' })}
              </Text>
            </Flexbox>
            {summary.groups.map((group) => {
              const labelKey = COLUMN_I18N_KEYS[group.key];
              const groupLabel =
                summary.entityType === 'project'
                  ? t(`status.${resolveProjectStatus(group.key)}` as never, { ns: 'project' })
                  : labelKey
                    ? t(labelKey as never, { ns: 'chat' })
                    : group.key;
              return (
                <Flexbox
                  horizontal
                  align="center"
                  className={styles.groupRow}
                  justify="space-between"
                  key={group.key}
                >
                  <Flexbox horizontal align="center" gap={8}>
                    <Icon
                      color={cssVar.colorTextTertiary}
                      icon={layout === 'board' ? Columns3Icon : ListIcon}
                      size={14}
                    />
                    <Text fontSize={13}>{groupLabel}</Text>
                  </Flexbox>
                  <Text fontSize={12} type="secondary">
                    {group.total}
                  </Text>
                </Flexbox>
              );
            })}
          </Flexbox>
        ) : null}
      </Flexbox>
    );
  },
);

SavedViewDetailsPanel.displayName = 'SavedViewDetailsPanel';

export default SavedViewDetailsPanel;

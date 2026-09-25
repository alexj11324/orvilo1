'use client';

import { Flexbox } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cx } from 'antd-style';
import type { KeyboardEvent, ReactNode } from 'react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import Avatar from '@/components/Avatar';
import { ProjectHealthIcon } from '@/features/Projects/healthMeta';
import { NoLeadIcon } from '@/features/Projects/List/NoLeadIcon';
import TeamIdentity from '@/features/WorkTeams/TeamIdentity';
import { useClientDataSWR } from '@/libs/swr';
import { lambdaClient } from '@/libs/trpc/client';

import type { ProjectListSummary } from './aggregateSummary';
import { CLOSED_PROJECT_STATUSES } from './displayOptions';
import {
  type ProjectListFilter,
  removeProjectListFilter,
  upsertProjectListFilter,
} from './listFilters';

const styles = createStaticStyles(({ css, cssVar }) => ({
  sidebar: css`
    position: absolute;
    z-index: 2;
    inset-block: 0;
    inset-inline-end: 0;

    overflow-y: auto;

    box-sizing: border-box;
    width: 351px;
    padding: 12px;
    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};
    box-shadow: -12px 0 32px -16px rgb(0 0 0 / 50%);
  `,
  sidebarRow: css`
    cursor: pointer;

    display: flex;
    gap: 8px;
    align-items: center;

    width: 100%;
    padding-block: 6px;
    padding-inline: 8px;
    border: none;
    border-radius: 6px;

    color: ${cssVar.colorText};
    text-align: start;

    background: transparent;

    &:hover,
    &:focus-visible {
      background: ${cssVar.colorFillTertiary};
    }

    &:hover .sidebar-row-action,
    &:focus-visible .sidebar-row-action {
      visibility: visible;
    }
  `,
  sidebarRowAction: css`
    margin-inline-start: auto;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;

    visibility: hidden;
  `,
  sidebarRowActionVisible: css`
    visibility: visible;
  `,
  sidebarRowActive: css`
    color: ${cssVar.colorPrimary};
    background: ${cssVar.colorFillSecondary};
  `,
  sidebarRowCount: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  sidebarSection: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  tab: css`
    cursor: pointer;

    flex: 1;

    height: 26px;
    padding-inline: 8px;
    border: none;
    border-radius: 6px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  tabActive: css`
    color: ${cssVar.colorText};
    background: ${cssVar.colorBgContainer};
    box-shadow: 0 0 0 1px ${cssVar.colorBorderSecondary};
  `,
  tabList: css`
    display: flex;
    gap: 2px;
    align-items: center;

    padding: 2px;
    border-radius: 8px;

    background: ${cssVar.colorFillTertiary};
  `,
}));

const TABS = ['health', 'teams', 'leads'] as const;
type SidebarTab = (typeof TABS)[number];

const setsEqual = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((value) => b.includes(value));

type FilterValues = Extract<ProjectListFilter, { values: readonly unknown[] }>;
const isSoleValue = (filter: FilterValues | undefined, value: unknown): boolean =>
  !!filter && filter.values.length === 1 && filter.values[0] === value;

/**
 * One sidebar bucket row — icon + label + count, doubling as a one-click
 * filter toggle. The reference reveals a "See projects" action on hover and
 * swaps it for a persistent "Clear filter" while the bucket drives the list;
 * the row stays a single button either way.
 */
const BucketRow = ({
  active,
  children,
  count,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  count: number;
  onClick: () => void;
}) => {
  const { t } = useTranslation('project');
  return (
    <button
      aria-pressed={active}
      className={cx(styles.sidebarRow, active && styles.sidebarRowActive)}
      type="button"
      onClick={onClick}
    >
      {children}
      <span
        className={cx(
          styles.sidebarRowAction,
          active && styles.sidebarRowActionVisible,
          'sidebar-row-action',
        )}
      >
        {active ? t('list.sidebar.clearFilter') : t('list.sidebar.seeProjects')}
      </span>
      <span className={styles.sidebarRowCount}>{count}</span>
    </button>
  );
};

/**
 * The reference's aggregate "Open sidebar" panel — a tab strip (Health /
 * Teams / Leads) over bucket rows computed from the loaded rows, each row a
 * one-click property filter ("See projects" ↔ "Clear filter"). Shared by the
 * workspace projects list and the team projects surface.
 *
 * Teams tab data: `project.list` rows carry no per-project team list, so the
 * tab joins the readable teams (`team.teams`) with each team's linked
 * project ids (`team.team.projectIds`) — lazily, only while the tab is
 * selected. A bucket count is the intersection with the listed rows, so it
 * always equals what "See projects" will show; the click applies the shared
 * `projects` id-set filter (a dedicated `team` filter type is still pending,
 * which is why the chip reads "Specific project" rather than the team name).
 */
const ProjectListAggregateSidebar = memo<{
  filters: ProjectListFilter[];
  memberAvatar: (userId: string) => string | undefined;
  memberName: (userId: string) => string | undefined;
  onFilters: (next: ProjectListFilter[]) => void;
  /** Ids of the rows the summary was computed over — teams buckets intersect against it. */
  rowIds: readonly string[];
  summary: ProjectListSummary;
}>(({ filters, memberAvatar, memberName, onFilters, rowIds, summary }) => {
  const { t } = useTranslation('project');
  const workspaceId = useActiveWorkspaceId();
  const [tab, setTab] = useState<SidebarTab>('health');

  const healthFilter = filters.find(
    (filter): filter is Extract<ProjectListFilter, { type: 'health' }> => filter.type === 'health',
  );
  const leadFilter = filters.find(
    (filter): filter is Extract<ProjectListFilter, { type: 'lead' }> => filter.type === 'lead',
  );
  const statusFilter = filters.find(
    (filter): filter is Extract<ProjectListFilter, { type: 'status' }> => filter.type === 'status',
  );
  const projectsFilter = filters.find(
    (filter): filter is Extract<ProjectListFilter, { type: 'projects' }> =>
      filter.type === 'projects',
  );

  const updateMissingActive = isSoleValue(healthFilter, null);
  const closedActive = !!statusFilter && setsEqual(statusFilter.values, CLOSED_PROJECT_STATUSES);

  // Team buckets resolve per-team linked project ids through the existing
  // team router — one workspace read plus one per team, only while the tab
  // is selected (null key skips the request entirely).
  const {
    data: teamLinks,
    error: teamsError,
    isLoading: teamsLoading,
  } = useClientDataSWR(
    tab === 'teams' && workspaceId ? ['project-list-team-links', workspaceId] : null,
    async () => {
      const { data: teams } = await lambdaClient.team.teams.query();
      return Promise.all(
        teams.map(async (team) => ({
          projectIds: (await lambdaClient.team.team.query({ teamId: team.id })).data.projectIds,
          team,
        })),
      );
    },
  );
  const rowIdSet = new Set(rowIds);
  const teamBuckets = (teamLinks ?? [])
    .map((link) => ({
      ids: link.projectIds.filter((id) => rowIdSet.has(id)),
      team: link.team,
    }))
    .filter((bucket) => bucket.ids.length > 0);

  const toggle = (key: string, active: boolean, filter: ProjectListFilter) =>
    onFilters(
      active ? removeProjectListFilter(filters, key) : upsertProjectListFilter(filters, filter),
    );

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const index = TABS.indexOf(tab);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? TABS.length - 1
          : (index + (event.key === 'ArrowLeft' ? -1 : 1) + TABS.length) % TABS.length;
    event.preventDefault();
    setTab(TABS[next]);
    (event.currentTarget.children[next] as HTMLElement).focus();
  };

  const tabId = (id: SidebarTab) => `project-list-sidebar-tab-${id}`;

  return (
    <aside aria-label={t('list.sidebar.label')} className={styles.sidebar}>
      <Flexbox gap={12}>
        <div
          aria-label={t('list.sidebar.label')}
          className={styles.tabList}
          role="tablist"
          onKeyDown={onTabKeyDown}
        >
          {TABS.map((id) => (
            <button
              aria-controls="project-list-sidebar-panel"
              aria-selected={tab === id}
              className={cx(styles.tab, tab === id && styles.tabActive)}
              id={tabId(id)}
              key={id}
              role="tab"
              tabIndex={tab === id ? 0 : -1}
              type="button"
              onClick={() => setTab(id)}
            >
              {t(`list.sidebar.${id}`)}
            </button>
          ))}
        </div>
        <div
          aria-labelledby={tabId(tab)}
          className={styles.sidebarSection}
          id="project-list-sidebar-panel"
          role="tabpanel"
        >
          {tab === 'health' ? (
            <>
              {summary.health.map(({ count, state }) => {
                const active = isSoleValue(healthFilter, state);
                return (
                  <BucketRow
                    active={active}
                    count={count}
                    key={state}
                    onClick={() => toggle('health', active, { type: 'health', values: [state] })}
                  >
                    <ProjectHealthIcon health={state} size={14} />
                    <Text ellipsis fontSize={13}>
                      {t(`list.health.${state}`, { defaultValue: state })}
                    </Text>
                  </BucketRow>
                );
              })}
              <BucketRow
                active={updateMissingActive}
                count={summary.updateMissing}
                onClick={() =>
                  toggle('health', updateMissingActive, { type: 'health', values: [null] })
                }
              >
                <ProjectHealthIcon health={null} size={14} />
                <Text ellipsis fontSize={13}>
                  {t('list.sidebar.updateMissing')}
                </Text>
              </BucketRow>
              <BucketRow
                active={closedActive}
                count={summary.noUpdateExpected}
                onClick={() =>
                  toggle('status', closedActive, {
                    type: 'status',
                    values: [...CLOSED_PROJECT_STATUSES],
                  })
                }
              >
                <ProjectHealthIcon health={null} size={14} />
                <Text ellipsis fontSize={13}>
                  {t('list.sidebar.noUpdateExpected')}
                </Text>
              </BucketRow>
            </>
          ) : null}
          {tab === 'teams' ? (
            teamsLoading ? (
              <Text fontSize={12} style={{ paddingBlock: 4, paddingInline: 8 }} type="secondary">
                {t('list.sidebar.teamsLoading')}
              </Text>
            ) : teamsError ? (
              <Text fontSize={12} style={{ paddingBlock: 4, paddingInline: 8 }} type="secondary">
                {t('list.sidebar.teamsError')}
              </Text>
            ) : teamBuckets.length === 0 ? (
              <Text fontSize={12} style={{ paddingBlock: 4, paddingInline: 8 }} type="secondary">
                {t('list.sidebar.teamsEmpty')}
              </Text>
            ) : (
              teamBuckets.map((bucket) => {
                const active = !!projectsFilter && setsEqual(projectsFilter.ids, bucket.ids);
                return (
                  <BucketRow
                    active={active}
                    count={bucket.ids.length}
                    key={bucket.team.id}
                    onClick={() =>
                      toggle('projects', active, { ids: bucket.ids, type: 'projects' })
                    }
                  >
                    <TeamIdentity
                      color={bucket.team.color}
                      id={bucket.team.id}
                      letter={(bucket.team.key || bucket.team.name).slice(0, 1)}
                      size={16}
                    />
                    <Text ellipsis fontSize={13}>
                      {bucket.team.name}
                    </Text>
                  </BucketRow>
                );
              })
            )
          ) : null}
          {tab === 'leads'
            ? summary.leads.map(({ count, userId }) => {
                const active = isSoleValue(leadFilter, userId);
                return (
                  <BucketRow
                    active={active}
                    count={count}
                    key={userId ?? 'none'}
                    onClick={() => toggle('lead', active, { type: 'lead', values: [userId] })}
                  >
                    {userId ? (
                      <Avatar
                        avatar={memberAvatar(userId)}
                        name={memberName(userId)}
                        shape="circle"
                        size={16}
                      />
                    ) : (
                      <NoLeadIcon />
                    )}
                    <Text ellipsis fontSize={13}>
                      {userId ? memberName(userId) : t('properties.noLead')}
                    </Text>
                  </BucketRow>
                );
              })
            : null}
        </div>
      </Flexbox>
    </aside>
  );
});

ProjectListAggregateSidebar.displayName = 'ProjectListAggregateSidebar';

export default ProjectListAggregateSidebar;

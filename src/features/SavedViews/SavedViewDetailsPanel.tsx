'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { SavedViewItem } from '@orvilo/database/schemas';
import type { WorkQueryGroupBy, WorkQueryLayout } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { Columns3Icon, ListIcon, ListTodoIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { resolveProjectStatus } from '@/components/ExecutionStatus';
import { COLUMN_I18N_KEYS } from '@/features/AgentTasks/AgentTaskList/KanbanColumn';
import type { WorkQueryGroupPage } from '@/features/MyWork/workQueryPaging';

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
  titleIcon: css`
    color: ${cssVar.colorTextSecondary};
  `,
}));

interface SavedViewDetailsPanelProps {
  groupBy?: WorkQueryGroupBy;
  groups?: WorkQueryGroupPage<{ id: string }>[];
  layout?: WorkQueryLayout;
  title: string;
  total?: number;
  view: SavedViewItem;
}

const DetailRow = memo<{ label: string; value: string }>(({ label, value }) => (
  <Flexbox horizontal align="center" className={styles.metaRow} gap={16} justify="space-between">
    <Text fontSize={12} type="secondary">
      {label}
    </Text>
    <Text ellipsis fontSize={13} weight={500}>
      {value}
    </Text>
  </Flexbox>
));

DetailRow.displayName = 'SavedViewDetailRow';

const SavedViewDetailsPanel = memo<SavedViewDetailsPanelProps>(
  ({ groupBy, groups, layout, title, total, view }) => {
    const { t } = useTranslation(['common', 'chat', 'project']);
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

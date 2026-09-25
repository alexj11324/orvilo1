'use client';

import { Center, Empty, Flexbox, Icon } from '@lobehub/ui';
import { Button, confirmModal, DropdownMenu, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cx } from 'antd-style';
import { DiamondIcon, EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { memo, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { getProjectMilestoneIssuesPath } from '@/features/Projects/milestoneFilter';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { MILESTONE_ICON_PAINT } from '@/features/Projects/milestoneRow';
import { SECTION_LABEL_PROPS } from '@/features/Projects/sectionLabel';
import { useProjectDateFormatter } from '@/features/Projects/useProjectDateFormatter';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { type ProjectDetail, useProjectStore } from '@/store/project';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { openMilestoneFormModal } from './MilestoneFormModal';
import {
  milestoneProgressView,
  type MilestoneRow,
  sortMilestonesForList,
} from './milestonePageData';

const styles = createStaticStyles(({ css, cssVar }) => ({
  addRow: css`
    cursor: pointer;

    display: flex;
    gap: 8px;
    align-items: center;

    width: 100%;
    min-height: 40px;
    padding-block: 6px;
    padding-inline: 10px;
    border: 0;
    border-radius: 8px;

    font-size: 13px;
    font-weight: 450;
    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  body: css`
    overflow-y: auto;
    flex: 1;

    min-height: 0;
    padding-block: 24px 32px;
    padding-inline: max(24px, calc((100% - 800px) / 2));
  `,
  date: css`
    flex: none;

    min-width: 96px;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    text-align: end;
  `,
  dateEmpty: css`
    color: ${cssVar.colorTextDescription};
  `,
  list: css`
    display: flex;
    flex-direction: column;
  `,
  progressBar: css`
    position: relative;

    overflow: hidden;
    flex: none;

    width: 64px;
    height: 4px;
    border-radius: 9999px;

    background: ${cssVar.colorFillSecondary};
  `,
  progressBarFill: css`
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;

    border-radius: 9999px;

    background: ${MILESTONE_ICON_PAINT.fill};
  `,
  /* Same "issues · percent" pill the overview milestone card links to the
     filtered issues list with. */
  progressLink: css`
    display: flex;
    flex: none;
    gap: 8px;
    align-items: center;

    height: 28px;
    padding-inline: 8px;
    border-radius: 9999px;

    font-size: 13px;
    font-weight: 450;
    color: ${cssVar.colorTextSecondary};
    text-decoration: none;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  progressPlaceholder: css`
    flex: none;

    width: 64px;

    font-size: 12px;
    color: ${cssVar.colorTextDescription};
    text-align: end;
  `,
  row: css`
    display: flex;
    gap: 12px;
    align-items: center;

    min-height: 44px;
    padding-block: 6px;
    padding-inline: 10px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
}));

interface ProjectMilestonesPageProps {
  detail: ProjectDetail;
}

/**
 * The project's Milestones tab: a compact list where each row is one
 * milestone — diamond, name, target date, progress bar + issues readout, and
 * a `⋯` menu — with an add row underneath. The overview keeps the rich card
 * surface (descriptions, collapse, drag); this page is the dense management
 * list, ordered by target date like a timeline.
 */
const ProjectMilestonesPage = memo<ProjectMilestonesPageProps>(({ detail }) => {
  const { t } = useTranslation(['project', 'common']);
  const formatDate = useProjectDateFormatter();
  const project = detail.project;
  const projectRef = project.slug || project.id;
  const milestones = useMemo(
    () => sortMilestonesForList(detail.milestones ?? []),
    [detail.milestones],
  );

  const userId = useUserStore(userProfileSelectors.userId);
  // Same ownership check the overview milestone card gates its controls on.
  const canEdit = !!project.userId && userId === project.userId;

  const deleteMilestone = useProjectStore((s) => s.deleteMilestone);
  const busyRef = useRef(false);

  const confirmDelete = (milestone: MilestoneRow) => {
    confirmModal({
      content: t('overview.milestoneDeleteConfirm.content', { name: milestone.name }),
      okButtonProps: { danger: true },
      okText: t('overview.milestoneDeleteConfirm.ok'),
      title: t('overview.milestoneDeleteConfirm.title'),
      onOk: async () => {
        // One delete at a time: a second click racing the first would land on
        // the pre-refresh list, and the detail refetch settles both anyway.
        if (busyRef.current) return;
        busyRef.current = true;
        try {
          await deleteMilestone(project.id, milestone.id);
        } catch (error) {
          console.error('Failed to delete project milestone', error);
          toast.error(t('overview.milestoneDeleteError'));
        } finally {
          busyRef.current = false;
        }
      },
    });
  };

  const milestoneMenu = (milestone: MilestoneRow) => [
    {
      icon: PencilIcon,
      key: 'edit',
      label: t('overview.milestoneEdit'),
      onClick: () => openMilestoneFormModal({ milestone, projectId: project.id }),
    },
    { type: 'divider' as const },
    {
      danger: true,
      icon: Trash2Icon,
      key: 'delete',
      label: t('overview.milestoneDelete'),
      onClick: () => confirmDelete(milestone),
    },
  ];

  const renderRow = (milestone: MilestoneRow) => {
    const progress = milestoneProgressView(milestone.progress);
    return (
      <div className={styles.row} key={milestone.id}>
        <MilestoneIcon />
        <Text ellipsis fontSize={13} style={{ flex: 1, minWidth: 0 }} weight={450}>
          {milestone.name}
        </Text>
        <span className={cx(styles.date, !milestone.date && styles.dateEmpty)}>
          {milestone.date ? formatDate(milestone.date) : t('milestones.noTargetDate')}
        </span>
        {progress ? (
          <WorkspaceLink
            className={styles.progressLink}
            to={getProjectMilestoneIssuesPath(projectRef, milestone.id)}
            aria-label={t('overview.milestoneIssues', {
              count: progress.issues,
              percent: progress.percent,
            })}
          >
            <span aria-hidden className={styles.progressBar}>
              <span className={styles.progressBarFill} style={{ width: `${progress.percent}%` }} />
            </span>
            {t('overview.milestoneIssues', {
              count: progress.issues,
              percent: progress.percent,
            })}
          </WorkspaceLink>
        ) : (
          <span className={styles.progressPlaceholder}>—</span>
        )}
        {canEdit && (
          <DropdownMenu items={milestoneMenu(milestone)}>
            <Button
              aria-label={t('overview.milestoneMenu')}
              icon={EllipsisIcon}
              size={'small'}
              type={'text'}
            />
          </DropdownMenu>
        )}
      </div>
    );
  };

  return (
    <div className={styles.body}>
      <Flexbox gap={8}>
        <Flexbox horizontal align={'center'} justify={'space-between'}>
          <Text {...SECTION_LABEL_PROPS}>{t('sections.milestones')}</Text>
        </Flexbox>
        {milestones.length === 0 ? (
          <Center padding={40}>
            <Empty
              icon={DiamondIcon}
              iconColor={MILESTONE_ICON_PAINT.color}
              action={
                canEdit ? (
                  <Button
                    icon={PlusIcon}
                    type={'primary'}
                    onClick={() => openMilestoneFormModal({ projectId: project.id })}
                  >
                    {t('create.addMilestone')}
                  </Button>
                ) : undefined
              }
              description={
                <Flexbox gap={4}>
                  <Text>{t('milestones.empty.title')}</Text>
                  <Text fontSize={12} type={'secondary'}>
                    {t('milestones.empty.description')}
                  </Text>
                </Flexbox>
              }
            />
          </Center>
        ) : (
          <div className={styles.list}>{milestones.map(renderRow)}</div>
        )}
        {canEdit && milestones.length > 0 && (
          <button
            className={styles.addRow}
            type="button"
            onClick={() => openMilestoneFormModal({ projectId: project.id })}
          >
            <Icon icon={PlusIcon} size={14} />
            {t('create.addMilestone')}
          </button>
        )}
      </Flexbox>
    </div>
  );
});

ProjectMilestonesPage.displayName = 'ProjectMilestonesPage';

export default ProjectMilestonesPage;

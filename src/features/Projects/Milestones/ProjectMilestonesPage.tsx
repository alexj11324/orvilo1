'use client';
import { cn } from 'cn';
import { DiamondIcon, EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { createElement, memo, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import DropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { getProjectMilestoneIssuesPath } from '@/features/Projects/milestoneFilter';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { formatProjectDate } from '@/features/Projects/projectPlanningDate';
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

const styles = {
  addRow:
    'w-full justify-start px-2.5 text-sm leading-5.5 font-medium text-muted-foreground bg-transparent hover:text-foreground hover:bg-accent',
  body: 'overflow-y-auto flex-1 min-h-0 pbs-6 pbe-8 [padding-inline:max(24px,calc((100%_-_800px)/2))]',
  date: 'flex-none min-w-24 text-xs leading-5 text-muted-foreground text-end',
  dateEmpty: 'text-foreground-description',
  list: 'flex flex-col',
  progressBar: 'relative overflow-hidden flex-none w-16 h-1 rounded-full bg-muted',
  progressBarFill: 'absolute inset-y-0 inset-s-0 rounded-full bg-primary',
  progressLink:
    'flex flex-none gap-2 items-center min-h-8 px-2 rounded-full text-xs leading-5 font-medium text-muted-foreground no-underline hover:text-foreground hover:bg-accent',
  progressPlaceholder: 'flex-none w-16 text-xs leading-5 text-foreground-description text-end',
  row: 'flex gap-3 items-center min-h-11 py-1.5 px-2.5 border-be border-divider rounded-(--radius-card) hover:bg-accent',
};

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
          const result = await deleteMilestone(project.id, milestone.id);
          if (result.refreshError) toast.warning(t('overview.milestoneRefreshError'));
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
        <span className="text-sm leading-5.5 truncate font-normal flex-1 min-w-0">
          {milestone.name}
        </span>
        <span className={cn(styles.date, !milestone.date && styles.dateEmpty)}>
          {milestone.date ? formatProjectDate(milestone.date) : t('milestones.noTargetDate')}
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
            <Button aria-label={t('overview.milestoneMenu')} size="icon" variant="ghost">
              {createElement(EllipsisIcon, { 'size': 16, 'aria-hidden': true })}
            </Button>
          </DropdownMenu>
        )}
      </div>
    );
  };

  return (
    <div className={styles.body}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-row items-center justify-between">
          <span className="text-(length:--text-dense) leading-5.5 font-medium text-muted-foreground">
            {t('sections.milestones')}
          </span>
        </div>
        {milestones.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10">
            <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
              {createElement(DiamondIcon, { 'size': 40, 'aria-hidden': true })}
              <div>
                {
                  <div className="flex flex-col gap-1">
                    <span className="text-sm">{t('milestones.empty.title')}</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      {t('milestones.empty.description')}
                    </span>
                  </div>
                }
              </div>
              {canEdit ? (
                <Button
                  size="lg"
                  variant="default"
                  onClick={() => openMilestoneFormModal({ projectId: project.id })}
                >
                  {createElement(PlusIcon, { 'size': 16, 'aria-hidden': true })}
                  {t('create.addMilestone')}
                </Button>
              ) : undefined}
            </div>
          </div>
        ) : (
          <div className={styles.list}>{milestones.map(renderRow)}</div>
        )}
        {canEdit && milestones.length > 0 && (
          <Button
            className={styles.addRow}
            size="normal"
            type="button"
            variant="ghost"
            onClick={() => openMilestoneFormModal({ projectId: project.id })}
          >
            <PlusIcon className="size-4" size={16} />
            {t('create.addMilestone')}
          </Button>
        )}
      </div>
    </div>
  );
});

ProjectMilestonesPage.displayName = 'ProjectMilestonesPage';

export default ProjectMilestonesPage;

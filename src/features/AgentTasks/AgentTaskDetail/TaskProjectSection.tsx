'use client';

import { Block, type DropdownItem, DropdownMenu, Flexbox, Icon } from '@lobehub/ui';
import { Text, toast } from '@lobehub/ui/base-ui';
import { CheckIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { getProjectMilestoneIssuesPath } from '@/features/Projects/milestoneFilter';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { projectAvatar } from '@/features/Projects/ProjectIcon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useProjectStore } from '@/store/project';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { useActiveTaskProject } from '../shared/useActiveTaskProject';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';

/**
 * The rail's "Project" group — Linear files every issue under a project or a
 * team, so the rail shows the owning project as a chip plus the milestone row
 * underneath it. A task with no `projectId` renders nothing: the group only
 * exists when the data does (the breadcrumb covers the team-owned case).
 */
const TaskProjectSection = memo(() => {
  const { t } = useTranslation(['chat', 'project']);
  const navigate = useWorkspaceAwareNavigate();
  const { milestone, milestones, project, projectRef, taskDatabaseId } = useActiveTaskProject();
  const setTaskMilestone = useProjectStore((s) => s.setTaskMilestone);
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const { allowed: canEditTask } = usePermission('create_content');
  const [pending, setPending] = useState(false);

  // `manageable()` on the server is `projects.userId = me` — the same gate the
  // project overview's milestone assign menu uses, so a member sees the
  // milestone but cannot re-file it.
  const canEdit = canEditTask && !!project?.userId && project.userId === currentUserId;

  const milestoneItems = useMemo<DropdownItem[]>(() => {
    if (!project) return [];
    const change = async (milestoneId: string | null) => {
      if (!taskDatabaseId || pending) return;
      setPending(true);
      try {
        await setTaskMilestone(project.id, taskDatabaseId, milestoneId);
      } catch {
        // Store action revalidates the project detail on success; on failure
        // the row keeps its last state and the toast carries the reason.
        toast.error(t('taskDetail.milestone.updateFailed'));
      } finally {
        setPending(false);
      }
    };
    return [
      ...milestones.map((row) => ({
        icon: row.id === milestone?.id ? <Icon icon={CheckIcon} /> : undefined,
        key: row.id,
        label: (
          <Flexbox horizontal align={'center'} gap={8} justify={'space-between'}>
            <span>{row.name}</span>
            {row.date && (
              <Text fontSize={12} type={'secondary'}>
                {row.date}
              </Text>
            )}
          </Flexbox>
        ),
        onClick: () => void change(row.id),
      })),
      { type: 'divider' },
      {
        icon: !milestone ? <Icon icon={CheckIcon} /> : undefined,
        key: 'none',
        label: t('taskList.noMilestone'),
        onClick: () => void change(null),
      },
    ];
  }, [project, milestones, milestone, taskDatabaseId, pending, setTaskMilestone, t]);

  if (!project || !projectRef) return null;

  const milestoneLabel = milestone
    ? `${milestone.name}${milestone.date ? ` · ${milestone.date}` : ''}`
    : t('taskList.noMilestone');

  // Editable → the row is Linear's milestone picker (a dropdown trigger);
  // read-only → the same row links to the milestone-filtered issues list.
  const milestoneRow = canEdit ? (
    <DropdownMenu items={milestoneItems} placement={'bottomRight'}>
      <Block
        clickable
        horizontal
        align={'center'}
        className={styles.railRow}
        gap={8}
        title={t('taskDetail.milestone.hint')}
        variant={'borderless'}
      >
        <MilestoneIcon size={14} style={{ flex: 'none' }} />
        <Text
          ellipsis
          style={{ minWidth: 0 }}
          type={milestone ? undefined : 'secondary'}
          weight={500}
        >
          {milestoneLabel}
        </Text>
      </Block>
    </DropdownMenu>
  ) : (
    <Block
      clickable
      horizontal
      align={'center'}
      className={styles.railRow}
      gap={8}
      title={milestone ? t('overview.milestoneSeeIssues', { ns: 'project' }) : undefined}
      variant={'borderless'}
      onClick={() => milestone && navigate(getProjectMilestoneIssuesPath(projectRef, milestone.id))}
    >
      <MilestoneIcon size={14} style={{ flex: 'none' }} />
      <Text ellipsis style={{ minWidth: 0 }} weight={500}>
        {milestoneLabel}
      </Text>
    </Block>
  );

  return (
    <div className={styles.railSection}>
      <span className={styles.railSectionLabel}>{t('taskDetail.project')}</span>
      <Block
        clickable
        horizontal
        align={'center'}
        className={styles.railRow}
        gap={8}
        title={project.name}
        variant={'borderless'}
        onClick={() => navigate(`/project/${projectRef}`)}
      >
        <Avatar
          avatar={projectAvatar(project.avatar, 16)}
          background={project.avatar ? undefined : 'transparent'}
          name={project.name}
          shape={'square'}
          size={16}
          style={{ flex: 'none' }}
        />
        <Text ellipsis style={{ minWidth: 0 }} weight={500}>
          {project.name}
        </Text>
      </Block>
      {/* The milestone row only exists where a milestone could: set, or a
          catalog the picker can file under. A project with zero milestones
          shows no row at all — there is nothing to choose and no state to
          claim. */}
      {(milestone || (canEdit && milestones.length > 0)) && milestoneRow}
    </div>
  );
});

TaskProjectSection.displayName = 'TaskProjectSection';

export default TaskProjectSection;

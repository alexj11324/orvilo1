'use client';

import { Block, Flexbox } from '@lobehub/ui';
import { ActionIcon, Text } from '@lobehub/ui/base-ui';
import { SquareArrowOutUpRightIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { projectAvatar } from '@/features/Projects/ProjectIcon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import { useActiveTaskProject } from '../shared/useActiveTaskProject';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';

/**
 * The rail's "Project" group — Linear files every issue under a project or a
 * team, so the rail shows the owning project as a chip plus an "Open project"
 * link. A task with no `projectId` renders nothing: the group only exists
 * when the data does (the breadcrumb covers the team-owned case). Milestones
 * live on the project's own pages in the reference, not in the issue rail —
 * the dedicated milestone row was removed for parity; assignment still lives
 * in the project's milestone views.
 */
const TaskProjectSection = memo(() => {
  const { t } = useTranslation('chat');
  const navigate = useWorkspaceAwareNavigate();
  const { project, projectRef } = useActiveTaskProject();

  if (!project || !projectRef) return null;

  return (
    <div className={styles.railSection}>
      <div className={styles.railSectionHeader}>
        <span aria-level={3} className={styles.railSectionLabel} role={'heading'}>
          {t('taskDetail.project')}
        </span>
      </div>
      <Flexbox horizontal align={'center'} gap={2}>
        <Block
          clickable
          horizontal
          align={'center'}
          className={styles.railRow}
          gap={8}
          style={{ flex: 1, minWidth: 0 }}
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
        <ActionIcon
          aria-label={t('taskDetail.openProject')}
          icon={SquareArrowOutUpRightIcon}
          size={'small'}
          title={t('taskDetail.openProject')}
          onClick={() => navigate(`/project/${projectRef}`)}
        />
      </Flexbox>
    </div>
  );
});

TaskProjectSection.displayName = 'TaskProjectSection';

export default TaskProjectSection;

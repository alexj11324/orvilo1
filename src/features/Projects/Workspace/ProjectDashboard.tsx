'use client';

import { Flexbox } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { memo } from 'react';

import type { ProjectDetail } from '@/store/project';

import ProjectMilestones from './ProjectMilestones';

const styles = createStaticStyles(({ css }) => ({
  main: css`
    min-width: 0;
    margin-block-start: 24px;
  `,
}));

interface ProjectDashboardProps {
  detail: ProjectDetail;
  projectId: string;
}

/**
 * Project overview body below the update composer. Linear's overview shows a
 * single Milestones section here; goals, in-flight tasks and orchestration
 * live on their own pages/tabs, not on the overview.
 */
const ProjectDashboard = memo<ProjectDashboardProps>(({ detail }) => {
  return (
    <Flexbox className={styles.main} gap={24}>
      <ProjectMilestones detail={detail} />
    </Flexbox>
  );
});

ProjectDashboard.displayName = 'ProjectDashboard';

export default ProjectDashboard;

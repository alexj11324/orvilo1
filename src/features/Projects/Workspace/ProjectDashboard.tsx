'use client';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
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
    <div className={cn('flex flex-col', styles.main)} style={{ gap: 24 }}>
      <ProjectMilestones detail={detail} />
    </div>
  );
});

ProjectDashboard.displayName = 'ProjectDashboard';

export default ProjectDashboard;

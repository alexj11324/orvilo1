'use client';
import { memo } from 'react';

import type { ProjectDetail } from '@/store/project';

import ProjectMilestones from './ProjectMilestones';

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
    <div className={'flex flex-col min-w-0 mbs-6 gap-6'}>
      <ProjectMilestones detail={detail} />
    </div>
  );
});

ProjectDashboard.displayName = 'ProjectDashboard';

export default ProjectDashboard;

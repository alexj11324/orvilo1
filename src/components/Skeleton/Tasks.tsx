'use client';

import { Fragment } from 'react';

import { Separator } from '@/components/ui/separator';
import TaskItemSkeleton from '@/features/AgentTasks/AgentTaskList/TaskItemSkeleton';
import NavHeader from '@/features/NavHeader';
import { WorkSurface, WorkSurfaceCollection } from '@/features/WorkSurface';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

const TasksSkeleton = ({ chrome = 'page' }: RouteSkeletonProps) => (
  <WorkSurface aria-busy>
    {chrome !== 'body' && <NavHeader />}
    <WorkSurfaceCollection className={'flex flex-col gap-4'}>
      <div style={{ gap: 2, padding: 2 }}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Fragment key={index}>
            <TaskItemSkeleton />
            {index !== 4 && <Separator className={'m-0'} />}
          </Fragment>
        ))}
      </div>
    </WorkSurfaceCollection>
  </WorkSurface>
);

export default TasksSkeleton;

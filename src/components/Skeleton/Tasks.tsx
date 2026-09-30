'use client';

import { Fragment } from 'react';

import { Separator } from '@/components/ui/separator';
import TaskItemSkeleton from '@/features/AgentTasks/AgentTaskList/TaskItemSkeleton';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

const TasksSkeleton = ({ chrome = 'page' }: RouteSkeletonProps) => (
  <div aria-busy className={'flex flex-col flex-1'}>
    {chrome !== 'body' && <NavHeader />}
    <WideScreenContainer fullWidth wrapperStyle={{ flex: 1, overflowY: 'auto' }}>
      <div className={'flex flex-col gap-4 px-4 py-4'}>
        <div style={{ gap: 2, padding: 2 }}>
          {Array.from({ length: 5 }).map((_, index) => (
            <Fragment key={index}>
              <TaskItemSkeleton />
              {index !== 4 && <Separator className={'m-0'} />}
            </Fragment>
          ))}
        </div>
      </div>
    </WideScreenContainer>
  </div>
);

export default TasksSkeleton;

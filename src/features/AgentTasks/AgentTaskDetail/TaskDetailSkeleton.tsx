'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { memo } from 'react';

import SkeletonBar from '@/components/Skeleton/Bar';
import NavHeader from '@/features/NavHeader';
import { WorkSurface, WorkSurfaceDocument } from '@/features/WorkSurface';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

import { taskDetailFullPageStyles } from './taskDetailFullPageStyles';
import { taskDetailLayoutStyles as layout } from './taskDetailLayoutStyles';

const styles = createStaticStyles(({ css }) => ({
  acceptance: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,
  divider: css`
    width: 100%;
    height: 1px;
    background: ${cssVar.colorBorderSecondary};
  `,
  control: css`
    height: 32px;
    padding-inline: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
}));

const TaskDetailBodySkeleton = () => (
  <div aria-busy className={`flex flex-col flex-1 ${layout.root}`}>
    <div className={layout.header}>
      <div className={`flex flex-col gap-3 ${layout.main}`}>
        <div style={{ paddingBottom: 5, paddingTop: 5 }}>
          <SkeletonBar height={24} width={'min(520px, 56%)'} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className={`flex items-center gap-2 ${styles.control}`} style={{ width: 76 }}>
            <SkeletonBar height={12} radius={3} width={12} />
            <SkeletonBar height={10} width={36} />
          </div>
          <div className={`flex items-center gap-2 ${styles.control}`} style={{ width: 96 }}>
            <SkeletonBar height={16} radius={'50%'} width={16} />
            <SkeletonBar height={10} width={48} />
          </div>
          <div className={`flex items-center gap-2 ${styles.control}`} style={{ width: 176 }}>
            <SkeletonBar height={16} radius={'50%'} width={16} />
            <SkeletonBar height={10} width={116} />
          </div>
        </div>
      </div>
      <div className={layout.side}>
        <div className={layout.properties}>
          {Array.from({ length: 3 }).map((_, index) => (
            <div className={`flex items-center gap-2 ${layout.propertyItem}`} key={index}>
              <SkeletonBar height={16} radius={4} width={16} />
              <SkeletonBar height={14} width={index === 1 ? 80 : 68} />
            </div>
          ))}
        </div>
      </div>

      {/* Same grid child as the real body column — the skeleton mirrors the
          two-column layout instead of painting a full-width block. */}
      <div className={`flex flex-col gap-6 ${layout.body}`}>
        <div className="flex flex-col gap-3">
          <SkeletonBar height={14} width={'94%'} />
          <SkeletonBar height={14} width={'88%'} />
          <SkeletonBar height={14} width={'72%'} />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <SkeletonBar height={16} radius={'50%'} width={16} />
            <SkeletonBar height={18} width={112} />
          </div>
          <div className={`flex flex-col ${styles.acceptance}`}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="flex flex-col" key={index}>
                {index > 0 && <div className={styles.divider} />}
                <div className="flex items-center gap-2.5 p-3">
                  <SkeletonBar height={16} radius={'50%'} width={16} />
                  <SkeletonBar height={12} width={24} />
                  <SkeletonBar height={14} width={`${58 + index * 9}%`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const TaskDetailSkeleton = memo<RouteSkeletonProps>(({ chrome = 'page' }) =>
  chrome === 'body' ? (
    <TaskDetailBodySkeleton />
  ) : (
    <WorkSurface>
      <NavHeader />
      <WorkSurfaceDocument className={taskDetailFullPageStyles.document}>
        <TaskDetailBodySkeleton />
      </WorkSurfaceDocument>
    </WorkSurface>
  ),
);

TaskDetailSkeleton.displayName = 'TaskDetailSkeleton';

export default TaskDetailSkeleton;

'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { memo } from 'react';

import SkeletonBar from '@/components/Skeleton/Bar';
import NavHeader from '@/features/NavHeader';
import { WorkSurface, WorkSurfaceDocument } from '@/features/WorkSurface';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

import { taskDetailFullPageStyles } from './taskDetailFullPageStyles';
import {
  TASK_DETAIL_SIDEBAR_MIN_WIDTH,
  taskDetailLayoutStyles as layout,
} from './taskDetailLayoutStyles';

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
    height: 28px;
    padding-inline: 8px;
    border-radius: 999px;
    background: ${cssVar.colorFillTertiary};

    @container task-detail (width >= ${TASK_DETAIL_SIDEBAR_MIN_WIDTH}px) {
      border-radius: ${cssVar.borderRadius};
      background: transparent;
    }
  `,
}));

const TaskDetailBodySkeleton = () => (
  <div aria-busy className={`flex flex-col flex-1 ${layout.root}`}>
    <div data-task-detail-header className={layout.header}>
      <div className={`flex flex-col gap-3 ${layout.main}`}>
        <div style={{ paddingBottom: 5, paddingTop: 5 }}>
          <SkeletonBar height={20} width={'min(520px, 56%)'} />
        </div>
      </div>
      <div data-task-detail-side className={layout.side}>
        <div className={layout.railActions}>
          <SkeletonBar height={32} radius={'50%'} width={32} />
          <SkeletonBar height={32} radius={'50%'} width={32} />
        </div>
        <div className={layout.propertyGroups}>
          <div className={layout.railSection}>
            <span className={layout.railSectionLabel}>
              <SkeletonBar height={10} width={64} />
            </span>
            <div className={layout.properties}>
              {[76, 96, 176].map((width, index) => (
                <div data-task-skeleton-property className={layout.propertyRow} key={index}>
                  <div className={`flex items-center gap-2 ${styles.control}`} style={{ width }}>
                    <SkeletonBar height={16} radius={index === 2 ? '50%' : 3} width={16} />
                    <SkeletonBar height={10} width={width - 40} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div data-task-detail-description className={`flex flex-col gap-3 ${layout.description}`}>
        <SkeletonBar height={14} width={'94%'} />
        <SkeletonBar height={14} width={'88%'} />
        <SkeletonBar height={14} width={'72%'} />
      </div>

      {/* Same grid child as the real body column — the skeleton mirrors the
          two-column layout instead of painting a full-width block. */}
      <div className={`flex flex-col gap-6 ${layout.body}`}>
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

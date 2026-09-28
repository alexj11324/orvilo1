'use client';

import { Flexbox } from '@lobehub/ui';
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
  <Flexbox aria-busy className={layout.root} flex={1}>
    <div className={layout.header}>
      <Flexbox className={layout.main} gap={12}>
        <Flexbox style={{ paddingBottom: 5, paddingTop: 5 }}>
          <SkeletonBar height={24} width={'min(520px, 56%)'} />
        </Flexbox>
        <Flexbox horizontal gap={8} wrap={'wrap'}>
          <Flexbox horizontal align={'center'} className={styles.control} gap={8} width={76}>
            <SkeletonBar height={12} radius={3} width={12} />
            <SkeletonBar height={10} width={36} />
          </Flexbox>
          <Flexbox horizontal align={'center'} className={styles.control} gap={8} width={96}>
            <SkeletonBar height={16} radius={'50%'} width={16} />
            <SkeletonBar height={10} width={48} />
          </Flexbox>
          <Flexbox horizontal align={'center'} className={styles.control} gap={8} width={176}>
            <SkeletonBar height={16} radius={'50%'} width={16} />
            <SkeletonBar height={10} width={116} />
          </Flexbox>
        </Flexbox>
      </Flexbox>
      <div className={layout.side}>
        <div className={layout.properties}>
          {Array.from({ length: 3 }).map((_, index) => (
            <Flexbox
              horizontal
              align={'center'}
              className={layout.propertyItem}
              gap={8}
              key={index}
            >
              <SkeletonBar height={16} radius={4} width={16} />
              <SkeletonBar height={14} width={index === 1 ? 80 : 68} />
            </Flexbox>
          ))}
        </div>
      </div>

      {/* Same grid child as the real body column — the skeleton mirrors the
          two-column layout instead of painting a full-width block. */}
      <Flexbox className={layout.body} gap={24}>
        <Flexbox gap={12}>
          <SkeletonBar height={14} width={'94%'} />
          <SkeletonBar height={14} width={'88%'} />
          <SkeletonBar height={14} width={'72%'} />
        </Flexbox>

        <Flexbox gap={12}>
          <Flexbox horizontal align={'center'} gap={8}>
            <SkeletonBar height={16} radius={'50%'} width={16} />
            <SkeletonBar height={18} width={112} />
          </Flexbox>
          <Flexbox className={styles.acceptance}>
            {Array.from({ length: 3 }).map((_, index) => (
              <Flexbox key={index}>
                {index > 0 && <div className={styles.divider} />}
                <Flexbox horizontal align={'center'} gap={10} padding={'12px'}>
                  <SkeletonBar height={16} radius={'50%'} width={16} />
                  <SkeletonBar height={12} width={24} />
                  <SkeletonBar height={14} width={`${58 + index * 9}%`} />
                </Flexbox>
              </Flexbox>
            ))}
          </Flexbox>
        </Flexbox>
      </Flexbox>
    </div>
  </Flexbox>
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

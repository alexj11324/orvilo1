'use client';

import { cn } from 'cn';
import { memo } from 'react';

import SkeletonBar from '@/components/Skeleton/Bar';
import NavHeader from '@/features/NavHeader';
import { WorkSurface, WorkSurfaceDocument } from '@/features/WorkSurface';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

import { taskDetailFullPageStyles } from './taskDetailFullPageStyles';
import { taskDetailLayoutStyles as layout } from './taskDetailLayoutStyles';

/** Status, assignee, priority — the three properties every issue shows. */
const PROPERTY_VALUE_WIDTHS = [64, 88, 72];
const DESCRIPTION_LINE_WIDTHS = ['94%', '88%', '72%'];
const BODY_LINE_WIDTHS = ['62%', '48%'];

/**
 * Mirrors `TaskDetailSections` through the same layout classes, so the
 * container query places the skeleton exactly like the loaded issue: the
 * properties wrap into a strip under the title in a narrow pane, and become
 * the labelled 232px rail beside the text in a wide one.
 */
const TaskDetailBodySkeleton = () => (
  <div aria-busy className={cn('flex flex-1 flex-col', layout.root)}>
    <div className={layout.header}>
      <div className={cn('flex flex-col gap-3', layout.main)}>
        {/* Title: 20px type on a 28px line. */}
        <div className="py-1">
          <SkeletonBar height={20} width={'min(520px, 56%)'} />
        </div>
        {/* "Sub-issue of" parent bar: one 28px control line. */}
        <div className="flex h-7 items-center gap-2">
          <SkeletonBar height={12} width={72} />
          <SkeletonBar height={16} radius={'50%'} width={16} />
          <SkeletonBar height={12} width={160} />
        </div>
      </div>

      <div className={layout.side}>
        <div className={layout.propertyGroups}>
          <div className={layout.railSection}>
            {/* Hidden in the narrow strip, like the real "Properties" label. */}
            <span className={layout.railSectionLabel}>
              <SkeletonBar height={12} width={72} />
            </span>
            <div className={layout.properties}>
              {PROPERTY_VALUE_WIDTHS.map((width) => (
                <div className={layout.propertyRow} key={width}>
                  <div className={cn('gap-1.5', layout.propertyValue)}>
                    <SkeletonBar height={16} radius={'50%'} width={16} />
                    <SkeletonBar height={12} width={width} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={cn('flex flex-col gap-3', layout.description)}>
        {DESCRIPTION_LINE_WIDTHS.map((width) => (
          <SkeletonBar height={14} key={width} width={width} />
        ))}
      </div>

      <div className={cn('flex flex-col gap-6', layout.body)}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <SkeletonBar height={16} radius={'50%'} width={16} />
            <SkeletonBar height={14} width={112} />
          </div>
          {BODY_LINE_WIDTHS.map((width) => (
            <SkeletonBar height={14} key={width} width={width} />
          ))}
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

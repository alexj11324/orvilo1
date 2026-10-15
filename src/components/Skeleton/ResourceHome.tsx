'use client';

import { cn } from 'cn';

import SkeletonBar from './Bar';

/**
 * Shared by the route-level skeleton and the sections' own loading state, so
 * the placeholder never swaps shape between chunk load and data load.
 */
export const RESOURCE_HOME_SECTIONS = {
  files: { count: 4, itemHeight: 160, minItemWidth: 180 },
  libraries: { count: 4, itemHeight: 52, minItemWidth: 200 },
  pages: { count: 3, itemHeight: 64, minItemWidth: 240 },
  works: { count: 3, itemHeight: 220, minItemWidth: 260 },
} as const;

interface SectionSkeletonProps {
  count: number;
  itemHeight: number;
  minItemWidth: number;
}

export const ResourceSectionSkeleton = ({
  count,
  itemHeight,
  minItemWidth,
}: SectionSkeletonProps) => (
  <div
    className={'grid gap-3'}
    style={{
      gridTemplateColumns: `repeat(auto-fill, minmax(${minItemWidth}px, 1fr))`,
    }}
  >
    {Array.from({ length: count }).map((_, index) => (
      <SkeletonBar height={itemHeight} key={index} radius={'var(--radius-card)'} />
    ))}
  </div>
);

const styles = {
  content: 'mx-auto w-full px-4 pbs-8 pbe-16',
  header: 'border-be border-divider',
  scroll: 'flex-1 overflow-hidden',
};

const Section = (props: SectionSkeletonProps) => (
  <div className={'flex flex-col gap-3'}>
    <SkeletonBar height={16} width={112} />
    <ResourceSectionSkeleton {...props} />
  </div>
);

const ResourceHomeSkeleton = () => (
  <div aria-busy className={'flex h-full min-h-0 flex-1 flex-col overflow-hidden'}>
    <div className={cn('flex h-11 flex-none items-center justify-between px-4', styles.header)}>
      <SkeletonBar height={14} width={96} />
      <SkeletonBar height={32} radius={'var(--radius-button)'} width={88} />
    </div>
    <div className={styles.scroll}>
      <div className={cn('flex flex-col gap-8', styles.content)}>
        <Section {...RESOURCE_HOME_SECTIONS.libraries} />
        <Section {...RESOURCE_HOME_SECTIONS.works} />
        <Section {...RESOURCE_HOME_SECTIONS.pages} />
        <Section {...RESOURCE_HOME_SECTIONS.files} />
      </div>
    </div>
  </div>
);

export default ResourceHomeSkeleton;

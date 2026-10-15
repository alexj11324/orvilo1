import { clsx as cx } from 'cn';

import SkeletonBar from '@/components/Skeleton/Bar';

const styles = {
  diff: 'w-full max-w-375 mx-auto pbs-4 pbe-12 px-6 [@media(width<=768px)]:px-2',
  file: 'overflow-hidden border border-divider rounded-(--radius-card)',
  fileHeader: 'p-3 border-be border-solid border-divider bg-fill-quaternary',
  main: 'min-w-0',
  overview:
    'grid grid-cols-[minmax(0,1fr)_minmax(200px,24%)] gap-8 w-full max-w-375 mx-auto pbs-6 pbe-6 px-8 [@media(width<=768px)]:grid-cols-[minmax(0,1fr)] [@media(width<=768px)]:gap-6 [@media(width<=768px)]:px-4',
};

const ReviewDetailSkeleton = ({ view }: { view: 'overview' | 'diff' }) =>
  view === 'overview' ? (
    <div aria-busy className={styles.overview}>
      <div className={cx('flex flex-col gap-3', styles.main)}>
        <SkeletonBar height={24} radius={'var(--radius-chip)'} width={'75%'} />
        <div className="flex items-center gap-2">
          <SkeletonBar height={20} radius={'50%'} width={20} />
          <SkeletonBar height={12} radius={'var(--radius-chip)'} width={100} />
          <SkeletonBar height={12} radius={'var(--radius-chip)'} width={160} />
        </div>
        <div className="flex flex-col gap-3 mbs-8">
          <SkeletonBar height={12} radius={'var(--radius-chip)'} width={90} />
          <SkeletonBar height={14} radius={'var(--radius-chip)'} width={'94%'} />
          <SkeletonBar height={14} radius={'var(--radius-chip)'} width={'82%'} />
          <SkeletonBar height={14} radius={'var(--radius-chip)'} width={'65%'} />
        </div>
      </div>
      <div className="flex flex-col gap-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="flex flex-col gap-2" key={index}>
            <SkeletonBar height={12} radius={'var(--radius-chip)'} width={80} />
            <SkeletonBar
              height={14}
              radius={'var(--radius-chip)'}
              width={index === 3 ? '90%' : 130}
            />
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div aria-busy className={cx('flex flex-col gap-4', styles.diff)}>
      {Array.from({ length: 2 }).map((_, index) => (
        <div className={cx('flex flex-col', styles.file)} key={index}>
          <div className={cx('flex flex-col', styles.fileHeader)}>
            <SkeletonBar height={14} radius={'var(--radius-chip)'} width={'min(420px, 65%)'} />
          </div>
          <div className="flex flex-col gap-2.5 p-4">
            <SkeletonBar height={12} radius={'var(--radius-chip)'} width={'88%'} />
            <SkeletonBar height={12} radius={'var(--radius-chip)'} width={'72%'} />
            <SkeletonBar height={12} radius={'var(--radius-chip)'} width={'94%'} />
            <SkeletonBar height={12} radius={'var(--radius-chip)'} width={'58%'} />
          </div>
        </div>
      ))}
    </div>
  );

export default ReviewDetailSkeleton;

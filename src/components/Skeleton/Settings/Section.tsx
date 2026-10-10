'use client';

import { FormGroup } from '@/components/GroupForm';

import SkeletonBar from '../Bar';

const styles = {
  divider: 'h-px w-full bg-divider',
  row: 'flex min-h-16 items-center justify-between gap-6 py-4',
};

const Row = ({ index }: { index: number }) => (
  <div className={styles.row}>
    <div className="flex flex-col gap-2">
      <SkeletonBar height={16} width={112 + (index % 2) * 40} />
      <SkeletonBar height={12} width={224 + (index % 3) * 36} />
    </div>
    <SkeletonBar height={32} width={index % 2 ? 152 : 88} />
  </div>
);

const Group = ({ rows, titleWidth }: { rows: number; titleWidth: number }) => (
  <FormGroup
    collapsible={false}
    title={<SkeletonBar height={18} width={titleWidth} />}
    variant={'filled'}
  >
    <div className="flex flex-col">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="flex flex-col" key={index}>
          {index > 0 && <div className={styles.divider} />}
          <Row index={index} />
        </div>
      ))}
    </div>
  </FormGroup>
);

const SettingsSectionSkeleton = () => (
  <div aria-busy className="flex flex-col gap-9" data-testid={'settings-section-skeleton'}>
    <Group rows={2} titleWidth={104} />
    <Group rows={3} titleWidth={136} />
  </div>
);

export default SettingsSectionSkeleton;

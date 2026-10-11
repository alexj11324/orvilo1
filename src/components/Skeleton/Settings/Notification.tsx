import { FormGroup } from '@/components/GroupForm';

import SkeletonBar from '../Bar';

/** Same grid as `NotificationPreferences`: an event column and one channel column. */
const GRID = 'grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-x-2';

const MatrixRows = () => (
  <div>
    {Array.from({ length: 8 }, (_, row) => (
      <div
        className={`${GRID} ${row === 0 ? 'pb-2' : 'min-h-11 border-t border-border py-2'}`}
        key={row}
      >
        <SkeletonBar height={row === 0 ? 12 : 14} width={row === 0 ? 40 : '45%'} />
        <span className="flex justify-center">
          <SkeletonBar height={row === 0 ? 12 : 16} width={row === 0 ? 48 : row === 1 ? 32 : 16} />
        </span>
      </div>
    ))}
  </div>
);

/** Personal settings: one filled card, like the other personal settings sections. */
const NotificationSettingsSkeleton = () => (
  <FormGroup
    aria-busy
    collapsible={false}
    desc={<SkeletonBar height={14} width={'70%'} />}
    title={<SkeletonBar height={16} width={120} />}
    variant={'filled'}
  >
    <MatrixRows />
  </FormGroup>
);

export default NotificationSettingsSkeleton;

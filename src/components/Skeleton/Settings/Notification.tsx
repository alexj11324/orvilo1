import { FormGroup } from '@/components/GroupForm';

import SkeletonBar from '../Bar';

/** Same grid as `NotificationPreferences`: an event column and two channel columns. */
const GRID = 'grid grid-cols-[minmax(0,1fr)_repeat(2,5.5rem)] items-center gap-x-2';

const MatrixRows = () => (
  <div>
    {Array.from({ length: 8 }, (_, row) => (
      <div
        className={`${GRID} ${row === 0 ? 'pb-2' : 'min-h-11 border-t border-border py-2'}`}
        key={row}
      >
        <SkeletonBar height={row === 0 ? 12 : 14} width={row === 0 ? 40 : '45%'} />
        {[0, 1].map((cell) => (
          <span className="flex justify-center" key={cell}>
            <SkeletonBar
              height={row === 0 ? 12 : 16}
              width={row === 0 ? 48 : row === 1 ? 32 : 16}
            />
          </span>
        ))}
      </div>
    ))}
  </div>
);

/** Personal settings: one filled card, like the other personal settings sections. */
const NotificationSettingsSkeleton = () => (
  <FormGroup
    aria-busy
    collapsible={false}
    title={<SkeletonBar height={16} width={120} />}
    variant={'filled'}
  >
    <MatrixRows />
  </FormGroup>
);

/** Workspace settings: the narrow column with an in-page title. */
export const WorkspaceNotificationSkeleton = () => (
  <div aria-busy className="mx-auto flex w-full max-w-160 flex-col gap-6">
    <SkeletonBar height={24} width={152} />
    <FormGroup collapsible={false} title={<SkeletonBar height={16} width={120} />}>
      <MatrixRows />
    </FormGroup>
  </div>
);

export default NotificationSettingsSkeleton;

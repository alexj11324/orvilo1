import { FormGroup } from '@/components/GroupForm';

import SkeletonBar from '../Bar';

export const NotificationSoundSkeleton = () => (
  <div aria-busy className="mx-auto flex w-full max-w-160 flex-col gap-8">
    {[3, 1].map((rows, index) => (
      <FormGroup key={index} title={<SkeletonBar height={16} width={160} />}>
        {Array.from({ length: rows }, (_, row) => (
          <div className="flex min-h-16 items-center justify-between gap-4 py-2" key={row}>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <SkeletonBar height={14} width="40%" />
              <SkeletonBar height={12} width="90%" />
            </div>
            <SkeletonBar height={28} width={88} />
          </div>
        ))}
      </FormGroup>
    ))}
  </div>
);

const NotificationSettingsSkeleton = ({ workspace = false }: { workspace?: boolean }) => (
  <div aria-busy className="mx-auto flex w-full max-w-160 flex-col gap-8">
    {workspace && <SkeletonBar height={24} width={152} />}
    {[0, 1].map((channel) => (
      <FormGroup
        extra={<SkeletonBar height={18} width={32} />}
        key={channel}
        title={<SkeletonBar height={16} width={144} />}
      >
        <SkeletonBar height={20} width="60%" />
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }, (_, row) => (
            <div className="flex min-h-11 items-center justify-between gap-4 py-3" key={row}>
              <SkeletonBar height={14} width="40%" />
              <SkeletonBar height={18} width={32} />
            </div>
          ))}
        </div>
      </FormGroup>
    ))}
  </div>
);

export const WorkspaceNotificationSkeleton = () => <NotificationSettingsSkeleton workspace />;

export default NotificationSettingsSkeleton;

'use client';

import { type ReactNode } from 'react';

import { FormGroup } from '@/components/GroupForm';
import { useUserStore } from '@/store/user';
import { authSelectors, userProfileSelectors } from '@/store/user/selectors';

import SkeletonBar from '../Bar';

const styles = {
  action: 'ms-auto shrink-0',
  body: 'flex min-w-0 flex-1 items-center justify-between gap-3',
  divider: 'h-px w-full bg-divider',
  label: 'flex-[0_0_160px] [@media(width<=767.98px)]:flex-[0_0_auto]',
  row: 'flex min-h-16 items-center gap-6 py-4 [@media(width<=767.98px)]:flex-col [@media(width<=767.98px)]:items-stretch [@media(width<=767.98px)]:gap-3',
};

interface SettingsProfileRowSkeletonProps {
  action?: boolean;
  actionNode?: ReactNode;
  body?: ReactNode;
  bodyWidth?: number;
  height?: number;
  labelWidth?: number;
}

export const SettingsProfileRowSkeleton = ({
  action = true,
  actionNode,
  body,
  bodyWidth = 160,
  height,
  labelWidth = 80,
}: SettingsProfileRowSkeletonProps) => (
  <div className={styles.row} style={height ? { minHeight: height } : undefined}>
    <div className={styles.label}>
      <SkeletonBar height={14} width={labelWidth} />
    </div>
    <div className={styles.body}>
      {body === undefined ? <SkeletonBar height={14} width={bodyWidth} /> : body}
      {action && (
        <div className={styles.action}>
          {actionNode ?? <SkeletonBar height={32} radius={'var(--radius-button)'} width={80} />}
        </div>
      )}
    </div>
  </div>
);

const INTEREST_WIDTHS = [
  128, 188, 152, 148, 148, 164, 164, 188, 148, 100, 120, 136, 144, 144, 120, 128, 104, 104,
];

const InterestsSkeleton = () => (
  <div className="flex w-full flex-wrap gap-2">
    {INTEREST_WIDTHS.map((width, index) => (
      <SkeletonBar height={32} key={index} radius={'var(--radius-button)'} width={width} />
    ))}
  </div>
);

const SettingsProfileSkeleton = () => {
  const isLogin = useUserStore(authSelectors.isLogin);
  const email = useUserStore(userProfileSelectors.email);

  return (
    <FormGroup
      aria-busy
      collapsible={false}
      data-testid={'settings-profile-skeleton'}
      gap={16}
      title={<SkeletonBar height={16} width={80} />}
      variant={'filled'}
    >
      <div className="flex flex-col">
        <SettingsProfileRowSkeleton
          actionNode={<SkeletonBar height={40} radius={'var(--radius-card)'} width={40} />}
          body={null}
          height={78}
        />
        <div className={styles.divider} />
        <SettingsProfileRowSkeleton action={false} bodyWidth={194} height={68} labelWidth={72} />
        <div className={styles.divider} />
        <SettingsProfileRowSkeleton action={false} bodyWidth={194} height={68} labelWidth={88} />
        <div className={styles.divider} />
        <SettingsProfileRowSkeleton
          action={false}
          body={<InterestsSkeleton />}
          height={210}
          labelWidth={64}
        />
        {isLogin && email && (
          <>
            <div className={styles.divider} />
            <SettingsProfileRowSkeleton bodyWidth={184} height={54} labelWidth={96} />
          </>
        )}
      </div>
    </FormGroup>
  );
};

export default SettingsProfileSkeleton;

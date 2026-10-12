'use client';

import { cn } from 'cn';

import WideScreenContainer from '@/features/WideScreenContainer';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

import SkeletonBar from './Bar';

type ProfileSkeletonVariant = 'agent' | 'group';

interface ProfileSkeletonProps extends RouteSkeletonProps {
  variant?: ProfileSkeletonVariant;
}

const styles = {
  configPanel: 'rounded-(--radius-card) border border-divider bg-muted p-6',
  cover: '-mx-4 h-20 w-[calc(100%+32px)] bg-muted',
  divider: 'h-px w-full bg-divider',
  editor: 'pbs-6 pbe-24',
  header: 'border-be border-divider',
};

const NavigationSkeleton = () => <div className={cn('h-11 flex-none', styles.header)} />;

const EditorPlaceholder = () => (
  <div className={cn('flex flex-col gap-3.5', styles.editor)}>
    <SkeletonBar height={16} width={120} />
    <SkeletonBar height={14} width={'92%'} />
    <SkeletonBar height={14} width={'84%'} />
    <SkeletonBar height={14} width={'66%'} />
  </div>
);

const AgentProfileSkeleton = () => (
  <WideScreenContainer>
    <div className={'mbe-7 flex flex-col'}>
      <div className={'-mx-4 flex flex-col pbs-0 pbe-4'}>
        <div className={styles.cover} />
        <div className={'-mbs-9 flex items-end gap-4 px-6'}>
          <SkeletonBar height={72} radius={'var(--radius-card)'} width={72} />
          <div className={'flex min-w-0 flex-col gap-2 pbe-1'}>
            <SkeletonBar height={36} width={220} />
            <SkeletonBar height={14} width={156} />
          </div>
        </div>
      </div>
      <div className={cn('flex flex-col gap-3.5', styles.configPanel)}>
        <div className={'flex items-center justify-between'}>
          <SkeletonBar height={12} width={96} />
          <SkeletonBar height={12} width={72} />
        </div>
        <div className={'flex gap-2'}>
          <SkeletonBar height={32} width={196} />
          <SkeletonBar height={32} width={112} />
        </div>
      </div>
    </div>
    <EditorPlaceholder />
  </WideScreenContainer>
);

const GroupProfileSkeleton = () => (
  <WideScreenContainer>
    <div className={'flex h-16.5 flex-col justify-center'}>
      <SkeletonBar height={14} width={96} />
    </div>
    <div className={'flex flex-col gap-4 py-4'}>
      <SkeletonBar height={72} radius={'var(--radius-card)'} width={72} />
      <SkeletonBar height={36} width={240} />
    </div>
    <div className={'mbs-4 mbe-7 flex gap-2'}>
      <SkeletonBar height={32} width={132} />
      <SkeletonBar height={32} width={96} />
    </div>
    <div className={styles.divider} />
    <EditorPlaceholder />
  </WideScreenContainer>
);

const ProfileSkeleton = ({ chrome = 'page', variant = 'agent' }: ProfileSkeletonProps) => (
  <div aria-busy className={'flex min-h-0 flex-1 flex-col overflow-hidden'}>
    {chrome !== 'body' && <NavigationSkeleton />}
    <div className={'flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto'}>
      {variant === 'agent' ? <AgentProfileSkeleton /> : <GroupProfileSkeleton />}
    </div>
  </div>
);

export const GroupProfileRouteSkeleton = (props: RouteSkeletonProps) => (
  <ProfileSkeleton variant={'group'} {...props} />
);

export default ProfileSkeleton;

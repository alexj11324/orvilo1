'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';

import WideScreenContainer from '@/features/WideScreenContainer';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

import SkeletonBar from './Bar';

type ProfileSkeletonVariant = 'agent' | 'group';

interface ProfileSkeletonProps extends RouteSkeletonProps {
  variant?: ProfileSkeletonVariant;
}

const styles = createStaticStyles(({ css }) => ({
  configPanel: css`
    padding: 24px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorFillQuaternary};
  `,
  cover: css`
    width: calc(100% + 32px);
    height: 80px;
    margin-inline: -16px;
    background: ${cssVar.colorFillQuaternary};
  `,
  divider: css`
    width: 100%;
    height: 1px;
    background: ${cssVar.colorBorderSecondary};
  `,
  editor: css`
    padding-block: 24px 96px;
  `,
  header: css`
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

const NavigationSkeleton = () => (
  <div className={styles.header} style={{ flex: 'none', height: 44 }} />
);

const EditorPlaceholder = () => (
  <div className={cn('flex flex-col', styles.editor)} style={{ gap: 14 }}>
    <SkeletonBar height={18} width={120} />
    <SkeletonBar height={14} width={'92%'} />
    <SkeletonBar height={14} width={'84%'} />
    <SkeletonBar height={14} width={'66%'} />
  </div>
);

const AgentProfileSkeleton = () => (
  <WideScreenContainer>
    <div className={'flex flex-col'} style={{ marginBottom: 28 }}>
      <div className={'flex flex-col'} style={{ marginInline: -16, paddingBlock: '0 16px' }}>
        <div className={styles.cover} />
        <div className={'flex items-end gap-4 px-6'} style={{ marginTop: -36 }}>
          <SkeletonBar height={72} radius={cssVar.borderRadiusLG} width={72} />
          <div className={'flex flex-col gap-2'} style={{ minWidth: 0, paddingBottom: 4 }}>
            <SkeletonBar height={36} width={220} />
            <SkeletonBar height={14} width={156} />
          </div>
        </div>
      </div>
      <div className={cn('flex flex-col', styles.configPanel)} style={{ gap: 14 }}>
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
    <div className={'flex flex-col justify-center'} style={{ height: 66 }}>
      <SkeletonBar height={14} width={96} />
    </div>
    <div className={'flex flex-col gap-4 py-4'}>
      <SkeletonBar height={72} radius={cssVar.borderRadiusLG} width={72} />
      <SkeletonBar height={36} width={240} />
    </div>
    <div className={'flex gap-2'} style={{ marginBlock: '16px 28px' }}>
      <SkeletonBar height={32} width={132} />
      <SkeletonBar height={32} width={96} />
    </div>
    <div className={styles.divider} />
    <EditorPlaceholder />
  </WideScreenContainer>
);

const ProfileSkeleton = ({ chrome = 'page', variant = 'agent' }: ProfileSkeletonProps) => (
  <div aria-busy className={'flex flex-1 flex-col'} style={{ minHeight: 0, overflow: 'hidden' }}>
    {chrome !== 'body' && <NavigationSkeleton />}
    <div
      className={'flex flex-1 flex-col'}
      style={{ minHeight: 0, overflow: 'hidden', overflowY: 'auto' }}
    >
      {variant === 'agent' ? <AgentProfileSkeleton /> : <GroupProfileSkeleton />}
    </div>
  </div>
);

export const GroupProfileRouteSkeleton = (props: RouteSkeletonProps) => (
  <ProfileSkeleton variant={'group'} {...props} />
);

export default ProfileSkeleton;

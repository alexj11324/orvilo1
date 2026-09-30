'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import type { ReactNode } from 'react';

import WideScreenContainer from '@/features/WideScreenContainer';
import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

import SkeletonBar from './Bar';

const styles = createStaticStyles(({ css }) => ({
  header: css`
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  notice: css`
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorFillQuaternary};
  `,
  tabs: css`
    border-block-end: 1px solid ${cssVar.colorBorder};
  `,
}));

/** Breadcrumb on the left, the profile tab switcher centred — same as `NavHeader` on the page. */
const NavigationSkeleton = () => (
  <div
    className={cn('flex items-center px-4', styles.header)}
    style={{ flex: none, position: 'relative' }}
  >
    <div className={'flex gap-2 items-center'}>
      <SkeletonBar height={20} radius={'50%'} width={20} />
      <SkeletonBar height={14} width={120} />
    </div>
    {/* Mirrors `AGENT_PROFILE_TABS_CENTER_STYLE`: centred on the header midpoint. */}
    <div
      className={'flex flex-col'}
      style={{ left: '50%', position: 'absolute', transform: 'translateX(-50%)' }}
    >
      <SkeletonBar height={28} radius={14} width={280} />
    </div>
  </div>
);

const SettingRowSkeleton = ({ control, index }: { control: 'switch' | 'input'; index: number }) => (
  <div className={'flex gap-4 items-center justify-between'}>
    <div className={'flex flex-col'} style={{ gap: 6 }}>
      <SkeletonBar height={14} width={96 + (index % 3) * 28} />
      <SkeletonBar height={12} width={200 + (index % 2) * 48} />
    </div>
    {control === 'switch' ? (
      <SkeletonBar height={22} radius={11} width={44} />
    ) : (
      <SkeletonBar height={32} width={120} />
    )}
  </div>
);

const SectionSkeleton = ({
  children,
  descWidth = 260,
  titleWidth,
}: {
  children: ReactNode;
  descWidth?: number;
  titleWidth: number;
}) => (
  <div
    className={'flex flex-col gap-4'}
    style={{
      border: `1px solid ${cssVar.colorBorderSecondary}`,
      borderRadius: cssVar.borderRadiusLG,
      padding: 20,
    }}
  >
    <div className={'flex flex-col'} style={{ gap: 6 }}>
      <SkeletonBar height={16} width={titleWidth} />
      <SkeletonBar height={12} width={descWidth} />
    </div>
    {children}
  </div>
);

/**
 * Body of the share settings page: the warning notice, the link card, the
 * access/stats tab strip, then the outlined sections of the default (access)
 * tab — permissions and limits (`Section` in
 * `AgentShareSettings/SectionLayout.tsx`). Reused by the page's own
 * data-loading state so the layout does not jump between route load and share
 * fetch.
 */
export const AgentShareSettingsBodySkeleton = () => (
  <div aria-busy className={'flex flex-col gap-4 py-4'}>
    <div className={cn('flex gap-3', styles.notice)} style={{ padding: '12px 16px' }}>
      <SkeletonBar height={18} radius={'50%'} width={18} />
      <div className={'flex flex-col gap-2 flex-1'}>
        <SkeletonBar height={14} width={160} />
        <SkeletonBar height={12} width={'82%'} />
      </div>
    </div>
    <SectionSkeleton titleWidth={88}>
      <SettingRowSkeleton control={'switch'} index={0} />
      <SkeletonBar height={36} width={'100%'} />
    </SectionSkeleton>
    {/* Mirrors `ShareTabs`: two underline tabs on a hairline. */}
    <div className={cn('flex gap-6', styles.tabs)} style={{ paddingBlock: 10 }}>
      <SkeletonBar height={14} width={64} />
      <SkeletonBar height={14} width={64} />
    </div>
    <SectionSkeleton titleWidth={104}>
      <SettingRowSkeleton control={'switch'} index={1} />
      <SettingRowSkeleton control={'switch'} index={2} />
    </SectionSkeleton>
    <SectionSkeleton titleWidth={80}>
      <SettingRowSkeleton control={'input'} index={3} />
      <SettingRowSkeleton control={'input'} index={4} />
    </SectionSkeleton>
  </div>
);

/** Route-level skeleton for `/agent/:aid/share` (see `agentShareRouteMeta`). */
const AgentShareSkeleton = ({ chrome = 'page' }: RouteSkeletonProps) => (
  <div aria-busy className={'flex flex-col flex-1'} style={{ minHeight: 0, overflow: 'hidden' }}>
    {chrome !== 'body' && <NavigationSkeleton />}
    <div className={'flex flex-col flex-1'} style={{ minHeight: 0, overflow: 'hidden' }}>
      <WideScreenContainer>
        <AgentShareSettingsBodySkeleton />
      </WideScreenContainer>
    </div>
  </div>
);

export default AgentShareSkeleton;

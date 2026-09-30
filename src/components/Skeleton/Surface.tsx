'use client';

import { FormGroup } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import type { ComponentType } from 'react';

import type { RouteSkeletonProps } from '@/spa/router/routeMeta';

import SkeletonBar from './Bar';

export type SurfaceSkeletonVariant = 'detail' | 'editor' | 'form' | 'grid' | 'list';

interface SurfaceSkeletonProps {
  header?: boolean;
  variant?: SurfaceSkeletonVariant;
}

const styles = createStaticStyles(({ css }) => ({
  card: css`
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorFillQuaternary};
  `,
  divider: css`
    width: 100%;
    height: 1px;
    background: ${cssVar.colorBorderSecondary};
  `,
  editor: css`
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  row: css`
    min-height: 64px;
    padding-block: 16px;
  `,
}));

const HeaderSkeleton = () => (
  <div className={'flex items-center justify-between px-4'} style={{ flex: 'none' }}>
    <SkeletonBar height={20} width={144} />
    <SkeletonBar height={28} width={72} />
  </div>
);

const ListSkeleton = () => (
  <div className={'flex flex-col gap-3 p-4'}>
    {Array.from({ length: 5 }).map((_, index) => (
      <div className={cn('flex flex-col p-4', styles.card)} key={index} style={{ gap: 10 }}>
        <div className={'flex gap-2 items-center'}>
          <SkeletonBar height={24} radius={'50%'} width={24} />
          <SkeletonBar height={14} width={96 + (index % 3) * 24} />
        </div>
        <SkeletonBar height={12} width={`${58 + (index % 3) * 12}%`} />
        <SkeletonBar height={12} width={`${42 + (index % 2) * 16}%`} />
      </div>
    ))}
  </div>
);

const FormSkeleton = () => (
  <div className={'flex flex-col items-center p-6'}>
    <FormGroup
      collapsible={false}
      style={{ width: 'min(800px, 100%)' }}
      title={<SkeletonBar height={18} width={112} />}
      variant={'filled'}
    >
      <div className={'flex flex-col'}>
        {Array.from({ length: 3 }).map((_, index) => (
          <div className={'flex flex-col'} key={index}>
            {index > 0 && <div className={styles.divider} />}
            <div className={cn('flex gap-6 items-center justify-between', styles.row)}>
              <div className={'flex flex-col gap-2'}>
                <SkeletonBar height={16} width={112 + index * 24} />
                <SkeletonBar height={12} width={220 + index * 28} />
              </div>
              <SkeletonBar height={32} width={index % 2 ? 152 : 88} />
            </div>
          </div>
        ))}
      </div>
    </FormGroup>
  </div>
);

const GridSkeleton = () => (
  <div
    className={'grid gap-4 p-4'}
    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
  >
    {Array.from({ length: 6 }).map((_, index) => (
      <div className={'flex flex-col gap-3 p-4'} key={index}>
        <SkeletonBar height={120} radius={cssVar.borderRadiusLG} />
        <SkeletonBar height={16} width={'72%'} />
        <SkeletonBar height={12} width={'48%'} />
      </div>
    ))}
  </div>
);

const DetailSkeleton = () => (
  <div className={'flex flex-col items-center'} style={{ padding: '32px 24px' }}>
    <div className={'flex flex-col gap-6'} style={{ width: 'min(960px, 100%)' }}>
      <div className={'flex gap-4 items-center'}>
        <SkeletonBar height={64} radius={'50%'} width={64} />
        <div className={'flex flex-col gap-2 flex-1'}>
          <SkeletonBar height={22} width={'32%'} />
          <SkeletonBar height={14} width={'48%'} />
        </div>
        <SkeletonBar height={36} radius={18} width={104} />
      </div>
      <div className={'flex flex-col gap-2'}>
        <SkeletonBar height={22} radius={11} width={72} />
        <SkeletonBar height={22} radius={11} width={96} />
        <SkeletonBar height={22} radius={11} width={64} />
      </div>
      <div className={'flex flex-col gap-3'}>
        <SkeletonBar height={14} width={'94%'} />
        <SkeletonBar height={14} width={'88%'} />
        <SkeletonBar height={14} width={'62%'} />
        <SkeletonBar height={180} radius={cssVar.borderRadiusLG} />
      </div>
    </div>
  </div>
);

const EditorSkeleton = () => (
  <div className={'flex flex-col items-center flex-1'} style={{ padding: '32px 24px' }}>
    <div
      className={cn('flex flex-col gap-5', styles.editor)}
      style={{ padding: '32px 40px 96px', width: 'min(760px, 100%)' }}
    >
      <SkeletonBar height={28} width={'54%'} />
      <SkeletonBar height={14} width={'92%'} />
      <SkeletonBar height={14} width={'86%'} />
      <SkeletonBar height={14} width={'64%'} />
      <SkeletonBar height={180} radius={12} />
    </div>
  </div>
);

const SurfaceSkeleton = ({ header = true, variant = 'list' }: SurfaceSkeletonProps) => (
  <div aria-busy className={'flex flex-1 flex-col'} style={{ minHeight: 0, overflow: 'hidden' }}>
    {header && <HeaderSkeleton />}
    <div className={'flex flex-1 flex-col'} style={{ minHeight: 0, overflow: 'hidden' }}>
      {variant === 'list' && <ListSkeleton />}
      {variant === 'form' && <FormSkeleton />}
      {variant === 'grid' && <GridSkeleton />}
      {variant === 'editor' && <EditorSkeleton />}
      {variant === 'detail' && <DetailSkeleton />}
    </div>
  </div>
);

const surfaceSkeletonCache = new Map<string, ComponentType<RouteSkeletonProps>>();

export const createSurfaceSkeleton = (variant: SurfaceSkeletonVariant, header = true) => {
  const key = `${variant}:${header}`;
  const cached = surfaceSkeletonCache.get(key);
  if (cached) return cached;

  const Component = ({ chrome = 'page' }: RouteSkeletonProps) => (
    <SurfaceSkeleton header={header && chrome !== 'body'} variant={variant} />
  );
  Component.displayName = `SurfaceSkeleton(${key})`;
  surfaceSkeletonCache.set(key, Component);
  return Component;
};

export default SurfaceSkeleton;

'use client';

import { cssVar } from 'antd-style';

import { isDesktop } from '@/const/version';
import { isMacOS } from '@/utils/platform';

import SkeletonBar from '../Bar';

const isMacDesktop = isDesktop && isMacOS();

export type SideBarHeaderVariant = 'breadcrumb' | 'title';

const headerContentHeight = (variant: SideBarHeaderVariant) => {
  if (variant === 'title') return 32;
  return isMacDesktop ? 22 : 28;
};

export const SideBarHeaderSkeleton = ({
  variant = 'breadcrumb',
}: {
  variant?: SideBarHeaderVariant;
}) => (
  <div className={'flex items-center'} style={{ flex: 'none', padding: '8px 6px' }}>
    <div
      className={'flex flex-col justify-center flex-1'}
      style={{ height: headerContentHeight(variant), paddingInline: 6 }}
    >
      <SkeletonBar height={variant === 'title' ? 18 : 14} width={variant === 'title' ? 96 : 72} />
    </div>
  </div>
);

const SkeletonNavItem = ({ width }: { width: string }) => (
  <div className={'flex gap-2 items-center px-1'} style={{ flex: 'none' }}>
    <div
      className={'flex flex-col items-center justify-center'}
      style={{ flex: 'none', height: 28, width: 28 }}
    >
      <SkeletonBar height={18} radius={cssVar.borderRadiusSM} width={18} />
    </div>
    <div className={'flex flex-col flex-1'}>
      <SkeletonBar height={14} width={width} />
    </div>
  </div>
);

const TITLE_WIDTHS = [56, 72, 48, 64];
const ITEM_WIDTHS = ['62%', '44%', '70%', '52%', '66%', '48%', '58%', '74%'];

const SkeletonRows = ({
  count,
  seed = 0,
  paddingBlock = 1,
  gap = 1,
}: {
  count: number;
  gap?: number;
  paddingBlock?: number;
  seed?: number;
}) => (
  <div className={'flex flex-col'} style={{ gap, paddingBlock }}>
    {Array.from({ length: count }).map((_, index) => (
      <SkeletonNavItem key={index} width={ITEM_WIDTHS[(seed * 3 + index) % ITEM_WIDTHS.length]} />
    ))}
  </div>
);

export interface NavSkeletonShape {
  bodyGap?: number;
  bodyPaddingBlock?: number;
  groups?: number[];
  groupTitleHeight?: number;
  headerVariant?: SideBarHeaderVariant;
  leadingRows?: number;
  navGap?: number;
  navRows?: number;
  search?: boolean;
}

export const NavSideBarSkeleton = ({
  bodyGap = 0,
  bodyPaddingBlock = 0,
  groups,
  groupTitleHeight = 32,
  headerVariant = 'breadcrumb',
  leadingRows = 0,
  navGap = 1,
  navRows = 0,
  search = false,
}: NavSkeletonShape) => {
  const hasBody = search || leadingRows > 0 || !!groups?.length;

  return (
    <div
      className={'flex flex-col'}
      data-testid={'nav-sidebar-skeleton'}
      style={{ gap: 1, height: '100%' }}
    >
      <SideBarHeaderSkeleton variant={headerVariant} />
      {navRows > 0 && (
        <div
          className={'flex flex-col px-1'}
          data-testid={'nav-sidebar-skeleton-nav'}
          style={{ flex: 'none' }}
        >
          <SkeletonRows count={navRows} gap={navGap} paddingBlock={0} />
        </div>
      )}
      {hasBody && (
        <div
          className={'flex flex-col px-1'}
          style={{ overflow: 'hidden', gap: bodyGap, paddingBlock: bodyPaddingBlock }}
        >
          {search && (
            <div className={'flex flex-col px-1'} data-testid={'nav-sidebar-skeleton-search'}>
              <SkeletonBar height={36} />
            </div>
          )}
          {leadingRows > 0 && <SkeletonRows count={leadingRows} paddingBlock={0} />}
          {!!groups?.length && (
            <div className={'flex flex-col gap-2'}>
              {groups.map((rows, groupIndex) => (
                <div className={'flex flex-col'} key={groupIndex}>
                  <div
                    className={'flex flex-col justify-center py-1'}
                    style={{ flex: 'none', height: groupTitleHeight, paddingInline: '8px 4px' }}
                  >
                    <SkeletonBar
                      height={12}
                      width={TITLE_WIDTHS[groupIndex % TITLE_WIDTHS.length]}
                    />
                  </div>
                  {rows > 0 && <SkeletonRows count={rows} seed={groupIndex} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Keyed by the nav keys `resolveNavPanelKey` can actually return. `image` and
// `video` stay even though their routes are gone: a stale deep link still
// resolves to those keys on its way to the SPA, so the pane is not blank while
// that happens. The eval workbench kept no such path — its nav key left the
// resolver when the route was retired, so its shapes went with it.
export const NAV_SKELETON_SHAPES: Record<string, NavSkeletonShape> = {
  agent: { groups: [0, 12], headerVariant: 'title', navRows: 5 },
  discover: { navRows: 6 },
  group: { groups: [3, 8], headerVariant: 'title' },
  home: { bodyGap: 1, groups: [5, 7, 3], headerVariant: 'title', leadingRows: 2, navRows: 2 },
  image: { bodyGap: 1, groups: [4], groupTitleHeight: 40, navGap: 0, navRows: 2 },
  memory: { navRows: 7 },
  page: { bodyGap: 1, groups: [12], headerVariant: 'title', navRows: 1 },
  resource: { bodyPaddingBlock: 8, groups: [5], navRows: 6 },
  resourceLibrary: { bodyPaddingBlock: 8, groups: [6], search: true },
  settings: { bodyGap: 4, groups: [6, 5, 8, 3], groupTitleHeight: 27, search: true },
  video: { bodyGap: 1, groups: [4], groupTitleHeight: 40, navGap: 0, navRows: 2 },
};

export const DEFAULT_NAV_SKELETON_SHAPE: NavSkeletonShape = { groups: [6, 4] };

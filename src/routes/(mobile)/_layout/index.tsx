'use client';

import { type FC } from 'react';
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import WorkspaceContextSlot from '@/business/client/WorkspaceContextSlot';
import Loading from '@/components/Loading/BrandTextLoading';
import { RouteMetaBridge } from '@/features/RouteMeta';
import { stripWorkspaceSlug } from '@/features/Workspace/workspaceAwarePath';
import dynamic from '@/libs/next/dynamic';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

import NavBar from './NavBar';

const CloudBanner = dynamic(() => import('@/features/AlertBanner/CloudBanner'));

/**
 * Root-relative paths that keep the mobile tab bar on screen.
 *
 * Matched *after* dropping a workspace prefix. `useWorkspaceAwareNavigate`
 * mirrors most destinations under `/:workspaceSlug`, so comparing the raw
 * pathname would hide the tab bar inside a workspace — where it is the only
 * navigation a phone viewport gets.
 */
const MOBILE_NAV_ROUTES = new Set(['/', '/inbox', '/me', '/tasks']);

/**
 * Whether the tab bar belongs on this route.
 *
 * Pure so it can be unit-tested without standing up the router or the store —
 * the same reason `buildWorkspaceAwarePath` is extracted.
 */
export const isMobileNavRoute = (
  pathname: string,
  activeSlug: string | null | undefined,
): boolean => MOBILE_NAV_ROUTES.has(stripWorkspaceSlug(pathname, activeSlug));

const MobileMainLayout: FC = () => {
  const { showCloudPromotion } = useServerConfigStore(featureFlagsSelectors);
  const activeSlug = useActiveWorkspaceSlug();
  const { pathname } = useLocation();

  const showNav = isMobileNavRoute(pathname, activeSlug);
  return (
    <WorkspaceContextSlot>
      <RouteMetaBridge />
      <Suspense fallback={null}>{showCloudPromotion && <CloudBanner mobile />}</Suspense>
      <Suspense fallback={<Loading debugId="MobileMainLayout > Outlet" />}>
        <Outlet />
        {showNav && <NavBar />}
      </Suspense>
    </WorkspaceContextSlot>
  );
};

export default MobileMainLayout;

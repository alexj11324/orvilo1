import { SquareUserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { usePublishDynamicRouteMeta } from '@/features/RouteMeta/usePublishDynamicRouteMeta';
import type { DynamicRouteMetaProps } from '@/spa/router/routeMeta';
import { routeMeta } from '@/spa/router/routeMeta';

/**
 * Tabs the page actually exposes — a stray `?tab=` value falls back to
 * Assigned, matching `resolveMode` in MyWorkPage. `tab=delegated` still
 * reaches render as the Activity tab (the delegated chip rides on it), and
 * `tab=review` redirects to `/reviews` — neither is a real My-issues mode.
 */
const MY_ISSUES_MODES = new Set(['assigned', 'created', 'subscribed', 'activity']);

const resolveTitleTab = (tab: string | undefined) => {
  if (tab === 'delegated') return 'activity';
  return tab && MY_ISSUES_MODES.has(tab) ? tab : 'assigned';
};

/**
 * Linear titles the document per tab — `My issues › Assigned`. `params.tab`
 * arrives through `mergeSearchParams`, so the same resolution works on the
 * plain `/my-issues` route and the workspace-scoped mirror.
 */
const MyWorkDynamicMeta = ({ onResolve, params }: DynamicRouteMetaProps) => {
  const { t } = useTranslation('common');
  const tab = resolveTitleTab(params.tab);
  usePublishDynamicRouteMeta(
    { title: `${t('tab.myWork')} › ${t(`myWork.${tab}` as never)}` },
    onResolve,
  );
  return null;
};

MyWorkDynamicMeta.displayName = 'MyWorkDynamicMeta';

export const myWorkRouteMeta = routeMeta({
  DynamicMeta: MyWorkDynamicMeta,
  icon: SquareUserIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'tab.myWork',
});

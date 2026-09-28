'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { mainAreaMetaRoutes } from '@/spa/router/desktopRouter.config';
import { useElectronStore } from '@/store/electron';

import { isRetiredProductUrl } from '../../retiredProductUrl';
import { type ResolvedTab, resolveTab } from '../../TabBar/hooks/useResolvedTabs';

interface UseResolvedPagesResult {
  pinnedPages: ResolvedTab[];
  recentPages: ResolvedTab[];
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

export const useResolvedPages = (): UseResolvedPagesResult => {
  // Route titleKeys live in either `electron` (navigation.*) or `common`
  // (tab.*, navPanel.*) — bind both so either resolves.
  const { t } = useTranslation(['electron', 'common']);

  const pinnedRefs = useElectronStore((s) => s.pinnedPages);
  const recentRefs = useElectronStore((s) => s.recentPages);
  const scope = useElectronStore((s) => s.activeRecentScope);

  const translate = t as unknown as Translate;

  const pinnedPages = useMemo(
    () =>
      pinnedRefs
        .filter((tab) => !isRetiredProductUrl(tab.url, scope))
        .map((tab) => resolveTab(mainAreaMetaRoutes, tab, false, translate)),
    [pinnedRefs, scope, translate],
  );

  const recentPages = useMemo(
    () =>
      recentRefs
        .filter((tab) => !isRetiredProductUrl(tab.url, scope))
        .map((tab) => resolveTab(mainAreaMetaRoutes, tab, false, translate)),
    [recentRefs, scope, translate],
  );

  return { pinnedPages, recentPages };
};

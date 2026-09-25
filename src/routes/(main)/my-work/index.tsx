'use client';

import { memo, useMemo } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router';

/**
 * `/my-work` → `/my-issues` migration (v5 contract). The old tab model maps:
 * - assigned/created/subscribed → same-named tab
 * - delegated → Activity tab + `delegated=1` filter (delegation is a filter,
 *   not a tab — and the activity union restricted to it yields the old set)
 * - review → /reviews?tab=for-me (Reviews owns review work now)
 * - anything else → bare /my-issues
 *
 * The current pathname keeps any `/{slug}` workspace prefix intact.
 */
const MyWorkRedirect = memo(() => {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  const target = useMemo(() => {
    const params = new URLSearchParams();
    const tab = searchParams.get('tab');
    if (tab === 'review') {
      params.set('tab', 'for-me');
      for (const key of ['item', 'id']) {
        const value = searchParams.get(key);
        if (value) params.set(key, value);
      }
      return `${pathname.replace(/my-work\/?$/, 'reviews')}?${params}`;
    }
    if (tab === 'delegated') {
      params.set('tab', 'activity');
      params.set('delegated', '1');
    } else if (
      tab === 'assigned' ||
      tab === 'created' ||
      tab === 'subscribed' ||
      tab === 'activity'
    ) {
      params.set('tab', tab);
    }
    for (const key of ['layout', 'noProject']) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    const query = params.toString();
    const base = pathname.replace(/my-work\/?$/, 'my-issues');
    return query ? `${base}?${query}` : base;
  }, [pathname, searchParams]);

  return <Navigate replace to={target} />;
});

MyWorkRedirect.displayName = 'MyWorkRedirect';

export default MyWorkRedirect;

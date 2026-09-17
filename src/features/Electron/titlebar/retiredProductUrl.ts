import { RETIRED_ROUTE_PREFIXES } from '@/config/routes';

import type { TabScope } from './TabBar/scope';

// Derived from the navigation registry so every retired surface is covered,
// not only the products this file happened to know about.
const RETIRED_PRODUCT_SEGMENTS = new Set(
  [...RETIRED_ROUTE_PREFIXES].map((prefix) => prefix.slice(1)),
);

export const isRetiredProductUrl = (url: string, scope: TabScope): boolean => {
  const pathname = new URL(url, 'https://lobehub.local').pathname;
  const segments = pathname.split('/').filter(Boolean);
  const productSegment =
    scope.type === 'workspace' && segments[0] === scope.slug ? segments[1] : segments[0];

  return !!productSegment && RETIRED_PRODUCT_SEGMENTS.has(productSegment);
};

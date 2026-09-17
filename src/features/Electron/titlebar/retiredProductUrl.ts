import { DEAD_ROUTE_PREFIXES } from '@/config/routes';

import type { TabScope } from './TabBar/scope';

// Derived from the navigation registry so every withdrawn surface is covered,
// while retired-but-resolving prefixes (`/memory`, `/apps`) keep their stored
// references: the tier marks a surface unlisted, not its URLs dead.
const DEAD_PRODUCT_SEGMENTS = new Set([...DEAD_ROUTE_PREFIXES].map((prefix) => prefix.slice(1)));

export const isRetiredProductUrl = (url: string, scope: TabScope): boolean => {
  let pathname: string;
  try {
    pathname = new URL(url, 'https://lobehub.local').pathname;
  } catch {
    return false;
  }

  const segments = pathname.split('/').filter(Boolean);
  const productSegment =
    scope.type === 'workspace' && segments[0] === scope.slug ? segments[1] : segments[0];

  return !!productSegment && DEAD_PRODUCT_SEGMENTS.has(productSegment);
};

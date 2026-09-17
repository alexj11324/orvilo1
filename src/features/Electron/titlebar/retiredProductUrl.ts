import type { TabScope } from './TabBar/scope';

const RETIRED_PRODUCT_SEGMENTS = new Set(['community', 'page']);

export const isRetiredProductUrl = (url: string, scope: TabScope): boolean => {
  const pathname = new URL(url, 'https://orvilo.local').pathname;
  const segments = pathname.split('/').filter(Boolean);
  const productSegment =
    scope.type === 'workspace' && segments[0] === scope.slug ? segments[1] : segments[0];

  return !!productSegment && RETIRED_PRODUCT_SEGMENTS.has(productSegment);
};

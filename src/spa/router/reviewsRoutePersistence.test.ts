import { matchRoutes, type RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';

import { sharedMainAreaChildren as desktopRoutes } from './desktopRouter.shared';
import { sharedMainAreaChildren as mobileRoutes } from './mobileRouter.config';

const routeTree = (children: RouteObject[]): RouteObject[] => [{ children, path: '/' }];

describe.each([
  ['desktop', desktopRoutes],
  ['mobile', mobileRoutes],
] as const)('%s Reviews route identity', (_, routes) => {
  it('uses one mounted route element for collection and selected review URLs', () => {
    const listMatches = matchRoutes(routeTree(routes), '/reviews');
    const detailMatches = matchRoutes(routeTree(routes), '/reviews/review-2');
    const listRoute = listMatches?.find((match) => match.route.path === 'reviews/:reviewId?');
    const detailRoute = detailMatches?.find((match) => match.route.path === 'reviews/:reviewId?');

    expect(listRoute?.route.element).toBeDefined();
    expect(detailRoute?.route).toBe(listRoute?.route);
    expect(detailRoute?.params.reviewId).toBe('review-2');
    expect(listRoute?.route.children).toBeUndefined();
  });
});

'use client';

import { useCallback } from 'react';

import { onboardingSelectors } from '@/store/user/selectors';
import { type UserInitializationState } from '@/types/user';
import { buildOnboardingRedirectUrl } from '@/utils/onboardingRedirect';

const DEFER_REDIRECT_PREFIXES = ['/invite'];

// `/a/:slugOrId` (agent-share visitor page) is deliberately NOT listed: a
// user who followed a share link should reach the shared agent, not be
// bounced into onboarding first.
const RESERVED_FIRST_SEGMENTS = new Set([
  'acceptance',
  'agent',
  'apps',
  'desktop-onboarding',
  'devtools',
  'eval',
  'group',
  'image',
  'invite',
  'inbox',
  'me',
  'members',
  'my-issues',
  'my-work',
  'memory',
  'next-auth',
  'onboarding',
  'projects',
  'resource',
  'reviews',
  'settings',
  'share',
  'signin',
  'signup',
  'subscription',
  'task',
  'tasks',
  'teams',
  'verify',
  'video',
  'views',
]);

const FIRST_SEGMENT_REGEX = /^\/([^/?#]+)/;

const isPathUnder = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const parseFirstSegment = (pathname: string): string | null => {
  const match = pathname.match(FIRST_SEGMENT_REGEX);
  return match ? match[1] : null;
};

/**
 * Defer the onboarding redirect when the path is a workspace-scoped route
 * (first segment is a workspace slug, i.e. not one of the reserved app
 * segments) or an explicitly deferred prefix like `/invite`. Reserved
 * first segments (e.g. `/agent`, `/settings`) fall through to the normal
 * onboarding check.
 */
export const shouldDeferOnboardingRedirect = (pathname: string): boolean => {
  if (DEFER_REDIRECT_PREFIXES.some((prefix) => isPathUnder(pathname, prefix))) return true;

  const first = parseFirstSegment(pathname);

  return !!first && !RESERVED_FIRST_SEGMENTS.has(first);
};

const ONBOARDING_PATH_PREFIXES = ['/onboarding', '/desktop-onboarding'];

const redirectToOnboarding = (currentPath: string, search: string) => {
  // Onboarding surfaces themselves never redirect and never become the
  // callback target — `/desktop-onboarding` is the retired flow's compat
  // redirect, so threading it would bounce the finished user right back.
  if (ONBOARDING_PATH_PREFIXES.some((prefix) => currentPath.startsWith(prefix))) return;

  // Thread the page the user was on so onboarding finish points return there
  window.location.href = buildOnboardingRedirectUrl(currentPath + search);
};

/**
 * One onboarding rule for every client: the server-side `finishedAt` decides,
 * not the viewing platform. Desktop still has a main-process boot gate for the
 * signed-out first paint, but once the user state resolves the renderer
 * applies the same redirect as Web.
 */
export const useUserStateRedirect = () =>
  useCallback((state: UserInitializationState) => {
    const { pathname, search } = window.location;

    if (!onboardingSelectors.needsOnboarding(state)) return;
    if (shouldDeferOnboardingRedirect(pathname)) return;

    redirectToOnboarding(pathname, search);
  }, []);
